const { dbAll, dbGet } = require('../database');
const { calculateFinancialMetrics } = require('./financialRules');
const financialMetricsService = require('./financialMetricsService');
const { enrichAccountsWithMSIData } = require('./creditCardService');

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

  const totalExpenseCurrentMonth = categoryRows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);
  const categoriesBreakdown = categoryRows.map(r => ({
    category: r.category,
    total: parseFloat(r.total) || 0,
    percentage: totalExpenseCurrentMonth > 0 ? ((parseFloat(r.total) || 0) / totalExpenseCurrentMonth) * 100 : 0
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
    const amt = parseFloat(r.amount) || 0;
    projectedRecurringTotal += amt;
    forecastItems.push({
      concept: r.concept,
      category: r.category,
      type: 'Gasto Recurrente',
      monthly_amount: amt
    });
  });

  debts.forEach(d => {
    const amt = parseFloat(d.payment_amount) || 0;
    projectedRecurringTotal += amt;
    forecastItems.push({
      concept: `Pago a Deuda: ${d.name}`,
      category: 'Pago de Deuda',
      type: 'Pago Obligatorio',
      monthly_amount: amt
    });
  });

  msiPlans.forEach(m => {
    const amt = parseFloat(m.monthly_amount) || 0;
    projectedRecurringTotal += amt;
    forecastItems.push({
      concept: `MSI: ${m.concept}`,
      category: 'Meses Sin Intereses',
      type: 'MSI',
      monthly_amount: amt
    });
  });

  let currentMetrics = {};
  try {
    currentMetrics = await calculateFinancialMetrics();
  } catch (e) {
    console.error('Error in calculateFinancialMetrics:', e);
    try {
      currentMetrics = await financialMetricsService.getSummaryMetrics();
    } catch (_) {
      currentMetrics = {};
    }
  }

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
 * Calculates complete chart datasets for the Financial Analysis Center (GraficasView)
 * Provides authoritative KPIs, Timelines, Cash Flow, Category Breakdown, Debts, MSI, and Real Insights
 */
async function getChartsData(filters = {}) {
  const { startDate, endDate, start_date, end_date } = filters;
  const filterStart = startDate || start_date;
  const filterEnd = endDate || end_date;

  const today = new Date();
  const currentMonthStr = today.toISOString().substring(0, 7);
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthStr = prevMonthDate.toISOString().substring(0, 7);

  // 1. Authoritative Summary & Timelines from financialMetricsService (passing date filters)
  const summary = await financialMetricsService.getSummaryMetrics({ startDate: filterStart, endDate: filterEnd });
  const timelines = await financialMetricsService.getTimelines({ startDate: filterStart, endDate: filterEnd });
  const rawInvestments = await dbAll('SELECT * FROM investments ORDER BY id ASC');
  const accounts = await dbAll("SELECT * FROM accounts WHERE (active != 0 OR active IS NULL)");
  const debts = await dbAll('SELECT * FROM debts');
  const msiPlans = await dbAll("SELECT * FROM installment_plans WHERE status = 'active' OR remaining_balance > 0 ORDER BY purchase_date ASC, id ASC");

  // 2. Monthly Cash Flows
  let flowSql = `
    SELECT 
      LEFT(date, 7) as month,
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
      SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as net
    FROM transactions
    WHERE type IN ('income','expense')
  `;
  const flowParams = [];
  if (filterStart && filterEnd) {
    flowSql += ` AND date >= ? AND date <= ?`;
    flowParams.push(filterStart, filterEnd);
  } else {
    flowSql += ` AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM-DD')`;
  }
  flowSql += ` GROUP BY LEFT(date, 7) ORDER BY month ASC`;

  const monthlyFlowRaw = await dbAll(flowSql, flowParams);

  const monthlyFlow = monthlyFlowRaw.map(m => {
    const d = new Date(m.month + '-02');
    const label = d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' });
    const inc = parseFloat(m.income) || 0;
    const exp = parseFloat(m.expenses) || 0;
    const net = inc - exp;
    return {
      month: m.month,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      income: inc,
      expenses: exp,
      net: net
    };
  });

  // Current month & Previous month flow metrics
  const thisMonthData = monthlyFlow.find(m => m.month === currentMonthStr) || { income: 0, expenses: 0, net: 0 };
  const prevMonthData = monthlyFlow.find(m => m.month === prevMonthStr) || { income: 0, expenses: 0, net: 0 };

  const last6Months = monthlyFlow.slice(-6);
  const avg6Income = last6Months.length > 0 ? (last6Months.reduce((s, m) => s + m.income, 0) / last6Months.length) : 0;
  const avg6Expenses = last6Months.length > 0 ? (last6Months.reduce((s, m) => s + m.expenses, 0) / last6Months.length) : 0;
  const avg6Net = avg6Income - avg6Expenses;

  const incomeMomPct = prevMonthData.income > 0 ? (((thisMonthData.income - prevMonthData.income) / prevMonthData.income) * 100) : 0;
  const expenseMomPct = prevMonthData.expenses > 0 ? (((thisMonthData.expenses - prevMonthData.expenses) / prevMonthData.expenses) * 100) : 0;

  // 3. Expenses by Category for the selected period
  let catSql = `
    SELECT category, SUM(amount) as total, COUNT(*) as count
    FROM transactions
    WHERE type = 'expense'
  `;
  const catParams = [];
  if (filterStart && filterEnd) {
    catSql += ` AND date >= ? AND date <= ?`;
    catParams.push(filterStart, filterEnd);
  } else {
    catSql += ` AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM-DD')`;
  }
  catSql += ` GROUP BY category ORDER BY total DESC`;

  const categoryRows = await dbAll(catSql, catParams);
  const totalExpense = categoryRows.reduce((sum, r) => sum + (parseFloat(r.total) || 0), 0);

  // Group Top 5 categories + "Otros"
  let top5Categories = [];
  let otherTotal = 0;
  let otherCount = 0;

  categoryRows.forEach((cat, idx) => {
    const tot = parseFloat(cat.total) || 0;
    const cnt = parseInt(cat.count, 10) || 0;
    if (idx < 5) {
      top5Categories.push({
        category: cat.category || 'Sin categoría',
        total: tot,
        count: cnt,
        percentage: totalExpense > 0 ? parseFloat(((tot / totalExpense) * 100).toFixed(1)) : 0
      });
    } else {
      otherTotal += tot;
      otherCount += cnt;
    }
  });

  if (otherTotal > 0) {
    top5Categories.push({
      category: 'Otros',
      total: otherTotal,
      count: otherCount,
      percentage: totalExpense > 0 ? parseFloat(((otherTotal / totalExpense) * 100).toFixed(1)) : 0
    });
  }

  // 4. Credit Cards & Debt Utilization Breakdown
  const creditCards = accounts
    .filter(a => a.type === 'credit_card')
    .map(c => {
      const bal = parseFloat(c.balance || 0);
      const lim = parseFloat(c.credit_limit || 0);
      const avail = lim > 0 ? Math.max(0, lim - bal) : parseFloat(c.available_credit || 0);
      const utilPct = lim > 0 ? Math.min(100, Math.max(0, (bal / lim) * 100)) : 0;
      return {
        id: c.id,
        name: c.name,
        balance: bal,
        credit_limit: lim,
        available_credit: avail,
        utilization_pct: parseFloat(utilPct.toFixed(1))
      };
    });

  // 5. MSI (Meses Sin Intereses) Analytics & Projection
  let totalMsiRemaining = 0;
  let totalMsiMonthlyCommitment = 0;
  let totalMsiInstallmentsRemaining = 0;

  const msiList = msiPlans.map(p => {
    const totalInst = parseInt(p.installments_total || 0, 10);
    const paidInst = parseInt(p.installments_paid || 0, 10);
    const remInst = parseInt(p.installments_remaining || Math.max(0, totalInst - paidInst), 10);
    const monthly = parseFloat(p.monthly_amount || 0);
    const remBal = parseFloat((monthly * remInst).toFixed(2));

    totalMsiRemaining += remBal;
    totalMsiMonthlyCommitment += monthly;
    totalMsiInstallmentsRemaining += remInst;

    const card = accounts.find(a => a.id === p.credit_card_id || a.id === p.account_id);

    return {
      id: p.id,
      concept: p.concept || 'Plan MSI',
      card_name: card ? card.name : 'Tarjeta',
      total_amount: parseFloat(p.total_amount || 0),
      monthly_amount: monthly,
      installments_total: totalInst,
      installments_paid: paidInst,
      installments_remaining: remInst,
      remaining_balance: remBal,
      purchase_date: p.purchase_date
    };
  });

  // MSI Amortization Projection: simulate how remaining balance steps down month by month
  const msiProjection = [];
  const maxMonthsToProject = Math.min(12, Math.max(...msiList.map(p => p.installments_remaining), 1));
  let runningMsiBal = totalMsiRemaining;

  for (let m = 0; m <= maxMonthsToProject; m++) {
    const projDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const label = m === 0 ? 'Actual' : projDate.toLocaleDateString('es-MX', { month: 'short' });

    msiProjection.push({
      month_index: m,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      balance: Math.max(0, parseFloat(runningMsiBal.toFixed(2)))
    });

    const activeMonthlyInMonth = msiList
      .filter(p => p.installments_remaining > m)
      .reduce((sum, p) => sum + p.monthly_amount, 0);

    runningMsiBal = Math.max(0, runningMsiBal - activeMonthlyInMonth);
  }

  // 6. Investments Breakdown
  const investmentTimeline = timelines.investmentTimeline || [];
  const totalInvested = investmentTimeline.reduce((s, i) => s + (parseFloat(i.contributed) || 0), 0);
  const totalCurrentValue = investmentTimeline.reduce((s, i) => s + (parseFloat(i.current_value) || 0), 0);
  const totalReturn = totalCurrentValue - totalInvested;
  const totalReturnPct = totalInvested > 0 ? ((totalReturn / totalInvested) * 100) : 0;

  // 7. Combined Unified Timeline (Net Worth, Liquidity, Debt)
  const netWorthMap = new Map();
  (timelines.netWorthTimeline || []).forEach(p => netWorthMap.set(p.date, parseFloat(p.net_worth) || 0));

  const liquidMap = new Map();
  (timelines.availableMoneyTimeline || []).forEach(p => liquidMap.set(p.date, parseFloat(p.available_money) || 0));

  const debtMap = new Map();
  (timelines.debtTimeline || []).forEach(p => debtMap.set(p.date, {
    total: parseFloat(p.total_debt) || 0,
    cards: parseFloat(p.credit_card_debt) || 0,
    loans: parseFloat(p.loan_debt) || 0
  }));

  let allTimelineDates = Array.from(new Set([
    ...Array.from(netWorthMap.keys()),
    ...Array.from(liquidMap.keys()),
    ...Array.from(debtMap.keys())
  ])).sort();

  if (filterStart && filterEnd) {
    allTimelineDates = allTimelineDates.filter(d => d >= filterStart && d <= filterEnd);
  }

  const combinedTimeline = allTimelineDates.map(dateStr => {
    const d = new Date(dateStr + 'T00:00:00');
    const label = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    const debtObj = debtMap.get(dateStr) || { total: 0, cards: 0, loans: 0 };
    return {
      date: dateStr,
      label,
      net_worth: netWorthMap.get(dateStr) || 0,
      liquid: summary.liquid_money,
      available: liquidMap.get(dateStr) || 0,
      debt: debtObj.total,
      credit_card_debt: debtObj.cards,
      loan_debt: debtObj.loans
    };
  });

  // 8. Factual Automatic Insights
  const insights = [];

  if (summary.net_worth >= 0) {
    insights.push({
      type: 'positive',
      title: 'Patrimonio Positivo',
      text: `Tu patrimonio neto actual es de $${summary.net_worth.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (activos superan pasivos).`
    });
  } else {
    insights.push({
      type: 'warning',
      title: 'Patrimonio Negativo',
      text: `Tus deudas ($${summary.total_debt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}) superan tus activos ($${summary.total_assets.toLocaleString('es-MX', { minimumFractionDigits: 2 })}).`
    });
  }

  const periodNet = summary.period?.net_flow !== undefined ? summary.period.net_flow : thisMonthData.net;
  if (periodNet > 0) {
    insights.push({
      type: 'positive',
      title: 'Flujo Positivo en el Periodo',
      text: `Estás generando dinero en el periodo seleccionado con un superávit neto de $${periodNet.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.`
    });
  } else if (periodNet < 0) {
    insights.push({
      type: 'danger',
      title: 'Déficit en el Periodo',
      text: `Tus gastos superan a tus ingresos en el periodo seleccionado por $${Math.abs(periodNet).toLocaleString('es-MX', { minimumFractionDigits: 2 })}.`
    });
  }

  if (top5Categories.length > 0 && top5Categories[0].percentage > 0) {
    const topCat = top5Categories[0];
    insights.push({
      type: 'info',
      title: `Gasto Principal: ${topCat.category}`,
      text: `${topCat.category} representa el ${topCat.percentage}% de tus egresos en el periodo ($${topCat.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}).`
    });
  }

  if (totalMsiRemaining > 0 && summary.total_debt > 0) {
    const msiDebtPct = ((totalMsiRemaining / summary.total_debt) * 100).toFixed(1);
    insights.push({
      type: 'info',
      title: 'Obligación a Meses Sin Intereses',
      text: `Tus compras a MSI representan el ${msiDebtPct}% de tu deuda total, con un compromiso mensual activo de $${totalMsiMonthlyCommitment.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.`
    });
  }

  return {
    summary,
    patrimonioTimeline: combinedTimeline,
    monthlyFlow,
    monthlyFlowSummary: {
      thisMonth: thisMonthData,
      prevMonth: prevMonthData,
      avg6Months: {
        income: parseFloat(avg6Income.toFixed(2)),
        expenses: parseFloat(avg6Expenses.toFixed(2)),
        net: parseFloat(avg6Net.toFixed(2))
      },
      incomeMomPct: parseFloat(incomeMomPct.toFixed(1)),
      expenseMomPct: parseFloat(expenseMomPct.toFixed(1))
    },
    expensesByCategory: top5Categories,
    allExpensesByCategory: categoryRows,
    debts: {
      total_debt: summary.total_debt,
      credit_card_debt: summary.credit_card_debt,
      loan_debt: summary.loan_debt,
      cards: creditCards,
      debtTimeline: timelines.debtTimeline || []
    },
    msi: {
      total_msi_remaining: totalMsiRemaining,
      total_monthly_commitment: totalMsiMonthlyCommitment,
      active_plans_count: msiPlans.length,
      installments_remaining_total: totalMsiInstallmentsRemaining,
      plans: msiList,
      projection: msiProjection
    },
    investments: {
      totalInvested,
      totalCurrentValue,
      totalReturn,
      totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
      list: investmentTimeline
    },
    insights
  };
}
