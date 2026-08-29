const { pool, dbGet, dbAll, dbRun } = require('../database');

/**
 * Calculates current 24-hour rolling daily budget status and closed period history
 */
async function getDailyBudgetStatus(currentDateStr = null) {
  const todayStr = currentDateStr || new Date().toISOString().split('T')[0];
  const monthStr = todayStr.substring(0, 7);

  // Get configuration from settings table (Ajustes) first, fallback to daily_budget
  const budgetSetting = await dbGet("SELECT value FROM settings WHERE key = 'daily_budget_limit'");
  let settingLimit = null;
  if (budgetSetting && budgetSetting.value !== undefined && budgetSetting.value !== null && !isNaN(parseFloat(budgetSetting.value))) {
    settingLimit = parseFloat(budgetSetting.value);
  }

  let budgetConfig = await dbGet("SELECT * FROM daily_budget WHERE enabled = 1 ORDER BY id DESC LIMIT 1");
  if (!budgetConfig) {
    const defaultAmount = settingLimit !== null ? settingLimit : 500;
    const defaultStartTime = '08:30';
    const result = await dbRun(
      `INSERT INTO daily_budget (base_amount, amount, start_time, timezone, enabled, month) 
       VALUES (?, ?, ?, 'America/Mexico_City', 1, ?)`,
      [defaultAmount, defaultAmount, defaultStartTime, monthStr]
    );
    budgetConfig = await dbGet("SELECT * FROM daily_budget WHERE id = ?", [result.lastID]);
  }

  const budgetAmount = settingLimit !== null ? settingLimit : parseFloat(budgetConfig.amount || budgetConfig.base_amount || 500);
  const startTime = budgetConfig.start_time || '08:30';

  // Calculate 24-hour rolling period start & end timestamps
  const [startHour, startMin] = startTime.split(':').map(n => parseInt(n, 10));
  const now = new Date();
  
  let periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0);
  if (now < periodStart) {
    periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, startHour, startMin, 0);
  }
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);

  const periodStartStr = periodStart.toISOString();
  const periodEndStr = periodEnd.toISOString();

  // Query transactions in current period using financial movement datetime (transaction_datetime)
  // Budget-consuming transactions: 'expense', 'card_purchase' (EXCLUDES transfer, card_payment, investment_contribution, investment_withdrawal, income)
  const spentRow = await dbGet(
    `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
     WHERE type IN ('expense', 'card_purchase') 
       AND COALESCE(transaction_datetime, created_at) >= $1 
       AND COALESCE(transaction_datetime, created_at) < $2`,
    [periodStartStr, periodEndStr]
  );
  const actualSpent = parseFloat(spentRow?.total || 0);

  const availableToday = budgetAmount - actualSpent;
  const variance = budgetAmount - actualSpent;

  let resultStatus = 'LESS_THAN_BUDGET';
  if (actualSpent === budgetAmount) {
    resultStatus = 'ON_BUDGET';
  } else if (actualSpent > budgetAmount) {
    resultStatus = 'OVER_BUDGET';
  }

  return {
    budget_amount: budgetAmount,
    actual_spent: actualSpent,
    available_today: availableToday,
    variance: variance,
    result: resultStatus,
    period_start: periodStartStr,
    period_end: periodEndStr,
    start_time: startTime
  };
}

/**
 * Closes the current 24-hour period and saves it to daily_budget_periods
 */
async function closeDailyBudgetPeriod(periodData) {
  const { budget_id, period_start, period_end, budget_amount, actual_spent, variance, result } = periodData;

  const res = await dbRun(
    `INSERT INTO daily_budget_periods (budget_id, period_start, period_end, budget_amount, actual_spent, variance, result)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [budget_id || null, period_start, period_end, budget_amount, actual_spent, variance, result]
  );

  return res.lastID;
}

module.exports = {
  getDailyBudgetStatus,
  closeDailyBudgetPeriod
};
