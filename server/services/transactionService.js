const { pool } = require('../database');

/**
 * Utility to execute a callback within an atomic PostgreSQL transaction (BEGIN...COMMIT/ROLLBACK)
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * ACC-001: Ingreso
 */
async function executeIncome({ destination_account_id, amount, concept, category = 'Ingresos', date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');
  if (!destination_account_id) throw new Error('Cuenta destino requerida.');

  return await withTransaction(async (client) => {
    const accRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [destination_account_id]);
    const acc = accRes.rows[0];
    if (!acc) throw new Error('Cuenta destino no encontrada.');

    await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, destination_account_id]);

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, destination_account_id, account_id, source, status, transaction_datetime)
       VALUES ($1, 'income', $2, $3, $4, $5, $5, 'manual', 'confirmed', CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, category, concept || 'Ingreso registrado', destination_account_id]
    );
    const txId = txRes.rows[0].id;

    const incomeType = acc.type === 'payroll' ? 'payroll' : 'extraordinary';
    // Use txId as FK so deletion can find the exact row
    await client.query(
      `INSERT INTO incomes (date, amount, type, account_id, source_document_id) VALUES ($1, $2, $3, $4, $5)`,
      [txDate, numAmount, incomeType, destination_account_id, txId]
    );

    return {
      success: true,
      transaction_id: txId,
      new_balance: parseFloat(acc.balance) + numAmount
    };
  });
}

/**
 * ACC-002: Gasto (Con validación de Fondos Insuficientes para cuentas líquidas)
 */
async function executeExpense({ source_account_id, amount, concept, category = 'Otros', date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');
  if (!source_account_id) throw new Error('Cuenta origen requerida.');

  return await withTransaction(async (client) => {
    const accRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [source_account_id]);
    const acc = accRes.rows[0];
    if (!acc) throw new Error('Cuenta origen no encontrada.');

    if (acc.type === 'credit_card') {
      const creditLimit = parseFloat(acc.credit_limit) || 0;
      const newBal = parseFloat(acc.balance) + numAmount;
      const newAvail = creditLimit > 0 ? Math.max(0, creditLimit - newBal) : Math.max(0, parseFloat(acc.available_credit) - numAmount);
      await client.query('UPDATE accounts SET balance = $1, available_credit = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [newBal, newAvail, source_account_id]);
      await client.query("UPDATE debts SET current_balance = current_balance + $1 WHERE type = 'credit_card' AND account_id = $2", [numAmount, source_account_id]);
    } else {
      if (parseFloat(acc.balance) < numAmount) {
        throw new Error('Fondos insuficientes');
      }
      await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, source_account_id]);
    }

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, source_account_id, account_id, source, status, transaction_datetime)
       VALUES ($1, 'expense', $2, $3, $4, $5, $5, 'manual', 'confirmed', CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, category, concept || 'Gasto registrado', source_account_id]
    );

    return {
      success: true,
      transaction_id: txRes.rows[0].id
    };
  });
}

/**
 * TRF-001: Transferencia entre cuentas propias
 */
async function executeTransfer({ source_account_id, destination_account_id, amount, concept = 'Transferencia interna', date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');
  if (!source_account_id || !destination_account_id) throw new Error('Cuenta origen y destino son requeridas.');
  if (parseInt(source_account_id, 10) === parseInt(destination_account_id, 10)) throw new Error('Origen y destino deben ser distintos.');

  return await withTransaction(async (client) => {
    // Lock in consistent numeric order to avoid deadlocks
    const ids = [source_account_id, destination_account_id].map(Number).sort((a, b) => a - b);
    await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [ids[0]]);
    await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [ids[1]]);

    const srcRes = await client.query('SELECT * FROM accounts WHERE id = $1', [source_account_id]);
    const dstRes = await client.query('SELECT * FROM accounts WHERE id = $1', [destination_account_id]);
    const src = srcRes.rows[0];
    const dst = dstRes.rows[0];
    if (!src || !dst) throw new Error('Cuenta origen o destino no encontrada.');

    if (src.type !== 'credit_card' && parseFloat(src.balance) < numAmount) {
      throw new Error('Fondos insuficientes');
    }

    await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, source_account_id]);
    await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, destination_account_id]);

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, source_account_id, destination_account_id, account_id, source, status, transaction_datetime)
       VALUES ($1, 'transfer', $2, 'Transferencias', $3, $4, $5, $4, 'manual', 'confirmed', CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, concept, source_account_id, destination_account_id]
    );

    return {
      success: true,
      transaction_id: txRes.rows[0].id
    };
  });
}

