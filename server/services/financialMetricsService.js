const { dbAll, dbGet } = require('../database');
const { calculateFinancialMetrics } = require('./financialRules');
const { enrichAccountsWithMSIData } = require('./creditCardService');

/**
 * Single authoritative service for all financial metrics & contracts in Mis Finanzas V2 (Phase 2B.1)
 */

async function getSummaryMetrics() {
  const baseMetrics = await calculateFinancialMetrics();
  const accounts = await dbAll('SELECT * FROM accounts WHERE active = 1');
  const enrichedAccounts = await enrichAccountsWithMSIData(accounts);

  // 1. LIQUID MONEY (Nómina, Débito, Efectivo, Ahorro)
  const liquidMoney = enrichedAccounts
    .filter(a => a.type !== 'credit_card')
    .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);

  // 2. INVESTMENT VALUE (All investments)
  const investments = await dbAll('SELECT * FROM investments');
  const investmentValue = investments.reduce((sum, i) => sum + (parseFloat(i.current_value || i.current_documented_value) || 0), 0);

  // 3. REALIZABLE INVESTMENTS (is_liquid = true OR liquidity_status = 'LIQUIDA')
  const realizableInvestments = investments
    .filter(i => (i.is_liquid === true || i.is_liquid === 1 || i.is_liquid === 'true' || i.liquidity_status === 'LIQUIDA' || !i.liquidity_status))
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

async function getCashFlow(periodMonths = 1) {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth() - periodMonths + 1, 1).toISOString().split('T')[0];

  const rows = await dbAll(
    `SELECT type, amount FROM transactions WHERE date >= ? AND status = 'confirmed'`,
    [startDate]
  );

  let liquidIncome = 0;
  let liquidExpense = 0;
  let investmentContributions = 0;
  let investmentWithdrawals = 0;

  rows.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') liquidIncome += amt;
    else if (t.type === 'expense' || t.type === 'card_purchase') liquidExpense += amt;
    else if (t.type === 'investment_contribution' || t.type === 'investment_deposit') investmentContributions += amt;
    else if (t.type === 'investment_withdrawal') investmentWithdrawals += amt;
  });

  const netCashFlow = liquidIncome - liquidExpense - investmentContributions + investmentWithdrawals;

  return {
    period_months: periodMonths,
    liquid_income: liquidIncome,
    liquid_expense: liquidExpense,
    investment_contributions: investmentContributions,
    investment_withdrawals: investmentWithdrawals,
    net_cash_flow: netCashFlow
  };
}

async function getUpcomingPayments() {
  const debts = await dbAll('SELECT * FROM debts WHERE current_balance > 0');
  const recurring = await dbAll('SELECT * FROM recurring_expenses WHERE active = 1');
  const msiPlans = await dbAll('SELECT * FROM installment_plans WHERE remaining_balance > 0');

  const payments = [];

  debts.forEach(d => {
    payments.push({
      concept: `Pago a Deuda: ${d.name}`,
      amount: parseFloat(d.no_interest_payment || d.payment_amount || d.min_payment || d.current_balance),
      due_date: d.due_date || null,
      type: 'debt_payment',
      priority: 'high'
    });
  });

  recurring.forEach(r => {
    payments.push({
      concept: `Gasto Recurrente: ${r.concept}`,
      amount: parseFloat(r.amount),
      due_date: r.next_due_date || null,
      type: 'recurring_expense',
      priority: 'medium'
    });
  });

  msiPlans.forEach(m => {
    payments.push({
      concept: `Mensualidad MSI: ${m.concept}`,
      amount: parseFloat(m.monthly_amount),
      due_date: null,
      type: 'msi_installment',
      priority: 'high'
    });
  });

  const totalUpcoming = payments.reduce((sum, p) => sum + p.amount, 0);

  return {
    total_upcoming: totalUpcoming,
    payments
  };
}

async function getTimelines() {
  const summary = await getSummaryMetrics();
  const investments = await dbAll('SELECT * FROM investments');

  const availableMoneyTimeline = [
    { date: new Date().toISOString().split('T')[0], available_money: summary.available_money, spendable_money: summary.spendable_money }
  ];

  const netWorthTimeline = [
    { date: new Date().toISOString().split('T')[0], net_worth: summary.net_worth }
  ];

  const debtTimeline = [
    {
      date: new Date().toISOString().split('T')[0],
      total_debt: summary.total_debt,
      credit_card_debt: summary.credit_card_debt,
      loan_debt: summary.loan_debt
    }
  ];

  const investmentTimeline = investments.map(inv => ({
    id: inv.id,
    name: inv.name,
    is_liquid: inv.is_liquid !== false && inv.liquidity_status !== 'NO_LIQUIDA',
    contributed: parseFloat(inv.capital_contributed || inv.invested_amount || 0),
    withdrawals: parseFloat(inv.withdrawals_total || 0),
    current_value: parseFloat(inv.current_value || inv.current_documented_value || 0),
    gain_loss: (parseFloat(inv.current_value || inv.current_documented_value || 0)) - (parseFloat(inv.capital_contributed || inv.invested_amount || 0))
  }));

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
