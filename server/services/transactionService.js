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
    const accRes = await client.query('SELECT * FROM accounts WHERE id = $1', [destination_account_id]);
    const acc = accRes.rows[0];
    if (!acc) throw new Error('Cuenta destino no encontrada.');

    await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, destination_account_id]);

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, destination_account_id, account_id, source, status, transaction_datetime)
       VALUES ($1, 'income', $2, $3, $4, $5, $5, 'manual', 'confirmed', CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, category, concept || 'Ingreso registrado', destination_account_id]
    );

    const incomeType = acc.type === 'payroll' ? 'payroll' : 'extraordinary';
    await client.query(
      `INSERT INTO incomes (date, amount, type, account_id) VALUES ($1, $2, $3, $4)`,
      [txDate, numAmount, incomeType, destination_account_id]
    );

    return {
      success: true,
      transaction_id: txRes.rows[0].id,
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
    } else {
      // Liquid account validation
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
 * TRF-001: Transferencia entre cuentas propias (Con validación de Fondos Insuficientes)
 */
async function executeTransfer({ source_account_id, destination_account_id, amount, concept = 'Transferencia interna', date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');
  if (!source_account_id || !destination_account_id) throw new Error('Cuenta origen y destino son requeridas.');
  if (source_account_id === destination_account_id) throw new Error('Origen y destino deben ser distintos.');

  return await withTransaction(async (client) => {
    const srcRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [source_account_id]);
    const dstRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [destination_account_id]);
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
 * CARD-001 / MSI-002: Compra con Tarjeta de Crédito (Una exhibición o MSI, relacionando estrictamente por IDs)
 */
async function executeCardPurchase({ credit_card_id, amount, concept, category = 'Otros', is_msi = false, msi_months = 1, date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');

  return await withTransaction(async (client) => {
    const accRes = await client.query("SELECT * FROM accounts WHERE id = $1 AND type = 'credit_card' FOR UPDATE", [credit_card_id]);
    const card = accRes.rows[0];
    if (!card) throw new Error('Tarjeta de crédito no encontrada.');

    const creditLimit = parseFloat(card.credit_limit || 0);
    const newBal = parseFloat(card.balance || 0) + numAmount;
    const newAvail = creditLimit > 0 ? Math.max(0, creditLimit - newBal) : Math.max(0, parseFloat(card.available_credit || 0) - numAmount);

    await client.query('UPDATE accounts SET balance = $1, available_credit = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [newBal, newAvail, credit_card_id]);

    // Update debts table using account_id (strict ID relation, zero string matching)
    await client.query("UPDATE debts SET current_balance = current_balance + $1 WHERE type = 'credit_card' AND account_id = $2", [numAmount, credit_card_id]);

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, source_account_id, account_id, source, status, transaction_datetime)
       VALUES ($1, 'card_purchase', $2, $3, $4, $5, $5, 'manual', 'confirmed', CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, category, concept || 'Compra con tarjeta', credit_card_id]
    );
    const txId = txRes.rows[0].id;

    let msiPlan = null;
    if (is_msi && msi_months > 1) {
      const monthlyInstallment = parseFloat((numAmount / msi_months).toFixed(2));
      const msiRes = await client.query(
        `INSERT INTO installment_plans (
          credit_card_id, account_id, transaction_id, concept, total_amount, original_amount, 
          monthly_amount, installments_total, installments_paid, installments_remaining, remaining_balance, remaining_principal, purchase_date, status
        ) VALUES ($1, $1, $2, $3, $4, $4, $5, $6, 0, $6, $4, $4, $7, 'active') RETURNING *`,
        [credit_card_id, txId, concept, numAmount, monthlyInstallment, msi_months, txDate]
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
 * CARD-002: Pago de Tarjeta de Crédito (Con validación de Fondos Insuficientes en cuenta origen)
 */
async function executeCardPayment({ source_account_id, credit_card_id, amount, concept = 'Pago de tarjeta', date }) {
  const txDate = date || new Date().toISOString().split('T')[0];
  const numAmount = parseFloat(amount);
  if (!numAmount || numAmount <= 0) throw new Error('El monto debe ser positivo.');

  return await withTransaction(async (client) => {
    const srcRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [source_account_id]);
    const cardRes = await client.query("SELECT * FROM accounts WHERE id = $1 AND type = 'credit_card' FOR UPDATE", [credit_card_id]);
    const src = srcRes.rows[0];
    const card = cardRes.rows[0];
    if (!src || !card) throw new Error('Cuenta origen o tarjeta de crédito no encontrada.');

    // Liquid account validation
    if (src.type !== 'credit_card' && parseFloat(src.balance) < numAmount) {
      throw new Error('Fondos insuficientes');
    }

    // Reduce liquid account
    await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, source_account_id]);

    // Reduce credit card debt & restore available credit
    const creditLimit = parseFloat(card.credit_limit || 0);
    const newCardBal = Math.max(0, parseFloat(card.balance || 0) - numAmount);
    const newAvail = creditLimit > 0 ? Math.min(creditLimit, creditLimit - newCardBal) : Math.min(creditLimit, parseFloat(card.available_credit || 0) + numAmount);

    await client.query('UPDATE accounts SET balance = $1, available_credit = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3', [newCardBal, newAvail, credit_card_id]);

    // Update debts table using strict account_id relation
    await client.query("UPDATE debts SET current_balance = GREATEST(0, current_balance - $1) WHERE type = 'credit_card' AND account_id = $2", [numAmount, credit_card_id]);

    const txRes = await client.query(
      `INSERT INTO transactions (date, type, amount, category, concept, source_account_id, destination_account_id, account_id, source, status, transaction_datetime)
       VALUES ($1, 'card_payment', $2, 'Pago de Deuda', $3, $4, $5, $4, 'manual', 'confirmed', CURRENT_TIMESTAMP) RETURNING id`,
      [txDate, numAmount, concept, source_account_id, credit_card_id]
    );

    return {
      success: true,
      transaction_id: txRes.rows[0].id
    };
  });
}

/**
 * INV-001: Aporte a Inversión (Con validación de Fondos Insuficientes en cuenta líquida)
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

    // Liquid account validation
    if (src.type !== 'credit_card' && parseFloat(src.balance) < numAmount) {
      throw new Error('Fondos insuficientes');
    }

    // Reduce liquid account
    await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [numAmount, source_account_id]);

    // Increase investment capital & current value
    const newCap = parseFloat(inv.capital_contributed || inv.invested_amount || 0) + numAmount;
    const newVal = parseFloat(inv.current_value || inv.current_documented_value || 0) + numAmount;

    await client.query(
      `UPDATE investments SET 
        capital_contributed = $1, 
        invested_amount = $1, 
        current_value = $2, 
        current_documented_value = $2, 
        last_update = $3, 
        updated_at = CURRENT_TIMESTAMP 
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
 * INV-002 / INV-005: Retiro de Inversión (Mueve dinero hacia cuenta líquida destino; NO es pérdida ni ganancia por sí mismo)
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

    // Reduce investment value & increase withdrawals_total
    const newVal = currentVal - numAmount;
    const newWithdrawals = parseFloat(inv.withdrawals_total || 0) + numAmount;

    await client.query(
      `UPDATE investments SET 
        current_value = $1, 
        current_documented_value = $1, 
        withdrawals_total = $2, 
        last_update = $3, 
        updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4`,
      [newVal, newWithdrawals, txDate, investment_id]
    );

    // Increase destination liquid account
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
 * INV-003 / INV-004 / INV-006: Valuación de Inversión (Ajusta valor de la inversión; genera ganancia/pérdida sin tocar liquidez)
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
        current_value = $1, 
        current_documented_value = $1, 
        last_update = $2, 
        updated_at = CURRENT_TIMESTAMP 
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
 * Queries transactions with dynamic filters
 */
async function getTransactions(filters = {}) {
  const { dbAll } = require('../database');
  const { type, category, account_id, concept, start_date, end_date } = filters;
  let sql = 'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE 1=1';
  const params = [];

  if (type && type !== 'all') {
    sql += ' AND t.type = ?';
    params.push(type);
  }
  if (category) {
    sql += ' AND t.category = ?';
    params.push(category);
  }
  if (account_id) {
    sql += ' AND t.account_id = ?';
    params.push(account_id);
  }
  if (concept) {
    sql += ' AND t.concept LIKE ?';
    params.push(`%${concept}%`);
  }
  if (start_date) {
    sql += ' AND t.date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    sql += ' AND t.date <= ?';
    params.push(end_date);
  }

  sql += ' ORDER BY t.date DESC, t.id DESC';
  return await dbAll(sql, params);
}

/**
 * Unified transaction router replacing processTransaction
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
    // Fallback default expense
    return await executeExpense({ source_account_id: srcId, amount, concept, category, date });
  }
}

/**
 * Reverts a transaction safely within a PostgreSQL ACID transaction
 */
async function deleteTransactionSafely(transactionId) {
  return await withTransaction(async (client) => {
    const txRes = await client.query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [transactionId]);
    const tx = txRes.rows[0];
    if (!tx) throw new Error('Transacción no encontrada.');

    const amount = parseFloat(tx.amount || 0);

    if (tx.type === 'income' && tx.destination_account_id) {
      await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.destination_account_id]);
      await client.query('DELETE FROM incomes WHERE account_id = $1 AND amount = $2 AND date = $3', [tx.destination_account_id, amount, tx.date]);
    } else if (tx.type === 'expense' && tx.source_account_id) {
      await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.source_account_id]);
    } else if (tx.type === 'transfer' && tx.source_account_id && tx.destination_account_id) {
      await client.query('UPDATE accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.source_account_id]);
      await client.query('UPDATE accounts SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [amount, tx.destination_account_id]);
    }

    await client.query('DELETE FROM transactions WHERE id = $1', [transactionId]);
    return { success: true, message: 'Transacción eliminada y saldo revertido correctamente.' };
  });
}

/**
 * Deletes an account safely with strict child-table cascade order in an ACID transaction
 */
async function deleteAccountSafely(accountId) {
  return await withTransaction(async (client) => {
    const accRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [accountId]);
    const acc = accRes.rows[0];
    if (!acc) throw new Error('Cuenta no encontrada.');

    // Delete child records first in strict FK order
    await client.query('DELETE FROM installment_plans WHERE account_id = $1 OR credit_card_id = $1', [accountId]);
    await client.query('DELETE FROM debts WHERE account_id = $1 OR (type = \'credit_card\' AND id = $1)', [accountId]);
    await client.query('DELETE FROM incomes WHERE account_id = $1', [accountId]);
    await client.query('DELETE FROM transactions WHERE account_id = $1 OR source_account_id = $1 OR destination_account_id = $1', [accountId]);
    await client.query('DELETE FROM accounts WHERE id = $1', [accountId]);

    return { success: true, message: 'Cuenta y sus registros dependientes eliminados de forma segura.' };
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
  deleteAccountSafely
};
