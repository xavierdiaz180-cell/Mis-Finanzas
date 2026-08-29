const { dbAll } = require('../database');
const { processTransaction, deleteTransaction } = require('../services/financialRules');
const { executeIncome, executeExpense, executeTransfer } = require('../services/transactionService');

/**
 * Controller for income, expense, and transfer movements delegating to domain services
 */
async function getTransactions(req, res) {
  try {
    const { type, category, account_id, concept, start_date, end_date } = req.query;
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
    const transactions = await dbAll(sql, params);
    return res.json(transactions);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function createTransaction(req, res) {
  try {
    const result = await processTransaction(req.body);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function removeTransaction(req, res) {
  try {
    const { id } = req.params;
    const result = await deleteTransaction(id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getIncomes(req, res) {
  try {
    const { type, account_id } = req.query;
    let sql = `
      SELECT t.*, a.name as account_name 
      FROM transactions t 
      LEFT JOIN accounts a ON t.account_id = a.id 
      WHERE t.type = 'income'
    `;
    const params = [];

    if (type) {
      sql += ' AND t.category = ?';
      params.push(type);
    }
    if (account_id) {
      sql += ' AND t.account_id = ?';
      params.push(account_id);
    }

    sql += ' ORDER BY t.date DESC, t.id DESC';
    const incomes = await dbAll(sql, params);
    return res.json(incomes);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getTransactions,
  createTransaction,
  removeTransaction,
  getIncomes
};