/**
 * CARD-001 / MSI-002: Compra con Tarjeta de Crédito (Una exhibición o MSI)
 */
async function executeCardPurchase({ credit_card_id, amount, concept, category = 'Otros', is_msi = false, msi_months = 1, date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');
  if (!credit_card_id) throw new Error('Tarjeta de crédito requerida.');

  return await withTransaction(async (client) => {
    const accRes = await client.query("SELECT * FROM accounts WHERE id = $1 AND type = 'credit_card' FOR UPDATE", [credit_card_id]);
    const card = accRes.rows[0];
    if (!card) throw new Error('Tarjeta de crédito no encontrada.');

    const creditLimit = parseFloat(card.credit_limit || 0);
    const newBal = parseFloat(card.balance || 0) + numAmount;
    const newAvail = creditLimit > 0 ? Math.max(0, creditLimit - newBal) : Math.max(0, parseFloat(card.available_credit || 0) - numAmount);

    await client.query('UPDATE accounts SET balance = $1, available_credit = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [newBal, newAvail, credit_card_id]);

    // Sync debts table (secondary / display source)
    await client.query("UPDATE debts SET current_balance = current_balance + $1 WHERE type = 'credit_card' AND account_id = $2", [numAmount, credit_card_id]);

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, source_account_id, account_id, source, status, transaction_datetime)
       VALUES ($1, 'card_purchase', $2, $3, $4, $5, $5, 'manual', 'confirmed', CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, category, concept || 'Compra con tarjeta', credit_card_id]
    );
    const txId = txRes.rows[0].id;

    let msiPlan = null;
    if (is_msi && parseInt(msi_months, 10) > 1) {
      const months = parseInt(msi_months, 10);
      const monthlyInstallment = parseFloat((numAmount / months).toFixed(2));

      // Resolve linked debt_id
      const debtRes = await client.query("SELECT id FROM debts WHERE type = 'credit_card' AND account_id = $1 LIMIT 1", [credit_card_id]);
      const debtId = debtRes.rows[0]?.id || null;

      const msiRes = await client.query(
        `INSERT INTO installment_plans (
          credit_card_id, account_id, debt_id, transaction_id, concept, total_amount, original_amount,
          monthly_amount, installments_total, installments_paid, installments_remaining, remaining_balance, remaining_principal, purchase_date, status
        ) VALUES ($1, $1, $2, $3, $4, $5, $5, $6, $7, 0, $7, $5, $5, $8, 'active') RETURNING *`,
        [credit_card_id, debtId, txId, concept, numAmount, monthlyInstallment, months, txDate]
      );
      msiPlan = msiRes.rows[0];
    }

    return {
      success: true,
      transaction_id: txId,
      card_balance: newBal,
      available_credit: newAvail,
      msi_plan: msiPlan
    };
  });
}

/**
 * CARD-002: Pago de Tarjeta de Crédito (Con avance multi-plan de MSI automático y trazabilidad completa)
 *
 * Regla de avance MSI:
 *   Itera sobre todos los planes MSI activos de la tarjeta (ordenados por fecha de compra más antigua).
 *   Para cada plan, si el pago cubre la mensualidad exigible, se avanza 1 cuota (installments_paid++).
 *   El detalle de planes avanzados se guarda en transactions.notes para permitir reversión exacta al 100%.
 */
