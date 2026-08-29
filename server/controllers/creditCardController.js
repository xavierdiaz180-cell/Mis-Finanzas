const { dbAll, dbGet, dbRun } = require('../database');
const { syncCreditCardsAndDebts } = require('../services/financialRules');
const { executeCardPurchase, executeCardPayment, deleteDebtSafely } = require('../services/transactionService');
const { registerExistingMSI } = require('../services/creditCardService');

/**
 * Controller for credit card, debt and MSI endpoints delegating to domain services
 */
async function getDebts(req, res) {
  try {
    await syncCreditCardsAndDebts();
    const debts = await dbAll('SELECT * FROM debts ORDER BY id DESC');
    const installmentPlans = await dbAll('SELECT * FROM installment_plans');

    const debtsWithMSI = debts.map(debt => {
      const msi = installmentPlans.filter(plan => plan.debt_id === debt.id || (plan.account_id && plan.account_id === debt.account_id));
      const activeMsiPlans = msi.filter(p => (parseInt(p.installments_paid, 10) || 0) < (parseInt(p.installments_total, 10) || 1));

      const msiMonthlySum = activeMsiPlans.reduce((sum, p) => sum + (parseFloat(p.monthly_amount) || 0), 0);
      const msiRemainingTotal = activeMsiPlans.reduce((sum, p) => {
        const remInst = Math.max(0, (parseInt(p.installments_total, 10) || 0) - (parseInt(p.installments_paid, 10) || 0));
        return sum + (parseFloat(p.monthly_amount) * remInst);
      }, 0);

      const revolvingBalance = parseFloat(debt.current_balance || 0);
      const calculatedCurrentBalance = activeMsiPlans.length > 0 ? (revolvingBalance + msiMonthlySum) : revolvingBalance;
      const noInterestPayment = calculatedCurrentBalance;

      return {
        ...debt,
        current_balance: calculatedCurrentBalance,
        no_interest_payment: noInterestPayment,
        msi_monthly_sum: msiMonthlySum,
        msi_remaining_total: msiRemainingTotal,
        revolving_balance: revolvingBalance,
        msi_plans: msi
      };
    });

    return res.json(debtsWithMSI);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function createDebt(req, res) {
  try {
    const { 
      name, 
      type, 
      original_amount = 0, 
      current_balance = 0, 
      payment_amount = 0, 
      min_payment = 0,
      no_interest_payment = 0,
      interest_rate = 0, 
      due_date, 
      cutoff_date,
      remaining_payments = 0,
      account_id
    } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Nombre y tipo de deuda son requeridos.' });

    const finalNoInterestPayment = parseFloat(no_interest_payment || payment_amount || current_balance || 0);
    const finalMinPayment = parseFloat(min_payment || (current_balance ? Math.round(current_balance * 0.05) : 0));

    const result = await dbRun(
      `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, min_payment, no_interest_payment, interest_rate, due_date, cutoff_date, remaining_payments, account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, 
        type, 
        parseFloat(original_amount), 
        parseFloat(current_balance || original_amount), 
        finalNoInterestPayment,
        finalMinPayment,
        finalNoInterestPayment,
        parseFloat(interest_rate), 
        due_date, 
        cutoff_date,
        parseInt(remaining_payments, 10),
        account_id || null
      ]
    );

    return res.json({ success: true, debt_id: result.lastID, message: 'Deuda registrada exitosamente.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function updateDebt(req, res) {
  try {
    const { id } = req.params;
    const { name, current_balance, min_payment, no_interest_payment, cutoff_date, due_date, interest_rate } = req.body;

    const debt = await dbGet('SELECT * FROM debts WHERE id = ?', [id]);
    if (!debt) return res.status(404).json({ error: 'Deuda no encontrada.' });

    const newName = name !== undefined ? name : debt.name;
    const newBalance = current_balance !== undefined ? parseFloat(current_balance) : debt.current_balance;
    const newMin = min_payment !== undefined ? parseFloat(min_payment) : debt.min_payment;
    const newNoInt = no_interest_payment !== undefined ? parseFloat(no_interest_payment) : debt.no_interest_payment;
    const newCutoff = cutoff_date !== undefined ? cutoff_date : debt.cutoff_date;
    const newDue = due_date !== undefined ? due_date : debt.due_date;
    const newRate = interest_rate !== undefined ? parseFloat(interest_rate) : debt.interest_rate;

    await dbRun(
      `UPDATE debts SET 
        name = ?, 
        current_balance = ?, 
        min_payment = ?, 
        no_interest_payment = ?, 
        cutoff_date = ?, 
        due_date = ?, 
        interest_rate = ? 
       WHERE id = ?`,
      [newName, newBalance, newMin, newNoInt, newCutoff, newDue, newRate, id]
    );

    // Also update corresponding account using strict account_id
    const targetAccId = debt.account_id || debt.id;
    const acc = await dbGet("SELECT * FROM accounts WHERE id = ? AND type = 'credit_card'", [targetAccId]);
    if (acc) {
      const creditLimit = parseFloat(acc.credit_limit || 0);
      const newAvail = creditLimit > 0 ? Math.max(0, creditLimit - newBalance) : acc.available_credit;
      await dbRun(
        `UPDATE accounts SET 
          name = ?, balance = ?, available_credit = ?, min_payment = ?, no_interest_payment = ?, cutoff_date = ?, due_date = ?, interest_rate = ?
         WHERE id = ?`,
        [newName, newBalance, newAvail, newMin, newNoInt, newCutoff, newDue, newRate, acc.id]
      );
    }

    await syncCreditCardsAndDebts();
    return res.json({ success: true, message: 'Deuda / Tarjeta actualizada correctamente.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function payDebt(req, res) {
  try {
    const { id } = req.params;
    const { account_id, amount } = req.body;

    if (!account_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Cuenta de origen y monto válido son requeridos.' });
    }

    const debt = await dbGet('SELECT * FROM debts WHERE id = ?', [id]);
    if (!debt) return res.status(404).json({ error: 'Deuda no encontrada.' });

    const targetCreditCardId = debt.account_id || debt.id;

    // Delegate to atomic domain service
    const result = await executeCardPayment({
      source_account_id: parseInt(account_id, 10),
      credit_card_id: parseInt(targetCreditCardId, 10),
      amount: parseFloat(amount),
      concept: `Pago a tarjeta / deuda: ${debt.name}`
    });

    await syncCreditCardsAndDebts();

    return res.json({ success: true, transaction_id: result.transaction_id, message: 'Pago a tarjeta ejecutado correctamente.' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function deleteDebt(req, res) {
  try {
    const { id } = req.params;
    const result = await deleteDebtSafely(parseInt(id, 10));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getInstallmentPlans(req, res) {
  try {
    const plans = await dbAll('SELECT * FROM installment_plans ORDER BY id DESC');
    return res.json(plans);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function createInstallmentPlan(req, res) {
  try {
    const { credit_card_id, account_id, concept, total_amount, original_amount, monthly_amount, installments_total, installments_paid = 0, purchase_date } = req.body;
    const cardId = credit_card_id || account_id;
    if (!cardId) return res.status(400).json({ error: 'ID de tarjeta de crédito es requerido.' });

    const result = await registerExistingMSI({
      credit_card_id: parseInt(cardId, 10),
      concept,
      original_amount: total_amount || original_amount,
      installment_count: installments_total,
      monthly_installment: monthly_amount,
      installments_paid,
      purchase_date
    });

    await syncCreditCardsAndDebts();
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function deleteInstallmentPlan(req, res) {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM installment_plans WHERE id = ?', [id]);
    await syncCreditCardsAndDebts();
    return res.json({ success: true, message: 'Plan a Meses Sin Intereses eliminado.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getDebts,
  createDebt,
  updateDebt,
  payDebt,
  deleteDebt,
  getInstallmentPlans,
  createInstallmentPlan,
  deleteInstallmentPlan
};
