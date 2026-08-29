const { dbAll, dbGet, dbRun } = require('../database');

/**
 * Calculates metrics according to strict financial rules:
 * 1. Disponible Hoy = Bank Accounts + Payroll Accounts + Cash (EXCLUDES investments).
 * 2. Riqueza Neta = Disponible hoy + Inversiones documentadas - Deuda total. (Display 0 if negative).
 * 3. Salud Financiera (0-100) with explanation of factors.
 * 4. Presupuesto Diario Acumulable (Resets on 1st of month, unspent rolls over).
 */
function getLocalDateString(dateObj = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(dateObj);
}

async function calculateAccountMSIBreakdown(accId, debtId, currentPeriodExpenses) {
  let query = 'SELECT * FROM installment_plans WHERE 1=0';
  const params = [];
  if (accId && debtId) {
    query = 'SELECT * FROM installment_plans WHERE account_id = ? OR debt_id = ?';
    params.push(accId, debtId);
  } else if (accId) {
    query = 'SELECT * FROM installment_plans WHERE account_id = ?';
    params.push(accId);
  } else if (debtId) {
    query = 'SELECT * FROM installment_plans WHERE debt_id = ?';
    params.push(debtId);
  }

  const plans = await dbAll(query, params);
  const activePlans = plans.filter(p => (parseInt(p.installments_paid, 10) || 0) < (parseInt(p.installments_total, 10) || 1));
  
  const msiMonthlySum = activePlans.reduce((sum, p) => sum + (parseFloat(p.monthly_amount) || 0), 0);
  const msiRemainingTotal = activePlans.reduce((sum, p) => {
    const remInst = Math.max(0, (parseInt(p.installments_total, 10) || 0) - (parseInt(p.installments_paid, 10) || 0));
    return sum + (parseFloat(p.monthly_amount) * remInst);
  }, 0);

  const revolvingBalance = Math.max(0, parseFloat(currentPeriodExpenses || 0));
  const cardBalance = revolvingBalance + msiMonthlySum;
  const noInterestPayment = cardBalance;

  return {
    msiPlans: plans,
    activePlans,
    msiMonthlySum,
    msiRemainingTotal,
    revolvingBalance,
    cardBalance,
    noInterestPayment
  };
}

