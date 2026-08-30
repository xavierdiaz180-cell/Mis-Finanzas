const { dbAll, dbGet, dbRun } = require('../database');
const { enrichAccountsWithMSIData } = require('../services/creditCardService');
const { deleteAccountSafely, withTransaction } = require('../services/transactionService');
const { pool } = require('../database');


/**
 * Controller for liquid & liability accounts management delegating to domain services
 */
async function getAccounts(req, res) {
  try {
    const accounts = await dbAll('SELECT * FROM accounts WHERE (active = 1 OR active IS NULL) ORDER BY id ASC');
    const processedAccounts = await enrichAccountsWithMSIData(accounts);
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

    const result = await withTransaction(async (client) => {
      const initialBalance = parseFloat(balance);
      const initialLimit   = parseFloat(credit_limit);
      const initialAvail   = type === 'credit_card'
        ? Math.max(0, initialLimit - initialBalance)
        : initialBalance;

      const accRes = await client.query(
        `INSERT INTO accounts (name, type, balance, available_credit, credit_limit, interest_rate, due_date, cutoff_date, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1) RETURNING id`,
        [name, type, initialBalance, initialAvail, initialLimit, parseFloat(interest_rate), due_date || null, cutoff_date || null]
      );
      const accountId = accRes.rows[0].id;

      let debtId = null;
      if (type === 'credit_card') {
        const minPayment = parseFloat(req.body.minimum_payment || initialBalance * 0.05);
        const debtRes = await client.query(
          `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, interest_rate, due_date, cutoff_date, account_id)
           VALUES ($1, 'credit_card', $2, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [name, initialBalance, minPayment, parseFloat(interest_rate), due_date || null, cutoff_date || null, accountId]
        );
        debtId = debtRes.rows[0].id;
      }

      // Create MSI plans if provided
      const msiPlans = req.body.msi_plans;
      if (msiPlans && Array.isArray(msiPlans)) {
        for (const msi of msiPlans) {
          if (msi.concept && parseFloat(msi.monthly_amount) > 0) {
            const totalInst = parseInt(msi.installments_total || 12, 10);
            const paidInst  = parseInt(msi.installments_paid || 0, 10);
            const remInst   = Math.max(0, totalInst - paidInst);
            const monthly   = parseFloat(msi.monthly_amount);
            const totalAmt  = parseFloat(msi.total_amount || (monthly * totalInst));
            const remBal    = monthly * remInst;

            await client.query(
              `INSERT INTO installment_plans (account_id, debt_id, credit_card_id, concept, total_amount, monthly_amount, installments_total, installments_paid, installments_remaining, remaining_balance)
               VALUES ($1, $2, $1, $3, $4, $5, $6, $7, $8, $9)`,
              [accountId, debtId, msi.concept, totalAmt, monthly, totalInst, paidInst, remInst, remBal]
            );
          }
        }
      }

      return { account_id: accountId, debt_id: debtId };
    });

    return res.json({ success: true, account_id: result.account_id, debt_id: result.debt_id, message: 'Cuenta agregada exitosamente.' });
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
    const result = await deleteAccountSafely(parseInt(id, 10));
    return res.json(result);
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
