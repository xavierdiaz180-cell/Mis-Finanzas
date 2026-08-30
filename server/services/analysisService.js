const { dbAll, dbGet } = require('../database');
const { calculateFinancialMetrics } = require('./financialRules');

/**
 * Calculates complete analytics and 30-day recurring forecast
 */
async function getFullAnalysisData() {
  const today = new Date();
  const currentMonth = today.toISOString().substring(0, 7);

  // 1. Income vs Expenses by Month (Last 6 Months)
  const monthlyTrends = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthKey = d.toISOString().substring(0, 7);
    const monthName = d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });

    const incRow = await dbAll(`SELECT SUM(amount) as total FROM transactions WHERE type = 'income' AND date LIKE ?`, [`${monthKey}%`]);
    const expRow = await dbAll(`SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND date LIKE ?`, [`${monthKey}%`]);

    monthlyTrends.push({
      month: monthKey,
      month_label: monthName,
      income: incRow[0]?.total || 0,
      expense: expRow[0]?.total || 0,
      savings: (incRow[0]?.total || 0) - (expRow[0]?.total || 0)
    });
  }

  // 2. Expenses by Category (Current Month)
  const categoryRows = await dbAll(`
    SELECT category, SUM(amount) as total 
    FROM transactions 
    WHERE type = 'expense' AND date LIKE ?
    GROUP BY category
    ORDER BY total DESC
  `, [`${currentMonth}%`]);

  const totalExpenseCurrentMonth = categoryRows.reduce((sum, r) => sum + r.total, 0);
  const categoriesBreakdown = categoryRows.map(r => ({
    category: r.category,
    total: r.total,
    percentage: totalExpenseCurrentMonth > 0 ? (r.total / totalExpenseCurrentMonth) * 100 : 0
  }));

  // 3. Savings Capacity (% of income saved)
  const currentMonthIncome = monthlyTrends[monthlyTrends.length - 1].income;
  const currentMonthExpense = monthlyTrends[monthlyTrends.length - 1].expense;
  const savingsCapacityAmount = currentMonthIncome - currentMonthExpense;
  const savingsCapacityPercentage = currentMonthIncome > 0 ? Math.max(0, (savingsCapacityAmount / currentMonthIncome) * 100) : 0;

  // 4. Month over Month (MoM) Comparison (Current Month vs Previous Month)
  const prevMonthTrend = monthlyTrends[monthlyTrends.length - 2] || { income: 0, expense: 0 };
  const incomeChangePct = prevMonthTrend.income > 0 ? ((currentMonthIncome - prevMonthTrend.income) / prevMonthTrend.income) * 100 : 0;
  const expenseChangePct = prevMonthTrend.expense > 0 ? ((currentMonthExpense - prevMonthTrend.expense) / prevMonthTrend.expense) * 100 : 0;

  // 5. 30-Day Expense Forecast (Recurring Expenses + Debts + MSI)
  const recurringExpenses = await dbAll('SELECT * FROM recurring_expenses WHERE active = 1');
  const debts = await dbAll('SELECT name, payment_amount FROM debts WHERE current_balance > 0');
  const msiPlans = await dbAll('SELECT concept, monthly_amount FROM installment_plans WHERE remaining_balance > 0');

  let projectedRecurringTotal = 0;
  const forecastItems = [];

  recurringExpenses.forEach(r => {
    projectedRecurringTotal += r.amount;
    forecastItems.push({
      concept: r.concept,
      category: r.category,
      type: 'Gasto Recurrente',
      monthly_amount: r.amount
    });
  });

  debts.forEach(d => {
    projectedRecurringTotal += d.payment_amount;
    forecastItems.push({
      concept: `Pago a Deuda: ${d.name}`,
      category: 'Pago de Deuda',
      type: 'Pago Obligatorio',
      monthly_amount: d.payment_amount
    });
  });

  msiPlans.forEach(m => {
    projectedRecurringTotal += m.monthly_amount;
    forecastItems.push({
      concept: `MSI: ${m.concept}`,
      category: 'Meses Sin Intereses',
      type: 'MSI',
      monthly_amount: m.monthly_amount
    });
  });

  const currentMetrics = await calculateFinancialMetrics();

  return {
    monthly_trends: monthlyTrends,
    categories_breakdown: categoriesBreakdown,
    savings_capacity: {
      amount: savingsCapacityAmount,
      percentage: savingsCapacityPercentage
    },
    mom_comparison: {
      income_change_pct: incomeChangePct,
      expense_change_pct: expenseChangePct
    },
    forecast_30_days: {
      projected_total: projectedRecurringTotal,
      items: forecastItems
    },
    current_metrics: currentMetrics
  };
}

