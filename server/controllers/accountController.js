const { dbAll, dbGet, dbRun } = require('../database');
const { syncCreditCardsAndDebts } = require('../services/financialRules');

/**
 * Controller for liquid & liability accounts management
 */
async function getAccounts(req, res) {
  try {
    const accounts = await dbAll('SELECT * FROM accounts WHERE active = 1 ORDER BY id ASC');
    const installmentPlans = await dbAll('SELECT * FROM installment_plans');
    const debts = await dbAll('SELECT * FROM debts');

    const processedAccounts = accounts.map(acc => {
      if (acc.type === 'credit_card') {
        const matchingDebts = debts.filter(d => d.account_id === acc.id || d.id === acc.id);
        const debtIds = matchingDebts.map(d => d.id);

        const msiPlans = installmentPlans.filter(p => p.account_id === acc.id || debtIds.includes(p.debt_id));
        const activeMsiPlans = msiPlans.filter(p => (parseInt(p.installments_paid, 10) || 0) < (parseInt(p.installments_total, 10) || 1));

        const msiMonthlySum = activeMsiPlans.reduce((sum, p) => sum + (parseFloat(p.monthly_amount) || 0), 0);
        const msiRemainingTotal = activeMsiPlans.reduce((sum, p) => {
          const remInst = Math.max(0, (parseInt(p.installments_total, 10) || 0) - (parseInt(p.installments_paid, 10) || 0));
          return sum + (parseFloat(p.monthly_amount) * remInst);
        }, 0);

        const totalDebt = parseFloat(acc.balance || 0);
        const revolvingBalance = Math.max(0, totalDebt - msiRemainingTotal);
        const noInterestPayment = activeMsiPlans.length > 0 ? (msiMonthlySum + revolvingBalance) : (parseFloat(acc.no_interest_payment) || totalDebt);
        const available = acc.credit_limit > 0 ? Math.max(0, acc.credit_limit - totalDebt) : acc.available_credit;

        return {
          ...acc,
          balance: totalDebt,
          total_debt: totalDebt,
          available_credit: available,
          msi_pending: msiRemainingTotal,
          msi_monthly_sum: msiMonthlySum,
          msi_remaining_total: msiRemainingTotal,
          revolving_balance: revolvingBalance,
          no_interest_payment: noInterestPayment,
          msi_plans: msiPlans
        };
      }
      return acc;
    });

    return res.json(processedAccounts);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function createAccount(req, res) {
  try {
    const { name, type, balance = 0, credit_limit = 0, interest_rate = 0, due_date, cutoff_date } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Nombre y tipo de cuenta son requeridos.' });
    }
    const initialAvailable = type === 'credit_card' ? parseFloat(credit_limit) - parseFloat(balance) : parseFloat(balance);
    
    const result = await dbRun(
      `INSERT INTO accounts (name, type, balance, available_credit, credit_limit, interest_rate, due_date, cutoff_date, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [name, type, parseFloat(balance), initialAvailable, parseFloat(credit_limit), parseFloat(interest_rate), due_date, cutoff_date]
    );

    let debtId = null;
    if (type === 'credit_card') {
      const debtAmount = parseFloat(balance);
      const minPayment = parseFloat(req.body.minimum_payment || debtAmount * 0.05);
      const debtResult = await dbRun(
        `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, interest_rate, due_date, account_id)
         VALUES (?, 'credit_card', ?, ?, ?, ?, ?, ?)`,
        [name, debtAmount, debtAmount, minPayment, parseFloat(interest_rate), due_date, result.lastID]
      );
      debtId = debtResult.lastID;
    }

    if (req.body.msi_plans && Array.isArray(req.body.msi_plans)) {
      for (const msi of req.body.msi_plans) {
        if (msi.concept && parseFloat(msi.monthly_amount) > 0) {
          const totalInst = parseInt(msi.installments_total || 12, 10);
          const paidInst = parseInt(msi.installments_paid || 0, 10);
          const remInst = Math.max(0, totalInst - paidInst);
          const monthly = parseFloat(msi.monthly_amount);
          const totalAmt = parseFloat(msi.total_amount || (monthly * totalInst));
          const remBal = monthly * remInst;

          await dbRun(
            `INSERT INTO installment_plans (account_id, debt_id, credit_card_id, concept, total_amount, monthly_amount, installments_total, installments_paid, remaining_balance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [result.lastID, debtId, result.lastID, msi.concept, totalAmt, monthly, totalInst, paidInst, remBal]
          );
        }
      }
    }

    return res.json({ success: true, account_id: result.lastID, debt_id: debtId, message: 'Cuenta agregada exitosamente.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getAccountById(req, res) {
  try {
    const accountId = req.params.id;
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada.' });

    const currentMonth = new Date().toISOString().substring(0, 7);

    const incRow = await dbAll(
      `SELECT SUM(amount) as total FROM transactions WHERE account_id = ? AND type = 'income' AND date LIKE ?`,
      [accountId, `${currentMonth}%`]
    );
    const monthIncome = incRow[0]?.total || 0;

    const expRow = await dbAll(
      `SELECT SUM(amount) as total FROM transactions WHERE account_id = ? AND type = 'expense' AND date LIKE ?`,
      [accountId, `${currentMonth}%`]
    );
    const monthExpense = expRow[0]?.total || 0;

    const lastTx = await dbGet(
      'SELECT * FROM transactions WHERE account_id = ? ORDER BY date DESC, id DESC LIMIT 1',
      [accountId]
    );

    const history = await dbAll(
      'SELECT * FROM transactions WHERE account_id = ? ORDER BY date DESC, id DESC',
      [accountId]
    );

    return res.json({
      account,
      month_income: monthIncome,
      month_expense: monthExpense,
      last_transaction: lastTx || null,
      history
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function updateAccount(req, res) {
  try {
    const { id } = req.params;
    const { name, balance, credit_limit } = req.body;
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [id]);
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada.' });

    const newBalance = balance !== undefined ? parseFloat(balance) : account.balance;
    const newLimit = credit_limit !== undefined ? parseFloat(credit_limit) : account.credit_limit;
    const newAvailable = account.type === 'credit_card' ? newLimit - (account.credit_limit - account.available_credit) : newBalance;

    await dbRun(
      'UPDATE accounts SET name = ?, balance = ?, available_credit = ?, credit_limit = ? WHERE id = ?',
      [name || account.name, newBalance, newAvailable, newLimit, id]
    );
    return res.json({ success: true, message: 'Cuenta actualizada.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function deleteAccount(req, res) {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM debts WHERE account_id = ?', [id]);
    await dbRun('DELETE FROM installment_plans WHERE account_id = ? OR credit_card_id = ?', [id, id]);
    await dbRun('DELETE FROM transactions WHERE account_id = ? OR source_account_id = ? OR destination_account_id = ?', [id, id, id]);
    await dbRun('DELETE FROM accounts WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Cuenta y sus transacciones eliminadas.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getAccounts,
  createAccount,
  getAccountById,
  updateAccount,
  deleteAccount
};