async function executeCardPayment({ source_account_id, credit_card_id, amount, concept = 'Pago de tarjeta', date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');
  if (!source_account_id) throw new Error('Cuenta origen requerida.');
  if (!credit_card_id) throw new Error('Tarjeta de crédito requerida.');

  return await withTransaction(async (client) => {
    // Lock in consistent order to avoid deadlocks
    const ids = [source_account_id, credit_card_id].map(Number).sort((a, b) => a - b);
    await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [ids[0]]);
    await client.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [ids[1]]);

    const srcRes = await client.query('SELECT * FROM accounts WHERE id = $1', [source_account_id]);
    const cardRes = await client.query("SELECT * FROM accounts WHERE id = $1 AND type = 'credit_card'", [credit_card_id]);
    const src = srcRes.rows[0];
    const card = cardRes.rows[0];
    if (!src) throw new Error('Cuenta origen no encontrada.');
    if (!card) throw new Error('Tarjeta de crédito no encontrada.');

    if (src.type !== 'credit_card' && parseFloat(src.balance) < numAmount) {
      throw new Error('Fondos insuficientes en la cuenta de origen.');
    }

    // Deduct from source liquid account
    await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, source_account_id]);

    // Reduce card balance & restore available credit
    const creditLimit = parseFloat(card.credit_limit || 0);
    const newCardBal = Math.max(0, parseFloat(card.balance || 0) - numAmount);
    const newAvail = creditLimit > 0
      ? Math.min(creditLimit, creditLimit - newCardBal)
      : Math.min(creditLimit, parseFloat(card.available_credit || 0) + numAmount);

    await client.query('UPDATE accounts SET balance = $1, available_credit = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [newCardBal, newAvail, credit_card_id]);

    // Sync debts table
    await client.query("UPDATE debts SET current_balance = GREATEST(0, current_balance - $1) WHERE type = 'credit_card' AND account_id = $2", [numAmount, credit_card_id]);

    // MSI Advancement: iterate through all active plans for this card ordered by purchase_date ASC, id ASC
    const msiRes = await client.query(
      `SELECT * FROM installment_plans
       WHERE (credit_card_id = $1 OR account_id = $1)
         AND status = 'active'
         AND installments_paid < installments_total
       ORDER BY purchase_date ASC NULLS LAST, id ASC`,
      [credit_card_id]
    );

    let paymentPool = numAmount;
    const msiAdvancements = [];

    for (const plan of msiRes.rows) {
      const monthly = parseFloat(plan.monthly_amount);
      const totalInst = parseInt(plan.installments_total, 10) || 12;
      const currentPaid = parseInt(plan.installments_paid, 10) || 0;
      const remInst = Math.max(0, totalInst - currentPaid);

      if (paymentPool >= monthly && remInst > 0) {
        const newPaid = currentPaid + 1;
        const newRemaining = Math.max(0, totalInst - newPaid);
        const newRemBal = parseFloat((monthly * newRemaining).toFixed(2));

        await client.query(
          `UPDATE installment_plans
           SET installments_paid = $1,
               installments_remaining = $2,
               remaining_balance = $3,
               remaining_principal = $3,
               status = CASE WHEN $2 = 0 THEN 'completed' ELSE 'active' END
           WHERE id = $4`,
          [newPaid, newRemaining, newRemBal, plan.id]
        );

        msiAdvancements.push({
          plan_id: plan.id,
          concept: plan.concept,
          monthly_amount: monthly,
          previous_paid: currentPaid,
          new_paid: newPaid,
          new_remaining: newRemaining,
          new_balance: newRemBal
        });

        paymentPool -= monthly;
      }
    }

    const notesPayload = JSON.stringify({ msi_advancements: msiAdvancements });

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, source_account_id, destination_account_id, account_id, source, status, notes, transaction_datetime)
       VALUES ($1, 'card_payment', $2, 'Pago de Deuda', $3, $4, $5, $4, 'manual', 'confirmed', $6, CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, concept, source_account_id, credit_card_id, notesPayload]
    );

    return {
      success: true,
      transaction_id: txRes.rows[0].id,
      msi_advancements: msiAdvancements
    };
  });
}

/**
 * INV-001: Aporte a Inversión
 */
