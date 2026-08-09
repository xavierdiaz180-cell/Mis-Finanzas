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

  // Add recurring expenses projected for next 30 days
  recurringExpenses.forEach(r => {
    let multiplier = 1;
    if (r.frequency === 'weekly') multiplier = 4;
    else if (r.frequency === 'biweekly') multiplier = 2;
    else if (r.frequency === 'monthly') multiplier = 1;
    else if (r.frequency === 'bimonthly') multiplier = 0.5;
    else if (r.frequency === 'yearly') multiplier = 1 / 12;

    const projectedAmount = r.amount * multiplier;
    projectedRecurringTotal += projectedAmount;

    forecastItems.push({
      concept: r.concept,
      category: r.category,
      type: 'Gasto Recurrente',
      frequency: r.frequency,
      monthly_amount: projectedAmount
    });
  });

  // Add Debt Monthly Payments
  debts.forEach(d => {
    projectedRecurringTotal += d.payment_amount;
    forecastItems.push({
      concept: `Pago a Deuda: ${d.name}`,
      category: 'Pago de Deuda',
      type: 'Pago Obligatorio',
      monthly_amount: d.payment_amount
    });
  });

  // Add MSI Plans
  msiPlans.forEach(m => {
    projectedRecurringTotal += m.monthly_amount;
    forecastItems.push({
      concept: `MSI: ${m.concept}`,
      category: 'Meses Sin Intereses',
      type: 'MSI',
      monthly_amount: m.monthly_amount
    });
  });

  // Financial Metrics snapshot for evolution trend
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

module.exports = {
  getFullAnalysisData
};
