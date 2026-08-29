const transactionService = require('../services/transactionService');

/**
 * Controller for income, expense, transfer and movement endpoints relying 100% exclusively on transactionService
 */
async function getTransactions(req, res) {
  try {
    const transactions = await transactionService.getTransactions(req.query);
    return res.json(transactions);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function createTransaction(req, res) {
  try {
    const result = await transactionService.processGenericTransaction(req.body);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function removeTransaction(req, res) {
  try {
    const { id } = req.params;
    const result = await transactionService.deleteTransactionSafely(parseInt(id, 10));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getIncomes(req, res) {
  try {
    const filters = { ...req.query, type: 'income' };
    const incomes = await transactionService.getTransactions(filters);
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