async function executeInvestmentContribution({ source_account_id, investment_id, amount, concept = 'Aportación a inversión', date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');

  return await withTransaction(async (client) => {
    const srcRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [source_account_id]);
    const invRes = await client.query('SELECT * FROM investments WHERE id = $1 FOR UPDATE', [investment_id]);
    const src = srcRes.rows[0];
    const inv = invRes.rows[0];
    if (!src || !inv) throw new Error('Cuenta origen o inversión no encontrada.');

    if (src.type !== 'credit_card' && parseFloat(src.balance) < numAmount) {
      throw new Error('Fondos insuficientes');
    }

    await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, source_account_id]);

    const newCap = parseFloat(inv.capital_contributed || inv.invested_amount || 0) + numAmount;
    const newVal = parseFloat(inv.current_value || inv.current_documented_value || 0) + numAmount;

    await client.query(
      `UPDATE investments SET
        capital_contributed = $1, invested_amount = $1,
        current_value = $2, current_documented_value = $2,
        last_update = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [newCap, newVal, txDate, investment_id]
    );

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, source_account_id, destination_investment_id, account_id, source, status, transaction_datetime)
       VALUES ($1, 'investment_contribution', $2, 'Inversiones', $3, $4, $5, $4, 'manual', 'confirmed', CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, concept, source_account_id, investment_id]
    );

    return {
      success: true,
      transaction_id: txRes.rows[0].id
    };
  });
}

/**
 * INV-002: Retiro de Inversión
 */
async function executeInvestmentWithdrawal({ investment_id, destination_account_id, amount, concept = 'Retiro de inversión', date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');

  return await withTransaction(async (client) => {
    const invRes = await client.query('SELECT * FROM investments WHERE id = $1 FOR UPDATE', [investment_id]);
    const dstRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [destination_account_id]);
    const inv = invRes.rows[0];
    const dst = dstRes.rows[0];
    if (!inv || !dst) throw new Error('Inversión o cuenta destino no encontrada.');

    const currentVal = parseFloat(inv.current_value || inv.current_documented_value || 0);
    if (currentVal < numAmount) throw new Error('El monto a retirar supera el valor actual de la inversión.');

    const newVal = currentVal - numAmount;
    const newWithdrawals = parseFloat(inv.withdrawals_total || 0) + numAmount;

    await client.query(
      `UPDATE investments SET
        current_value = $1, current_documented_value = $1,
        withdrawals_total = $2, last_update = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [newVal, newWithdrawals, txDate, investment_id]
    );

    await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, destination_account_id]);

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, source_investment_id, destination_account_id, account_id, source, status, transaction_datetime)
       VALUES ($1, 'investment_withdrawal', $2, 'Inversiones', $3, $4, $5, $5, 'manual', 'confirmed', CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, concept, investment_id, destination_account_id]
    );

    return {
      success: true,
      transaction_id: txRes.rows[0].id,
      loss: 0,
      gain: 0
    };
  });
}

/**
 * INV-003: Valuación de Inversión (ajuste de mercado, sin movimiento de liquidez)
 */
