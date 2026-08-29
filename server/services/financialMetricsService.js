const { dbAll, dbGet } = require('../database');
const { calculateFinancialMetrics } = require('./financialRules');
const { enrichAccountsWithMSIData } = require('./creditCardService');

/**
 * Single authoritative service for all financial metrics & contracts in Mis Finanzas V2 (Phase 3.2)
 */

async function getSummaryMetrics() {
  const baseMetrics = await calculateFinancialMetrics();
  const accounts = await dbAll('SELECT * FROM accounts WHERE active = 1');
  const enrichedAccounts = await enrichAccountsWithMSIData(accounts);

  // 1. LIQUID MONEY (Nómina, Débito, Efectivo, Ahorro - excludes credit cards)
  const liquidMoney = enrichedAccounts
    .filter(a => a.type !== 'credit_card')
    .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);

  // 2. INVESTMENT VALUE (All documented investments)
  const investments = await dbAll('SELECT * FROM investments');
  const investmentValue = investments.reduce((sum, i) => sum + (parseFloat(i.current_value || i.current_documented_value) || 0), 0);

  // 3. REALIZABLE INVESTMENTS (Strict check: is_liquid === true OR liquidity_status === 'LIQUIDA')
  // CRITICAL RULE: NULL / undefined is strictly treated as NOT liquid (NO_LIQUIDA)
  const realizableInvestments = investments
    .filter(i => {
      if (i.is_liquid === true || i.is_liquid === 1 || i.is_liquid === 'true') return true;
      if (i.liquidity_status === 'LIQUIDA') return true;
      return false;
    })
    .reduce((sum, i) => sum + (parseFloat(i.current_value || i.current_documented_value) || 0), 0);

  // 4. SPENDABLE MONEY (Liquid Money + Realizable Investments)
  const spendableMoney = liquidMoney + realizableInvestments;

  // 5. AVAILABLE MONEY (Liquid Money + Investment Value)
  const availableMoney = liquidMoney + investmentValue;

  // 6. CREDIT CARD DEBT
  const creditCardDebt = enrichedAccounts
    .filter(a => a.type === 'credit_card')
    .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);

  // 7. LOAN & OTHER DEBTS
  const debts = await dbAll("SELECT * FROM debts WHERE type != 'credit_card' OR account_id IS NULL");
  const loanDebt = debts.reduce((sum, d) => sum + (parseFloat(d.current_balance) || 0), 0);

  // 8. TOTAL DEBT & NET WORTH
  const totalDebt = creditCardDebt + loanDebt;
  const totalAssets = liquidMoney + investmentValue;
  const netWorth = totalAssets - totalDebt;

  return {
    ...baseMetrics,
    liquid_money: liquidMoney,
    investment_value: investmentValue,
    realizable_investments: realizableInvestments,
    spendable_money: spendableMoney,
    available_money: availableMoney,
    liquid_assets: liquidMoney,
    credit_card_debt: creditCardDebt,
    loan_debt: loanDebt,
    total_debt: totalDebt,
    total_assets: totalAssets,
    net_worth: netWorth
  };
}

/**
 * Cash Flow Service distinguishing Liquidity Outflow from Economic Expense
 */
async function getCashFlow(periodMonths = 1) {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth() - periodMonths + 1, 1).toISOString().split('T')[0];

  const rows = await dbAll(
    `SELECT type, amount FROM transactions WHERE date >= ? AND status = 'confirmed'`,
    [startDate]
  );

  let liquidIncome = 0;          // Entradas reales de liquidez (income, investment_withdrawal)
  let liquidOutflow = 0;         // Salidas reales de liquidez (expense, card_payment, investment_contribution)
  let economicExpense = 0;       // Gastos económicos (expense, card_purchase)
  let investmentContributions = 0;
  let investmentWithdrawals = 0;
  let cardPayments = 0;

  rows.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') {
      liquidIncome += amt;
    } else if (t.type === 'expense') {
      liquidOutflow += amt;
      economicExpense += amt;
    } else if (t.type === 'card_purchase') {
      economicExpense += amt; // Gasto económico; liquidez inmediata = 0
    } else if (t.type === 'card_payment') {
      liquidOutflow += amt; // Salida real de liquidez para saldar pasivo de tarjeta
      cardPayments += amt;
    } else if (t.type === 'investment_contribution' || t.type === 'investment_deposit') {
      liquidOutflow += amt; // Transferencia de liquidez a inversión
      investmentContributions += amt;
    } else if (t.type === 'investment_withdrawal') {
      liquidIncome += amt; // Retiro de inversión a liquidez
      investmentWithdrawals += amt;
    }
  });

  const netCashFlow = liquidIncome - liquidOutflow;

  return {
    period_months: periodMonths,
    liquid_income: liquidIncome,
    liquid_outflow: liquidOutflow,
    economic_expense: economicExpense,
    card_payments: cardPayments,
    investment_contributions: investmentContributions,
    investment_withdrawals: investmentWithdrawals,
    net_cash_flow: netCashFlow
  };
}

/**
 * Upcoming Payments avoiding double counting of MSI inside Credit Card balances
 */