/**
 * Calculates complete chart datasets (investments, monthly flows, category breakdown, balance timeline)
 */
async function getChartsData() {
  const investments = await dbAll('SELECT * FROM investments ORDER BY last_update ASC');

  const expensesByCategory = await dbAll(`
    SELECT category, SUM(amount) as total, COUNT(*) as count
    FROM transactions
    WHERE type = 'expense'
      AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM-DD')
    GROUP BY category
    ORDER BY total DESC
  `);

  const monthlyFlow = await dbAll(`
    SELECT 
      LEFT(date, 7) as month,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
      SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as net
    FROM transactions
    WHERE type IN ('income','expense')
      AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM-DD')
    GROUP BY LEFT(date, 7)
    ORDER BY month ASC
  `);

  // Corrected balanceTimeline: uses actual current liquid balance as anchor,
  // then reconstructs history by reverse-applying transaction deltas.
  // This mirrors the logic in financialMetricsService.getTimelines() and is consistent
  // with the dashboard values.
  const accounts = await dbAll("SELECT * FROM accounts WHERE (active != 0 OR active IS NULL) AND type != 'credit_card' AND type != 'loan'");
  const currentLiquid = accounts.reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);

  const dailyTransactions = await dbAll(`
    SELECT 
      date,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
      SUM(CASE WHEN type = 'card_payment' THEN amount ELSE 0 END) as card_payments,
      SUM(CASE WHEN type IN ('investment_contribution','investment_deposit') THEN amount ELSE 0 END) as inv_out,
      SUM(CASE WHEN type = 'investment_withdrawal' THEN amount ELSE 0 END) as inv_in
    FROM transactions
    WHERE type IN ('income','expense','card_payment','investment_contribution','investment_deposit','investment_withdrawal')
      AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '90 days', 'YYYY-MM-DD')
    GROUP BY date
    ORDER BY date ASC
  `);

  // Reverse-reconstruct liquid balance per day
  let runningBalance = currentLiquid;
  const reversedDays = [...dailyTransactions].reverse();
  const dayBalanceMap = new Map();

  reversedDays.forEach(day => {
    dayBalanceMap.set(day.date, runningBalance);
    // Roll back this day's transactions to get balance before this day
    const inc     = parseFloat(day.income || 0);
    const exp     = parseFloat(day.expenses || 0);
    const cardPay = parseFloat(day.card_payments || 0);
    const invOut  = parseFloat(day.inv_out || 0);
    const invIn   = parseFloat(day.inv_in || 0);
    runningBalance = runningBalance - inc + exp + cardPay + invOut - invIn;
  });

  const balanceTimeline = dailyTransactions.map(day => ({
    date:     day.date,
    balance:  parseFloat((dayBalanceMap.get(day.date) || 0).toFixed(2)),
    income:   parseFloat(day.income || 0),
    expenses: parseFloat(day.expenses || 0)
  }));

  const investmentTimeline = investments.map(inv => ({
    name:      inv.name,
    invested:  parseFloat(inv.capital_contributed || inv.invested_amount || 0),
    current:   parseFloat(inv.current_value || inv.current_documented_value || 0),
    gainLoss:  (parseFloat(inv.current_value || inv.current_documented_value || 0)) - (parseFloat(inv.capital_contributed || inv.invested_amount || 0)),
    returnPct: inv.invested_amount > 0
      ? parseFloat((((inv.current_documented_value - inv.invested_amount) / inv.invested_amount) * 100).toFixed(2))
      : 0,
    lastUpdate: inv.last_update || 'Sin actualizar',
    riskLevel:  inv.risk_level
  }));

  const totalInvested     = investmentTimeline.reduce((s, i) => s + i.invested, 0);
  const totalCurrentValue = investmentTimeline.reduce((s, i) => s + i.current, 0);
  const totalReturn       = totalCurrentValue - totalInvested;
  const totalReturnPct    = totalInvested > 0 ? ((totalReturn / totalInvested) * 100).toFixed(2) : 0;

  return {
    investmentTimeline,
    investmentSummary: { totalInvested, totalCurrentValue, totalReturn, totalReturnPct: parseFloat(totalReturnPct) },
    expensesByCategory,
    monthlyFlow,
    balanceTimeline
  };
}

module.exports = {
  getFullAnalysisData,
  getChartsData
};