async function executeInvestmentValuation({ investment_id, new_current_value, concept = 'Revaluación de mercado', date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const newVal = parseFloat(new_current_value);
  if (isNaN(newVal) || newVal < 0) throw new Error('El nuevo valor documentado debe ser un número no negativo.');

  return await withTransaction(async (client) => {
    const invRes = await client.query('SELECT * FROM investments WHERE id = $1 FOR UPDATE', [investment_id]);
    const inv = invRes.rows[0];
    if (!inv) throw new Error('Inversión no encontrada.');

    const oldVal = parseFloat(inv.current_value || inv.current_documented_value || 0);
    const variance = newVal - oldVal;

    await client.query(
      `UPDATE investments SET
        current_value = $1, current_documented_value = $1,
        last_update = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newVal, txDate, investment_id]
    );

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, source_investment_id, source, status, notes, transaction_datetime)
       VALUES ($1, 'investment_valuation', $2, 'Inversiones', $3, $4, 'manual', 'confirmed', $5, CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, Math.abs(variance), concept, investment_id, JSON.stringify({ old_value: oldVal, new_value: newVal, variance })]
    );

    return {
      success: true,
      transaction_id: txRes.rows[0].id,
      old_value: oldVal,
      new_value: newVal,
      variance,
      type: variance >= 0 ? 'gain' : 'loss'
    };
  });
}

/**
 * Queries transactions with dynamic filters (PostgreSQL native $N params)
 */
async function getTransactions(filters = {}) {
  const { type, category, account_id, concept } = filters;
  const sDate = filters.start_date || filters.startDate;
  const eDate = filters.end_date || filters.endDate;
  let sql = 'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE 1=1';
  const params = [];
  let idx = 1;

  if (type && type !== 'all') { sql += ` AND t.type = $${idx++}`; params.push(type); }
  if (category) { sql += ` AND t.category = $${idx++}`; params.push(category); }
  if (account_id) { sql += ` AND t.account_id = $${idx++}`; params.push(account_id); }
  if (concept) { sql += ` AND t.concept ILIKE $${idx++}`; params.push(`%${concept}%`); }
  if (sDate) { sql += ` AND t.date >= $${idx++}`; params.push(sDate); }
  if (eDate) { sql += ` AND t.date <= $${idx++}`; params.push(eDate); }

  sql += ' ORDER BY t.date DESC, t.id DESC';
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Unified transaction router — single entry point for all financial operations
 */
async function processGenericTransaction(data) {
  const { type, account_id, destination_account_id, source_account_id, credit_card_id, investment_id, amount, concept, category, is_msi, msi_months, date } = data;
  const srcId = source_account_id || account_id;
  const dstId = destination_account_id || account_id;

  if (type === 'income') {
    return await executeIncome({ destination_account_id: dstId, amount, concept, category, date });
  } else if (type === 'expense') {
    return await executeExpense({ source_account_id: srcId, amount, concept, category, date });
  } else if (type === 'transfer') {
    return await executeTransfer({ source_account_id: srcId, destination_account_id: dstId, amount, concept, date });
  } else if (type === 'card_purchase') {
    return await executeCardPurchase({ credit_card_id: credit_card_id || srcId, amount, concept, category, is_msi, msi_months, date });
  } else if (type === 'card_payment' || type === 'payment') {
    return await executeCardPayment({ source_account_id: srcId, credit_card_id: credit_card_id || dstId, amount, concept, date });
  } else if (type === 'investment_contribution' || type === 'investment_deposit') {
    return await executeInvestmentContribution({ source_account_id: srcId, investment_id, amount, concept, date });
  } else if (type === 'investment_withdrawal') {
    return await executeInvestmentWithdrawal({ investment_id, destination_account_id: dstId, amount, concept, date });
  } else {
    return await executeExpense({ source_account_id: srcId, amount, concept, category, date });
  }
}

/**
 * Reverts a transaction safely with FULL support for all transaction types — ACID guaranteed
 */
async function deleteTransactionSafely(transactionId) {
  return await withTransaction(async (client) => {
    const txRes = await client.query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [transactionId]);
    const tx = txRes.rows[0];
    if (!tx) throw new Error('Transacción no encontrada.');

    const amount = parseFloat(tx.amount || 0);

    if (tx.type === 'income') {
      if (tx.destination_account_id) {
        await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.destination_account_id]);
      }
      // Delete by FK first; fallback for legacy rows without FK
      const del1 = await client.query('DELETE FROM incomes WHERE source_document_id = $1', [transactionId]);
      if (del1.rowCount === 0 && tx.destination_account_id) {
        await client.query(
          'DELETE FROM incomes WHERE id = (SELECT id FROM incomes WHERE account_id = $1 AND amount = $2 AND date = $3 AND source_document_id IS NULL ORDER BY id DESC LIMIT 1)',
          [tx.destination_account_id, amount, tx.date]
        );
      }

    } else if (tx.type === 'expense') {
      if (tx.source_account_id) {
        const accRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [tx.source_account_id]);
        const acc = accRes.rows[0];
        if (acc && acc.type === 'credit_card') {
          const creditLimit = parseFloat(acc.credit_limit || 0);
          const newBal = Math.max(0, parseFloat(acc.balance || 0) - amount);
          const newAvail = creditLimit > 0 ? Math.min(creditLimit, creditLimit - newBal) : parseFloat(acc.available_credit || 0) + amount;
          await client.query('UPDATE accounts SET balance = $1, available_credit = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [newBal, newAvail, tx.source_account_id]);
          await client.query("UPDATE debts SET current_balance = GREATEST(0, current_balance - $1) WHERE type = 'credit_card' AND account_id = $2", [amount, tx.source_account_id]);
        } else if (acc) {
          await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.source_account_id]);
        }
      }

    } else if (tx.type === 'transfer') {
      if (tx.source_account_id) {
        await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.source_account_id]);
      }
      if (tx.destination_account_id) {
        await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.destination_account_id]);
      }

    } else if (tx.type === 'card_purchase') {
      const cardId = tx.source_account_id || tx.account_id;
      if (cardId) {
        const cardRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [cardId]);
        const card = cardRes.rows[0];
        if (card) {
          const creditLimit = parseFloat(card.credit_limit || 0);
          const newBal = Math.max(0, parseFloat(card.balance || 0) - amount);
          const newAvail = creditLimit > 0 ? Math.min(creditLimit, creditLimit - newBal) : parseFloat(card.available_credit || 0) + amount;
          await client.query('UPDATE accounts SET balance = $1, available_credit = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [newBal, newAvail, cardId]);
          await client.query("UPDATE debts SET current_balance = GREATEST(0, current_balance - $1) WHERE type = 'credit_card' AND account_id = $2", [amount, cardId]);
        }
      }
      // Remove associated MSI plan if this was an MSI purchase
      await client.query('DELETE FROM installment_plans WHERE transaction_id = $1', [transactionId]);

    } else if (tx.type === 'card_payment') {
      // Restore source liquid account
      if (tx.source_account_id) {
        await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.source_account_id]);
      }
      // Restore card balance & reduce available credit
      const cardId = tx.destination_account_id;
      if (cardId) {
        const cardRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [cardId]);
        const card = cardRes.rows[0];
        if (card) {
          const creditLimit = parseFloat(card.credit_limit || 0);
          const newBal = parseFloat(card.balance || 0) + amount;
          const newAvail = creditLimit > 0 ? Math.max(0, creditLimit - newBal) : Math.max(0, parseFloat(card.available_credit || 0) - amount);
          await client.query('UPDATE accounts SET balance = $1, available_credit = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [newBal, newAvail, cardId]);
          await client.query("UPDATE debts SET current_balance = current_balance + $1 WHERE type = 'credit_card' AND account_id = $2", [amount, cardId]);
        }
      }

      // Revert MSI plan advancements if recorded in notes
      if (tx.notes) {
        try {
          const parsedNotes = typeof tx.notes === 'string' ? JSON.parse(tx.notes) : tx.notes;
          if (parsedNotes && Array.isArray(parsedNotes.msi_advancements)) {
            for (const adv of parsedNotes.msi_advancements) {
              const pRes = await client.query('SELECT * FROM installment_plans WHERE id = $1 FOR UPDATE', [adv.plan_id]);
              const plan = pRes.rows[0];
              if (plan) {
                const totalInst = parseInt(plan.installments_total, 10) || 12;
                const revertedPaid = Math.max(0, (parseInt(plan.installments_paid, 10) || 0) - 1);
                const revertedRemaining = Math.min(totalInst, totalInst - revertedPaid);
                const monthly = parseFloat(plan.monthly_amount);
                const revertedBal = parseFloat((monthly * revertedRemaining).toFixed(2));

                await client.query(
                  `UPDATE installment_plans
                   SET installments_paid = $1,
                       installments_remaining = $2,
                       remaining_balance = $3,
                       remaining_principal = $3,
                       status = 'active'
                   WHERE id = $4`,
                  [revertedPaid, revertedRemaining, revertedBal, plan.id]
                );
              }
            }
          }
        } catch (e) {
          console.error('Error revirtiendo avances de MSI en deleteTransactionSafely:', e);
        }
      }

    } else if (tx.type === 'investment_contribution' || tx.type === 'investment_deposit') {
      if (tx.source_account_id) {
        await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.source_account_id]);
      }
      if (tx.destination_investment_id) {
        await client.query(
          `UPDATE investments SET
            capital_contributed = GREATEST(0, capital_contributed - $1),
            invested_amount = GREATEST(0, invested_amount - $1),
            current_value = GREATEST(0, current_value - $1),
            current_documented_value = GREATEST(0, current_documented_value - $1),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [amount, tx.destination_investment_id]
        );
      }

    } else if (tx.type === 'investment_withdrawal') {
      if (tx.destination_account_id) {
        await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.destination_account_id]);
      }
      if (tx.source_investment_id) {
        await client.query(
          `UPDATE investments SET
            current_value = current_value + $1,
            current_documented_value = current_documented_value + $1,
            withdrawals_total = GREATEST(0, withdrawals_total - $1),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [amount, tx.source_investment_id]
        );
      }

    } else if (tx.type === 'investment_valuation' || tx.type === 'valuation') {
      if (tx.source_investment_id && tx.notes) {
        try {
          const noteData = typeof tx.notes === 'string' ? JSON.parse(tx.notes) : tx.notes;
          if (noteData && noteData.old_value !== undefined) {
            await client.query(
              `UPDATE investments SET
                current_value = $1, current_documented_value = $1, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [parseFloat(noteData.old_value), tx.source_investment_id]
            );
          }
        } catch (_) {
          // Notes not parseable — valuation revert skipped safely
        }
      }
    }

    await client.query('DELETE FROM transactions WHERE id = $1', [transactionId]);
    return { success: true, message: 'Transacción eliminada y saldo revertido correctamente.' };
  });
}

