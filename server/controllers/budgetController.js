const { dbGet, dbRun } = require('../database');
const { getDailyBudgetStatus, closeDailyBudgetPeriod } = require('../services/budgetingService');

/**
 * Controller for rolling 24-hour daily budget endpoints
 */
async function getBudget(req, res) {
  try {
    const status = await getDailyBudgetStatus();
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function updateBudgetConfig(req, res) {
  try {
    const { amount, start_time, timezone = 'America/Mexico_City' } = req.body;
    if (amount === undefined || !start_time) {
      return res.status(400).json({ error: 'Monto y hora de inicio son requeridos.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7);

    let budget = await dbGet("SELECT * FROM daily_budget WHERE enabled = 1 ORDER BY id DESC LIMIT 1");
    if (budget) {
      await dbRun(
        `UPDATE daily_budget SET amount = ?, base_amount = ?, start_time = ?, timezone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [parseFloat(amount), parseFloat(amount), start_time, timezone, budget.id]
      );
    } else {
      await dbRun(
        `INSERT INTO daily_budget (amount, base_amount, start_time, timezone, enabled, month) VALUES (?, ?, ?, ?, 1, ?)`,
        [parseFloat(amount), parseFloat(amount), start_time, timezone, monthStr]
      );
    }

    const updatedStatus = await getDailyBudgetStatus();
    return res.json({ success: true, message: 'Presupuesto diario actualizado.', ...updatedStatus });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getBudget,
  updateBudgetConfig
};