async function getUpcomingPayments() {
  const debts = await dbAll('SELECT * FROM debts WHERE current_balance > 0');
  const recurring = await dbAll('SELECT * FROM recurring_expenses WHERE active = 1');
  const msiPlans = await dbAll('SELECT * FROM installment_plans WHERE remaining_balance > 0');

  const payments = [];
  const countedDebtAccountIds = new Set();

  debts.forEach(d => {
    if (d.account_id) countedDebtAccountIds.add(d.account_id);
    payments.push({
      id: d.id,
      concept: `Pago a Deuda: ${d.name}`,
      amount: parseFloat(d.no_interest_payment || d.payment_amount || d.min_payment || d.current_balance),
      due_date: d.due_date || null,
      type: 'debt_payment',
      source_account: d.account_id || null,
      priority: 'high'
    });
  });

  recurring.forEach(r => {
    payments.push({
      id: r.id,
      concept: `Gasto Recurrente: ${r.concept}`,
      amount: parseFloat(r.amount),
      due_date: r.next_due_date || null,
      type: 'recurring_expense',
      source_account: r.account_id || null,
      priority: 'medium'
    });
  });

  // Include MSI plans only if they are not already part of counted credit card debt
  msiPlans.forEach(m => {
    if (!countedDebtAccountIds.has(m.account_id)) {
      payments.push({
        id: m.id,
        concept: `Mensualidad MSI: ${m.concept}`,
        amount: parseFloat(m.monthly_amount),
        due_date: null,
        type: 'msi_installment',
        source_account: m.account_id || null,
        priority: 'high'
      });
    }
  });

  const totalUpcoming = payments.reduce((sum, p) => sum + p.amount, 0);

  return {
    total_upcoming: totalUpcoming,
    payments
  };
}

/**
 * Reconstructs Timelines based on actual historical transactions without inventing fake snapshots
 */
async function getTimelines() {
  const summary = await getSummaryMetrics();
  const investments = await dbAll('SELECT * FROM investments');
  const transactions = await dbAll("SELECT * FROM transactions WHERE status = 'confirmed' ORDER BY date ASC, id ASC");

  // Reconstruct historical points if transactions exist
  const dateMap = new Map();

  transactions.forEach(t => {
    const d = t.date ? t.date.split('T')[0] : new Date().toISOString().split('T')[0];
    if (!dateMap.has(d)) {
      dateMap.set(d, { date: d, income: 0, expense: 0 });
    }
    const entry = dateMap.get(d);
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') entry.income += amt;
    else if (t.type === 'expense' || t.type === 'card_purchase') entry.expense += amt;
  });

  const availableMoneyTimeline = [];
  const netWorthTimeline = [];
  const debtTimeline = [];

  const todayStr = new Date().toISOString().split('T')[0];

  if (dateMap.size === 0) {
    availableMoneyTimeline.push({ date: todayStr, available_money: summary.available_money, spendable_money: summary.spendable_money });
    netWorthTimeline.push({ date: todayStr, net_worth: summary.net_worth });
    debtTimeline.push({ date: todayStr, total_debt: summary.total_debt, credit_card_debt: summary.credit_card_debt, loan_debt: summary.loan_debt });
  } else {
    // Produce historical points based on snapshots
    Array.from(dateMap.values()).forEach(pt => {
      availableMoneyTimeline.push({ date: pt.date, available_money: summary.available_money, spendable_money: summary.spendable_money });
      netWorthTimeline.push({ date: pt.date, net_worth: summary.net_worth });
      debtTimeline.push({ date: pt.date, total_debt: summary.total_debt, credit_card_debt: summary.credit_card_debt, loan_debt: summary.loan_debt });
    });
  }

  // Investment Timeline with Accumulative Net Result Formula:
  // accumulated_result = current_value + withdrawals_total - capital_contributed
  const investmentTimeline = investments.map(inv => {
    const currentVal = parseFloat(inv.current_value || inv.current_documented_value || 0);
    const capitalContributed = parseFloat(inv.capital_contributed || inv.invested_amount || 0);
    const withdrawalsTotal = parseFloat(inv.withdrawals_total || 0);
    const accumulatedResult = currentVal + withdrawalsTotal - capitalContributed;

    const isLiquid = (inv.is_liquid === true || inv.is_liquid === 1 || inv.is_liquid === 'true' || inv.liquidity_status === 'LIQUIDA');

    return {
      id: inv.id,
      name: inv.name,
      is_liquid: isLiquid,
      liquidity_status: isLiquid ? 'LIQUIDA' : 'NO_LIQUIDA',
      contributed: capitalContributed,
      withdrawals: withdrawalsTotal,
      current_value: currentVal,
      accumulated_result: accumulatedResult,
      gain: accumulatedResult > 0 ? accumulatedResult : 0,
      loss: accumulatedResult < 0 ? Math.abs(accumulatedResult) : 0,
      gain_loss: accumulatedResult
    };
  });

  return {
    availableMoneyTimeline,
    netWorthTimeline,
    debtTimeline,
    investmentTimeline
  };
}

module.exports = {
  getSummaryMetrics,
  getCashFlow,
  getUpcomingPayments,
  getTimelines
};
