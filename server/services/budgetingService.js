const { pool, dbGet, dbAll, dbRun } = require('../database');

function getMexicoDateString(dateObj = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(dateObj);
}

/**
 * Calculates 24-hour daily budget for Alimentación and Monthly budget for Servicios
 */
async function getDailyBudgetStatus(currentDateStr = null) {
  const todayStr = currentDateStr || getMexicoDateString();
  const monthStr = todayStr.substring(0, 7);

  // 1. CONFIGURATION FROM SETTINGS (Ajustes)
  const settingsRows = await dbAll("SELECT key, value FROM settings WHERE key IN ('daily_budget_limit', 'services_budget_limit')");
  const settingsMap = {};
  settingsRows.forEach(r => { settingsMap[r.key] = r.value; });

  const foodDailyLimit = parseFloat(settingsMap.daily_budget_limit || 200);
  const servicesMonthlyLimit = parseFloat(settingsMap.services_budget_limit || 1500);

  // 2. DAILY FOOD BUDGET (ALIMENTACIÓN - 24 HORAS)
  let foodSpent24h = 0;
  try {
    const foodRow = await dbGet(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
       WHERE type IN ('expense', 'card_purchase') 
         AND (
           LOWER(category) LIKE '%aliment%' 
           OR LOWER(category) LIKE '%comid%' 
           OR LOWER(category) LIKE '%restauran%' 
           OR LOWER(category) LIKE '%super%' 
           OR LOWER(category) LIKE '%despensa%'
           OR LOWER(category) IN ('alimentación', 'alimentacion', 'comida', 'alimentos', 'alimento')
         )
         AND (
           date = ? 
           OR date LIKE ?
           OR COALESCE(transaction_datetime, created_at) >= (CURRENT_TIMESTAMP - INTERVAL '24 HOUR')
         )`,
      [todayStr, `${todayStr}%`]
    );
    foodSpent24h = parseFloat(foodRow?.total || 0);
  } catch (e) {
    console.error('Error querying daily food spent:', e);
  }

  const foodAvailableToday = foodDailyLimit - foodSpent24h;
  let foodStatus = 'LESS_THAN_BUDGET';
  if (foodSpent24h === foodDailyLimit) {
    foodStatus = 'ON_BUDGET';
  } else if (foodSpent24h > foodDailyLimit) {
    foodStatus = 'OVER_BUDGET';
  }

  // 3. MONTHLY SERVICES BUDGET (SERVICIOS - MENSUAL)
  let servicesSpentMonth = 0;
  try {
    const servicesRow = await dbGet(
      `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
       WHERE type IN ('expense', 'card_purchase') 
         AND (
           LOWER(category) LIKE '%servicio%' 
           OR LOWER(category) IN ('servicios', 'servicio', 'luz', 'agua', 'internet', 'gas', 'telefono')
         )
         AND (date LIKE ? OR date = ?)`,
      [`${monthStr}%`, monthStr]
    );
    servicesSpentMonth = parseFloat(servicesRow?.total || 0);
  } catch (e) {
    console.error('Error querying monthly services spent:', e);
  }

  const servicesAvailableMonth = servicesMonthlyLimit - servicesSpentMonth;
  let servicesStatus = 'LESS_THAN_BUDGET';
  if (servicesSpentMonth === servicesMonthlyLimit) {
    servicesStatus = 'ON_BUDGET';
  } else if (servicesSpentMonth > servicesMonthlyLimit) {
    servicesStatus = 'OVER_BUDGET';
  }

  return {
    // Presupuesto de Alimentación (24 Horas)
    budget_amount: foodDailyLimit,
    actual_spent: foodSpent24h,
    available_today: foodAvailableToday,
    variance: foodAvailableToday,
    result: foodStatus,
    limite_diario: foodDailyLimit,
    gastado_hoy: foodSpent24h,
    disponible_hoy: foodAvailableToday,
    categoria: 'Alimentación',
    frecuencia: '24 Horas',
    reinicio: 'Cada 24 Horas (acumulado reinicia el 1° de mes)',

    // Presupuesto de Servicios (Mensual)
    servicios: {
      budget_amount: servicesMonthlyLimit,
      actual_spent: servicesSpentMonth,
      available_month: servicesAvailableMonth,
      variance: servicesAvailableMonth,
      result: servicesStatus,
      limite_mensual: servicesMonthlyLimit,
      gastado_mes: servicesSpentMonth,
      disponible_mes: servicesAvailableMonth,
      categoria: 'Servicios',
      frecuencia: 'Mensual',
      reinicio: '1 de cada mes'
    }
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