function getCutoffDateThreshold(cutoffDateValue) {
  if (!cutoffDateValue) return null;
  const str = String(cutoffDateValue).trim();

  if (str.length === 10 && str.includes('-')) {
    return str;
  }

  const dayNum = parseInt(str, 10);
  if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let cutoff = new Date(year, month, dayNum);
    if (now < cutoff) {
      cutoff = new Date(year, month - 1, dayNum);
    }
    const yyyy = cutoff.getFullYear();
    const mm = String(cutoff.getMonth() + 1).padStart(2, '0');
    const dd = String(cutoff.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

async function syncCreditCardsAndDebts() {
  try {
    // Only update existing linked accounts — never auto-create new debt rows
    const debts = await dbAll("SELECT * FROM debts WHERE type = 'credit_card' AND account_id IS NOT NULL");
    for (const debt of debts) {
      const acc = await dbGet("SELECT * FROM accounts WHERE id = ? AND type = 'credit_card'", [debt.account_id]);
      if (!acc) continue;

      // Sync name from debt (debt is source of truth)
      if (acc.name !== debt.name) {
        await dbRun('UPDATE accounts SET name = ? WHERE id = ?', [debt.name, acc.id]);
      }
    }
  } catch (err) {
    console.error('Error in syncCreditCardsAndDebts:', err.message);
  }
}

async function calculateFinancialMetrics() {
  const today = getLocalDateString();
  const currentMonth = today.substring(0, 7); // YYYY-MM
  const dayOfMonth = parseInt(today.split('-')[2], 10);

  // Sync credit card balances with transactions & debts
  await syncCreditCardsAndDebts();

  // 1. Cuentas Líquidas
  const liquidAccounts = await dbAll(`
    SELECT SUM(balance) as total FROM accounts 
    WHERE active = 1 AND type IN ('bank', 'payroll', 'cash')
  `);
  const cuentasLiquidas = parseFloat(liquidAccounts[0]?.total || 0);

  // 2. Inversiones
  const investmentRow = await dbAll('SELECT SUM(COALESCE(current_value, current_documented_value)) as total FROM investments');
  const totalInversiones = parseFloat(investmentRow[0]?.total || 0);

  // V2 Definition: Dinero Disponible = Cuentas Líquidas + Inversiones
  const disponibleHoy = cuentasLiquidas + totalInversiones;

  // 3. Pasivos / Deuda Total
  const debtRow = await dbAll("SELECT SUM(current_balance) as total FROM debts WHERE type != 'credit_card'");
  const totalDebtsTable = parseFloat(debtRow[0]?.total || 0);

  const ccAccounts = await dbAll(`
    SELECT SUM(balance) as total FROM accounts
    WHERE active = 1 AND type = 'credit_card'
  `);
  const totalCCDebt = parseFloat(ccAccounts[0]?.total || 0);
  const totalDeuda = totalDebtsTable + totalCCDebt;

  // 4. V2 Definition: Patrimonio Neto = Activos - Pasivos
  const activos = cuentasLiquidas + totalInversiones;
  const pasivos = totalDeuda;
  const patrimonioNeto = activos - pasivos;
  const riquezaNeta = patrimonioNeto > 0 ? patrimonioNeto : 0;

  // 5. Month Income & Expenses
  const monthIncomeRow = await dbAll(`
    SELECT SUM(amount) as total FROM transactions
    WHERE type = 'income' AND (date LIKE ? OR date = ?)
  `, [`${currentMonth}%`, currentMonth]);
  const ingresosMes = parseFloat(monthIncomeRow[0]?.total || 0);

  const monthExpenseRow = await dbAll(`
    SELECT SUM(amount) as total FROM transactions
    WHERE type = 'expense' AND (date LIKE ? OR date = ?)
  `, [`${currentMonth}%`, currentMonth]);
  const gastosMes = parseFloat(monthExpenseRow[0]?.total || 0);

  // 6. Financial Health Score Calculation (0-100)
  let score = 75; // base score
  const factors = [];

  // Liquidity factor
  if (disponibleHoy > 20000) {
    score += 10;
    factors.push('+ Excelente nivel de liquidez disponible');
  } else if (disponibleHoy < 3000) {
    score -= 15;
    factors.push('- Liquidez disponible baja para imprevistos');
  }

  // Debt factor
  if (totalDeuda === 0) {
    score += 15;
    factors.push('+ Cero deudas registradas');
  } else {
    const debtRatio = totalDeuda / (disponibleHoy + totalInversiones + 1);
    if (debtRatio > 0.8) {
      score -= 25;
      factors.push('- Nivel de endeudamiento muy elevado en relación a tu patrimonio');
    } else if (debtRatio > 0.4) {
      score -= 10;
      factors.push('- Endeudamiento moderado');
    } else {
      score += 5;
      factors.push('+ Endeudamiento bajo y manejable');
    }
  }

  // Savings capacity factor
  if (ingresosMes > 0) {
    const savingsRate = (ingresosMes - gastosMes) / ingresosMes;
    if (savingsRate >= 0.2) {
      score += 10;
      factors.push('+ Capacidad de ahorro superior al 20% este mes');
    } else if (savingsRate < 0) {
      score -= 15;
      factors.push('- Tus gastos superan tus ingresos este mes');
    }
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  let etiqueta = 'Buena';
  if (clampedScore >= 85) etiqueta = 'Excelente';
  else if (clampedScore >= 70) etiqueta = 'Buena';
  else if (clampedScore >= 50) etiqueta = 'Regular';
  else etiqueta = 'En Riesgo';

  // 7. Daily Budget Calculation with Rollover & 1st of month reset
  const budgetSetting = await dbGet("SELECT value FROM settings WHERE key = 'daily_budget_limit'");
  const baseDailyLimit = parseFloat(budgetSetting?.value || 200);

  let budgetRecord = await dbGet('SELECT * FROM daily_budget WHERE month = ?', [currentMonth]);
  
  if (!budgetRecord) {
    // New month initialization (1st of month reset)
    const rolloverAmount = 0; // reset on 1st of month
    await dbRun(
      'INSERT INTO daily_budget (base_amount, month, rollover_amount, daily_spent, last_reset_date) VALUES (?, ?, ?, 0, ?)',
      [baseDailyLimit, currentMonth, rolloverAmount, today]
    );
    budgetRecord = await dbGet('SELECT * FROM daily_budget WHERE month = ?', [currentMonth]);
  }

  // Calculate today's spent amount
  const todaySpentRow = await dbAll(`
    SELECT SUM(amount) as total FROM transactions
    WHERE type = 'expense' AND (date = ? OR date LIKE ?)
  `, [today, `${today}%`]);
  const gastadoHoy = parseFloat(todaySpentRow[0]?.total || 0);

  // Calculate total budget for full month (e.g. 31 days in August * $200 = $6,200)
  const [yearStr, monthStr] = currentMonth.split('-');
  const totalDaysInMonth = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
  const totalFullMonthBudget = (baseDailyLimit * totalDaysInMonth) + (budgetRecord.rollover_amount || 0);
  const totalSpentSoFar = gastosMes;
  const disponibleHoyPresupuesto = baseDailyLimit - gastadoHoy;
  const disponibleAcumuladoMes = Math.max(0, totalFullMonthBudget - totalSpentSoFar);

  return {
    disponible_hoy: disponibleHoy,
    total_inversiones: totalInversiones,
    total_deuda: totalDeuda,
    riqueza_neta: riquezaNeta,
    riqueza_neta_raw: patrimonioNeto,
    ingresos_mes: ingresosMes,
    gastos_mes: gastosMes,
    salud_financiera: {
      score: clampedScore,
      etiqueta: etiqueta,
      explicacion: factors.length > 0 ? factors.join('. ') : 'Métricas equilibradas.'
    },
    presupuesto_diario: {
      limite_diario: baseDailyLimit,
      gastado_hoy: gastadoHoy,
      disponible_hoy: disponibleHoyPresupuesto,
      acumulado_mes: disponibleAcumuladoMes,
      dias_mes: totalDaysInMonth,
      presupuesto_total_mes: totalFullMonthBudget,
      reinicio_mes: '1 de cada mes'
    }
  };
}

/**
 * Executes a transaction and updates affected account balances atomically
 */
async function processTransaction(data) {
  const transactionService = require('./transactionService');
  return await transactionService.processGenericTransaction(data);
}

/**
 * Deletes a transaction and completely reverts all account balances and debt balances
 */
async function deleteTransaction(transactionId) {
  const transactionService = require('./transactionService');
  return await transactionService.deleteTransactionSafely(parseInt(transactionId, 10));
}

module.exports = {
  calculateFinancialMetrics,
  processTransaction,
  deleteTransaction,
  syncCreditCardsAndDebts
};