/**
 * Deletes an account safely with strict child-table cascade order — ACID
 */
async function deleteAccountSafely(accountId) {
  return await withTransaction(async (client) => {
    const accRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
    const acc = accRes.rows[0];
    if (!acc) throw new Error('Cuenta no encontrada.');

    await client.query('DELETE FROM installment_plans WHERE account_id = $1 OR credit_card_id = $1', [accountId]);
    await client.query("DELETE FROM debts WHERE account_id = $1 OR (type = 'credit_card' AND id = $1)", [accountId]);
    await client.query('DELETE FROM incomes WHERE account_id = $1', [accountId]);
    await client.query('DELETE FROM transactions WHERE account_id = $1 OR source_account_id = $1 OR destination_account_id = $1', [accountId]);
    await client.query('DELETE FROM accounts WHERE id = $1', [accountId]);

    return { success: true, message: 'Cuenta y sus registros dependientes eliminados de forma segura.' };
  });
}

/**
 * Deletes a credit card debt / loan safely — ACID
 */
async function deleteDebtSafely(debtId) {
  return await withTransaction(async (client) => {
    const debtRes = await client.query('SELECT * FROM debts WHERE id = $1 FOR UPDATE', [debtId]);
    const debt = debtRes.rows[0];
    if (!debt) return { success: true, message: 'Deuda no encontrada.' };

    const targetAccId = debt.account_id;

    await client.query('DELETE FROM installment_plans WHERE debt_id = $1 OR (account_id IS NOT NULL AND account_id = $2)', [debtId, targetAccId]);
    await client.query('DELETE FROM debt_payments WHERE debt_id = $1', [debtId]);
    await client.query('DELETE FROM debts WHERE id = $1', [debtId]);

    if (targetAccId) {
      await client.query('DELETE FROM installment_plans WHERE account_id = $1 OR credit_card_id = $1', [targetAccId]);
      await client.query('DELETE FROM debts WHERE account_id = $1', [targetAccId]);
      await client.query('DELETE FROM incomes WHERE account_id = $1', [targetAccId]);
      await client.query('DELETE FROM transactions WHERE account_id = $1 OR source_account_id = $1 OR destination_account_id = $1', [targetAccId]);
      await client.query("DELETE FROM accounts WHERE id = $1 AND type = 'credit_card'", [targetAccId]);
    }

    return { success: true, message: 'Deuda y registros asociados eliminados de forma segura.' };
  });
}

module.exports = {
  withTransaction,
  executeIncome,
  executeExpense,
  executeTransfer,
  executeCardPurchase,
  executeCardPayment,
  executeInvestmentContribution,
  executeInvestmentWithdrawal,
  executeInvestmentValuation,
  getTransactions,
  processGenericTransaction,
  deleteTransactionSafely,
  deleteAccountSafely,
  deleteDebtSafely
};
