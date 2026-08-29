const { dbAll, dbGet, dbRun } = require('../database');
const { executeInvestmentContribution, executeInvestmentWithdrawal, executeInvestmentValuation } = require('../services/transactionService');

/**
 * Controller for investments CRUD, contributions, withdrawals, and valuations
 */
async function getInvestments(req, res) {
  try {
    const rows = await dbAll('SELECT * FROM investments ORDER BY id DESC');
    const investments = rows.map(inv => {
      const currentVal = parseFloat(inv.current_value || inv.current_documented_value || 0);
      const investedAmt = parseFloat(inv.capital_contributed || inv.invested_amount || 0);
      const profitLoss = currentVal - investedAmt;
      const profitLossPercentage = investedAmt > 0 ? (profitLoss / investedAmt) * 100 : 0;
      return {
        ...inv,
        invested_amount: investedAmt,
        current_documented_value: currentVal,
        profit_loss: profitLoss,
        profit_loss_percentage: profitLossPercentage
      };
    });
    return res.json(investments);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function createInvestment(req, res) {
  try {
    const { name, invested_amount = 0, current_documented_value = 0, risk_level = 'medium', institution } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre de la inversión es requerido.' });

    const today = new Date().toISOString().split('T')[0];
    const initVal = parseFloat(current_documented_value || invested_amount || 0);
    const initCap = parseFloat(invested_amount || 0);

    const result = await dbRun(
      `INSERT INTO investments (name, invested_amount, capital_contributed, current_documented_value, current_value, risk_level, institution, last_update)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, initCap, initCap, initVal, initVal, risk_level, institution || 'General', today]
    );

    return res.json({ success: true, investment_id: result.lastID, message: 'Inversión registrada correctamente.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function updateInvestmentValue(req, res) {
  try {
    const { id } = req.params;
    const { current_documented_value, current_value } = req.body;
    const targetVal = current_value !== undefined ? current_value : current_documented_value;
    if (targetVal === undefined) {
      return res.status(400).json({ error: 'El valor documentado es requerido.' });
    }

    // Delegate to atomic domain service
    const result = await executeInvestmentValuation({
      investment_id: parseInt(id, 10),
      new_current_value: parseFloat(targetVal)
    });

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function depositToInvestment(req, res) {
  try {
    const { id } = req.params;
    const { account_id, amount } = req.body;

    if (!account_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Cuenta de origen y monto válido son requeridos.' });
    }

    // Delegate to atomic domain service
    const result = await executeInvestmentContribution({
      source_account_id: parseInt(account_id, 10),
      investment_id: parseInt(id, 10),
      amount: parseFloat(amount)
    });

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function withdrawFromInvestment(req, res) {
  try {
    const { id } = req.params;
    const { account_id, amount } = req.body;

    if (!account_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Cuenta destino y monto válido son requeridos.' });
    }

    // Delegate to atomic domain service
    const result = await executeInvestmentWithdrawal({
      investment_id: parseInt(id, 10),
      destination_account_id: parseInt(account_id, 10),
      amount: parseFloat(amount)
    });

    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

async function deleteInvestment(req, res) {
  try {
    const { id } = req.params;
    const investment = await dbGet('SELECT * FROM investments WHERE id = ?', [id]);
    if (!investment) return res.status(404).json({ error: 'Inversión no encontrada.' });

    await dbRun('DELETE FROM investments WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Inversión eliminada correctamente.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getInvestments,
  createInvestment,
  updateInvestmentValue,
  depositToInvestment,
  withdrawFromInvestment,
  deleteInvestment
};
