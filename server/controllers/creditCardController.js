const { dbAll, dbGet, dbRun } = require('../database');

/**
 * GET /api/debts
 * Returns all debts with real-time balance calculations.
 * Also auto-creates a debts row for any credit_card account that lacks one
 * (handles cards created from the Cartera tab without going through Deudas).
 */
async function getDebts(req, res) {
  try {
    // Step 1: Ensure every credit_card account has a matching debts row.
    // This handles the case where a card was added from the Cartera tab.
    const creditAccounts = await dbAll("SELECT * FROM accounts WHERE type = 'credit_card'");
    for (const acc of creditAccounts) {
      const existing = await dbGet('SELECT id FROM debts WHERE account_id = ?', [acc.id]);
      if (!existing) {
        // Also check by name as a fallback
        const existingByName = await dbGet(
          "SELECT id FROM debts WHERE type = 'credit_card' AND LOWER(name) = LOWER(?)",
          [acc.name]
        );
        if (existingByName) {
          // Link the existing debt to this account
          await dbRun('UPDATE debts SET account_id = ? WHERE id = ?', [acc.id, existingByName.id]);
        } else {
          // Create the missing debts row using account data
          const bal = parseFloat(acc.balance || 0);
          const lim = parseFloat(acc.credit_limit || 0);
          const minPay = parseFloat(acc.min_payment || 0) || Math.round(bal * 0.05);
          await dbRun(
            `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, min_payment, no_interest_payment, interest_rate, due_date, cutoff_date, account_id)
             VALUES (?, 'credit_card', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [acc.name, lim, bal, bal, minPay, minPay,
             parseFloat(acc.interest_rate || 0),
             acc.due_date || null, acc.cutoff_date || null, acc.id]
          );
        }
      }
    }

    // Step 2: Load all debts and installment plans
    const debts = await dbAll('SELECT * FROM debts ORDER BY name ASC');
    const installmentPlans = await dbAll('SELECT * FROM installment_plans');

    const debtsWithDetails = await Promise.all(debts.map(async (debt) => {
      // Match MSI plans by debt_id or linked account_id
      const msi = installmentPlans.filter(plan =>
        plan.debt_id === debt.id ||
        (debt.account_id && plan.account_id === debt.account_id) ||
        (debt.account_id && plan.credit_card_id === debt.account_id)
      );
      const activeMsiPlans = msi.filter(p =>
        (parseInt(p.installments_paid, 10) || 0) < (parseInt(p.installments_total, 10) || 1)
      );

      const msiMonthlySum = activeMsiPlans.reduce((sum, p) => sum + (parseFloat(p.monthly_amount) || 0), 0);
      const msiRemainingTotal = activeMsiPlans.reduce((sum, p) => {
        const remInst = Math.max(0, (parseInt(p.installments_total, 10) || 0) - (parseInt(p.installments_paid, 10) || 0));
        return sum + (parseFloat(p.monthly_amount) * remInst);
      }, 0);

      // For credit cards: use the linked account's balance as source of truth
      // acc.balance = total owed (revolving + full MSI amounts already charged)
      // revolvingBalance = acc.balance minus what's covered by installment plans
      // This way we avoid double-counting MSI amounts.
      let accBalance = parseFloat(debt.current_balance || 0);
      let availableCredit = null;
      let creditLimit = parseFloat(debt.original_amount || 0);

      if (debt.type === 'credit_card' && debt.account_id) {
        const acc = await dbGet('SELECT * FROM accounts WHERE id = ?', [debt.account_id]).catch(() => null);
        if (acc) {
          accBalance = parseFloat(acc.balance || 0);
          creditLimit = parseFloat(acc.credit_limit || debt.original_amount || 0);
        }
      }

      // FINANCIAL MODEL (correct):
      // acc.balance = total owed on the card = revolving + MSI remaining
      // revolving = charges this cycle that are NOT in installment plans
      const revolvingBalance = Math.max(0, accBalance - msiRemainingTotal);

      // Saldo total pendiente = full amount owed on card (acc.balance)
      const totalBalance = accBalance;

      // Pago sin intereses este mes = revolving charges + this month's MSI installments ONLY
      // (NOT the full MSI remaining — that spreads across future months)
      const noInterestPayment = revolvingBalance + msiMonthlySum;

      // Available credit = limit minus the full balance (full MSI counts against limit)
      if (creditLimit > 0) {
        availableCredit = Math.max(0, creditLimit - totalBalance);
      }

      const minPay = parseFloat(debt.min_payment) || Math.round(noInterestPayment * 0.05);

      return {
        ...debt,
        current_balance: totalBalance,
        revolving_balance: revolvingBalance,
        no_interest_payment: noInterestPayment,
        min_payment: minPay,
        available_credit: availableCredit,
        original_amount: creditLimit,
        msi_monthly_sum: msiMonthlySum,
        msi_remaining_total: msiRemainingTotal,
        msi_plans: msi
      };

    }));

    return res.json(debtsWithDetails);
  } catch (error) {
    console.error('getDebts error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function getCutoffThreshold(cutoffDateValue) {
  if (!cutoffDateValue) return null;
  const str = String(cutoffDateValue).trim();
  if (str.length === 10 && str.includes('-')) return str;
  const dayNum = parseInt(str, 10);
  if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
    const now = new Date();
    let cutoff = new Date(now.getFullYear(), now.getMonth(), dayNum);
    if (now < cutoff) cutoff = new Date(now.getFullYear(), now.getMonth() - 1, dayNum);
    return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  }
  return null;
}

/**
 * POST /api/debts
 * Creates a new debt or credit card.
 * For credit_card type: also creates a linked account for transaction tracking.
 */
async function createDebt(req, res) {
  try {
    const {
      name,
      type,
      current_balance = 0,
      credit_limit = 0,
      min_payment = 0,
      no_interest_payment = 0,
      interest_rate = 0,
      due_date,
      cutoff_date,
      remaining_payments = 0
    } = req.body;

    if (!name || !type) return res.status(400).json({ error: 'Nombre y tipo de deuda son requeridos.' });

    const bal = parseFloat(current_balance || 0);
    const finalMinPayment = parseFloat(min_payment) || Math.round(bal * 0.05);
    const finalNoInterest = parseFloat(no_interest_payment) || bal;
    const finalLimit = parseFloat(credit_limit || 0);

    const result = await dbRun(
      `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, min_payment, no_interest_payment, interest_rate, due_date, cutoff_date, remaining_payments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, type, finalLimit || bal, bal, finalNoInterest, finalMinPayment, finalNoInterest,
       parseFloat(interest_rate), due_date || null, cutoff_date || null, parseInt(remaining_payments, 10)]
    );

    // For credit_card: also create linked account for transaction tracking
    if (type === 'credit_card') {
      const accResult = await dbRun(
        `INSERT INTO accounts (name, type, balance, credit_limit, available_credit, interest_rate, due_date, cutoff_date)
         VALUES (?, 'credit_card', ?, ?, ?, ?, ?, ?)`,
        [name, bal, finalLimit, Math.max(0, finalLimit - bal), parseFloat(interest_rate), due_date || null, cutoff_date || null]
      );
      // Link the account back to the debt
      await dbRun('UPDATE debts SET account_id = ? WHERE id = ?', [accResult.lastID, result.lastID]);
    }

    return res.json({ success: true, debt_id: result.lastID, message: 'Tarjeta / Deuda registrada exitosamente.' });
  } catch (error) {
    console.error('createDebt error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/debts/:id
 * Updates a debt's manual configuration.
 * Does NOT trigger auto-sync to preserve the manually entered values.
 */
async function updateDebt(req, res) {
  try {
    const { id } = req.params;
    const { name, current_balance, credit_limit, min_payment, no_interest_payment, cutoff_date, due_date, interest_rate } = req.body;

    const debt = await dbGet('SELECT * FROM debts WHERE id = ?', [id]);
    if (!debt) return res.status(404).json({ error: 'Deuda no encontrada.' });

    const newName = name !== undefined ? name : debt.name;
    const newBalance = current_balance !== undefined ? parseFloat(current_balance) : parseFloat(debt.current_balance || 0);
    const newMin = min_payment !== undefined ? parseFloat(min_payment) : parseFloat(debt.min_payment || 0);
    const newNoInt = no_interest_payment !== undefined ? parseFloat(no_interest_payment) : parseFloat(debt.no_interest_payment || newBalance);
    const newCutoff = cutoff_date !== undefined ? (cutoff_date || null) : debt.cutoff_date;
    const newDue = due_date !== undefined ? (due_date || null) : debt.due_date;
    const newRate = interest_rate !== undefined ? parseFloat(interest_rate) : parseFloat(debt.interest_rate || 0);
    const newLimit = credit_limit !== undefined ? parseFloat(credit_limit) : parseFloat(debt.original_amount || 0);

    // Update debts table (source of truth)
    await dbRun(
      `UPDATE debts SET 
        name = ?, 
        current_balance = ?, 
        original_amount = ?,
        min_payment = ?, 
        no_interest_payment = ?, 
        cutoff_date = ?, 
        due_date = ?, 
        interest_rate = ? 
       WHERE id = ?`,
      [newName, newBalance, newLimit, newMin, newNoInt, newCutoff, newDue, newRate, id]
    );

    // Sync to linked account (legacy support — debt is still source of truth)
    if (debt.account_id) {
      const acc = await dbGet("SELECT * FROM accounts WHERE id = ? AND type = 'credit_card'", [debt.account_id]);
      if (acc) {
        const lim = newLimit > 0 ? newLimit : parseFloat(acc.credit_limit || 0);
        const avail = lim > 0 ? Math.max(0, lim - newBalance) : parseFloat(acc.available_credit || 0);
        await dbRun(
          `UPDATE accounts SET name = ?, balance = ?, credit_limit = ?, available_credit = ?, min_payment = ?, no_interest_payment = ?, cutoff_date = ?, due_date = ?, interest_rate = ?
           WHERE id = ?`,
          [newName, newBalance, lim, avail, newMin, newNoInt, newCutoff, newDue, newRate, acc.id]
        );
      }
    }

    // NOTE: intentionally NOT calling syncCreditCardsAndDebts() to preserve manual edits

    return res.json({ success: true, message: 'Tarjeta / Deuda actualizada correctamente.' });
  } catch (error) {
    console.error('updateDebt error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/debts/:id/pay
 * Registers a card payment: reduces liquid source account and reduces debt balance.
 */
async function payDebt(req, res) {
  try {
    const { id } = req.params;
    const { account_id, amount } = req.body;

    if (!account_id || !amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Cuenta de origen y monto válido son requeridos.' });
    }

    const debt = await dbGet('SELECT * FROM debts WHERE id = ?', [id]);
    if (!debt) return res.status(404).json({ error: 'Deuda no encontrada.' });

    const numAmount = parseFloat(amount);

    // Validate source account funds
    const srcAccount = await dbGet('SELECT * FROM accounts WHERE id = ?', [account_id]);
    if (!srcAccount) return res.status(400).json({ error: 'Cuenta de origen no encontrada.' });
    if (srcAccount.type !== 'credit_card' && parseFloat(srcAccount.balance || 0) < numAmount) {
      return res.status(400).json({ error: 'Fondos insuficientes en la cuenta de origen.' });
    }

    // Deduct from source liquid account
    await dbRun('UPDATE accounts SET balance = balance - ? WHERE id = ?', [numAmount, account_id]);

    // Update linked credit card account
    if (debt.account_id) {
      const cardAcc = await dbGet("SELECT * FROM accounts WHERE id = ? AND type = 'credit_card'", [debt.account_id]);
      if (cardAcc) {
        const lim = parseFloat(cardAcc.credit_limit || 0);
        const newBal = Math.max(0, parseFloat(cardAcc.balance || 0) - numAmount);
        const newAvail = lim > 0 ? Math.min(lim, lim - newBal) : parseFloat(cardAcc.available_credit || 0) + numAmount;
        await dbRun('UPDATE accounts SET balance = ?, available_credit = ? WHERE id = ?', [newBal, newAvail, debt.account_id]);
      }
    }

    // Update debt balance directly
    await dbRun(
      'UPDATE debts SET current_balance = GREATEST(0, current_balance - ?) WHERE id = ?',
      [numAmount, id]
    );

    // Record transaction
    await dbRun(
      `INSERT INTO transactions (date, type, amount, category, concept, source_account_id, destination_account_id, account_id, source, status, transaction_datetime)
       VALUES (?, 'card_payment', ?, 'Pago de Deuda', ?, ?, ?, ?, 'manual', 'confirmed', CURRENT_TIMESTAMP)`,
      [
        new Date().toISOString().split('T')[0],
        numAmount,
        `Pago a ${debt.name}`,
        parseInt(account_id, 10),
        debt.account_id || null,
        parseInt(account_id, 10)
      ]
    );

    return res.json({ success: true, message: `Pago de $${numAmount.toLocaleString('es-MX')} aplicado a ${debt.name}.` });
  } catch (error) {
    console.error('payDebt error:', error);
    return res.status(400).json({ error: error.message });
  }
}

/**
 * POST /api/debts/:id/expense
 * Registers a credit card purchase (increases debt balance).
 * Supports MSI: creates installment plan automatically.
 */
async function addCardExpense(req, res) {
  try {
    const { id } = req.params;
    const { amount, concept, category = 'Compras', is_msi = false, msi_months = 1, date } = req.body;

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a cero.' });
    }

    const debt = await dbGet('SELECT * FROM debts WHERE id = ?', [id]);
    if (!debt) return res.status(404).json({ error: 'Deuda no encontrada.' });

    const numAmount = parseFloat(amount);
    const txDate = date || new Date().toISOString().split('T')[0];

    // Update debt balance
    await dbRun('UPDATE debts SET current_balance = current_balance + ? WHERE id = ?', [numAmount, id]);

    // Update linked account if exists
    if (debt.account_id) {
      const cardAcc = await dbGet("SELECT * FROM accounts WHERE id = ? AND type = 'credit_card'", [debt.account_id]);
      if (cardAcc) {
        const lim = parseFloat(cardAcc.credit_limit || 0);
        const newBal = parseFloat(cardAcc.balance || 0) + numAmount;
        const newAvail = lim > 0 ? Math.max(0, lim - newBal) : Math.max(0, parseFloat(cardAcc.available_credit || 0) - numAmount);
        await dbRun('UPDATE accounts SET balance = ?, available_credit = ? WHERE id = ?', [newBal, newAvail, debt.account_id]);
      }
    }

    // Record transaction
    const txAccountId = debt.account_id || null;
    const txRes = await dbRun(
      `INSERT INTO transactions (date, type, amount, category, concept, source_account_id, account_id, source, status, transaction_datetime)
       VALUES (?, 'card_purchase', ?, ?, ?, ?, ?, 'manual', 'confirmed', CURRENT_TIMESTAMP)`,
      [txDate, numAmount, category, concept || `Gasto en ${debt.name}`, txAccountId, txAccountId]
    );
    const txId = txRes.lastID;

    // If MSI: create installment plan
    let msiPlan = null;
    if (is_msi && parseInt(msi_months, 10) > 1) {
      const months = parseInt(msi_months, 10);
      const monthly = parseFloat((numAmount / months).toFixed(2));
      const msiRes = await dbRun(
        `INSERT INTO installment_plans (debt_id, account_id, credit_card_id, transaction_id, concept, total_amount, original_amount, monthly_amount, installments_total, installments_paid, installments_remaining, remaining_balance, remaining_principal, purchase_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'active')`,
        [id, debt.account_id || null, debt.account_id || null, txId,
         concept || `Gasto en ${debt.name}`, numAmount, numAmount, monthly,
         months, months, numAmount, numAmount, txDate]
      );
      msiPlan = { id: msiRes.lastID, monthly_amount: monthly, installments_total: months };
    }

    return res.json({
      success: true,
      transaction_id: txId,
      msi_plan: msiPlan,
      message: `Gasto de $${numAmount.toLocaleString('es-MX')} registrado en ${debt.name}.`
    });
  } catch (error) {
    console.error('addCardExpense error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/debts/:id
 * Safely deletes a debt and all its associated records using dbRun directly.
 */
async function deleteDebt(req, res) {
  try {
    const { id } = req.params;

    const debt = await dbGet('SELECT * FROM debts WHERE id = ?', [id]);
    if (!debt) return res.json({ success: true, message: 'Deuda no encontrada (ya eliminada).' });

    const accId = debt.account_id;

    // 1. Delete installment plans linked to this debt
    await dbRun('DELETE FROM installment_plans WHERE debt_id = ?', [id]);

    // 2. Delete the debt record
    await dbRun('DELETE FROM debts WHERE id = ?', [id]);

    // 3. Clean up linked credit card account if it exists
    if (accId) {
      await dbRun('DELETE FROM installment_plans WHERE account_id = ? OR credit_card_id = ?', [accId, accId]);
      // Preserve transaction history but unlink from account
      await dbRun("UPDATE transactions SET account_id = NULL WHERE account_id = ? AND type = 'card_purchase'", [accId]);
      await dbRun('UPDATE transactions SET destination_account_id = NULL WHERE destination_account_id = ?', [accId]);
      await dbRun("UPDATE transactions SET source_account_id = NULL WHERE source_account_id = ? AND type = 'card_payment'", [accId]);
      await dbRun('DELETE FROM transactions WHERE account_id = ?', [accId]);
      await dbRun("DELETE FROM accounts WHERE id = ? AND type = 'credit_card'", [accId]);
    }

    return res.json({ success: true, message: `Deuda "${debt.name}" eliminada correctamente.` });
  } catch (error) {
    console.error('deleteDebt error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/installment-plans
 */
async function getInstallmentPlans(req, res) {
  try {
    const plans = await dbAll('SELECT * FROM installment_plans ORDER BY id DESC');
    return res.json(plans);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/installment-plans
 * Registers an existing MSI plan manually (e.g. already-existing compras en MSI).
 */
async function createInstallmentPlan(req, res) {
  try {
    const { debt_id, credit_card_id, account_id, concept, total_amount, monthly_amount, installments_total, installments_paid = 0, purchase_date } = req.body;
    const cardId = credit_card_id || account_id;

    if (!concept || !total_amount || !monthly_amount || !installments_total) {
      return res.status(400).json({ error: 'Concepto, monto total, mensualidad y plazo son requeridos.' });
    }

    const paid = parseInt(installments_paid, 10) || 0;
    const total = parseInt(installments_total, 10);
    const remaining = Math.max(0, total - paid);
    const remBal = parseFloat(monthly_amount) * remaining;

    // Resolve debt_id if not provided but debt exists for this card
    let resolvedDebtId = debt_id ? parseInt(debt_id, 10) : null;
    if (!resolvedDebtId && cardId) {
      const linkedDebt = await dbGet('SELECT id FROM debts WHERE account_id = ?', [parseInt(cardId, 10)]);
      if (linkedDebt) resolvedDebtId = linkedDebt.id;
    }

    const result = await dbRun(
      `INSERT INTO installment_plans (debt_id, account_id, credit_card_id, concept, total_amount, original_amount, monthly_amount, installments_total, installments_paid, installments_remaining, remaining_balance, remaining_principal, purchase_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [resolvedDebtId, cardId ? parseInt(cardId, 10) : null, cardId ? parseInt(cardId, 10) : null,
       concept, parseFloat(total_amount), parseFloat(total_amount), parseFloat(monthly_amount),
       total, paid, remaining, remBal, remBal, purchase_date || null]
    );

    return res.json({ success: true, plan_id: result.lastID, message: 'Plan MSI registrado correctamente.' });
  } catch (error) {
    console.error('createInstallmentPlan error:', error);
    return res.status(400).json({ error: error.message });
  }
}

/**
 * DELETE /api/installment-plans/:id
 */
async function deleteInstallmentPlan(req, res) {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM installment_plans WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Plan MSI eliminado.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getDebts,
  createDebt,
  updateDebt,
  payDebt,
  addCardExpense,
  deleteDebt,
  getInstallmentPlans,
  createInstallmentPlan,
  deleteInstallmentPlan
};
