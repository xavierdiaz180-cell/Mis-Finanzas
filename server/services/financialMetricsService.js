const { dbAll, dbGet } = require('../database');
const { calculateFinancialMetrics } = require('./financialRules');
const { enrichAccountsWithMSIData } = require('./creditCardService');
const budgetingService = require('./budgetingService');

/**
 * Single authoritative service for all financial metrics & contracts in Mis Finanzas V2
 * Supports Global Date Range filtering while strictly preserving real current balances
 */

async function getSummaryMetrics(dateFilters = {}) {
  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  const startDate = dateFilters.startDate || dateFilters.start_date || currentMonthStart;
  const endDate = dateFilters.endDate || dateFilters.end_date || currentMonthEnd;

  const accounts = await dbAll("SELECT * FROM accounts WHERE (active = 1 OR active IS NULL) AND active::text != '0'");
  const enrichedAccounts = await enrichAccountsWithMSIData(accounts);

  // 1. LIQUID MONEY TODAY (Real present state)
  const liquidMoney = enrichedAccounts
    .filter(a => a.type !== 'credit_card' && a.type !== 'loan')
    .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);

  // 2. INVESTMENT VALUE TODAY
  const investments = await dbAll('SELECT * FROM investments');
  const investmentValue = investments.reduce((sum, i) => sum + (parseFloat(i.current_value || i.current_documented_value) || 0), 0);

  // 3. REALIZABLE INVESTMENTS TODAY
  const realizableInvestments = investments
    .filter(i => {
      if (i.is_liquid === true || i.is_liquid === 1 || i.is_liquid === 'true') return true;
      if (i.liquidity_status === 'LIQUIDA') return true;
      return false;
    })
    .reduce((sum, i) => sum + (parseFloat(i.current_value || i.current_documented_value) || 0), 0);

  // 4. SPENDABLE & AVAILABLE MONEY TODAY
  const spendableMoney = liquidMoney + realizableInvestments;
  const availableMoney = liquidMoney + investmentValue;

  // 5. TOTAL DEBT & CREDIT CARD DEBT TODAY
  const debts = await dbAll('SELECT * FROM debts');
  const totalDebt = debts.reduce((sum, d) => sum + (parseFloat(d.current_balance) || 0), 0);
  const creditCardDebt = debts
    .filter(d => d.type === 'credit_card')
    .reduce((sum, d) => sum + (parseFloat(d.current_balance) || 0), 0);
  const loanDebt = debts
    .filter(d => d.type !== 'credit_card')
    .reduce((sum, d) => sum + (parseFloat(d.current_balance) || 0), 0);

  // 6. TOTAL ASSETS & NET WORTH TODAY
  const totalAssets = liquidMoney + investmentValue;
  const netWorth = totalAssets - totalDebt;

  // 7. PERIOD ACTIVITY (Between startDate and endDate)
  const periodTxs = await dbAll(
    `SELECT type, amount, date FROM transactions 
     WHERE date >= ? AND date <= ? AND (status != 'cancelled' OR status IS NULL)`,
    [startDate, endDate]
  );

  let periodIncome = 0;
  let periodExpenses = 0;
  let periodTransfers = 0;
  let periodCardPayments = 0;
  let periodInvContributions = 0;
  let periodInvWithdrawals = 0;

  periodTxs.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income') {
      periodIncome += amt;
    } else if (t.type === 'expense') {
      periodExpenses += amt;
    } else if (t.type === 'transfer') {
      periodTransfers += amt;
    } else if (t.type === 'card_payment') {
      periodCardPayments += amt;
    } else if (t.type === 'investment_contribution' || t.type === 'investment_deposit') {
      periodInvContributions += amt;
    } else if (t.type === 'investment_withdrawal') {
      periodInvWithdrawals += amt;
    }
  });

  const periodNetFlow = periodIncome - periodExpenses;

  // 8. RECONSTRUCT HISTORICAL STARTING BALANCE BEFORE startDate
  // All transactions that happened on or after startDate are rolled back from current liquid money
  const futureTxs = await dbAll(
    `SELECT type, amount FROM transactions 
     WHERE date >= ? AND (status != 'cancelled' OR status IS NULL)`,
    [startDate]
  );

  let initialLiquidBalance = liquidMoney;
  futureTxs.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'income' || t.type === 'investment_withdrawal') {
      initialLiquidBalance -= amt;
    } else if (t.type === 'expense' || t.type === 'card_payment' || t.type === 'investment_contribution' || t.type === 'loan_payment') {
      initialLiquidBalance += amt;
    }
  });

  const finalLiquidBalancePeriod = initialLiquidBalance + periodIncome + periodInvWithdrawals - periodExpenses - periodCardPayments - periodInvContributions;

  // 9. DAILY BUDGET STATUS
  let presupuestoDiario = {};
  try {
    presupuestoDiario = await budgetingService.getDailyBudgetStatus();
  } catch (e) {
    console.error('Error fetching daily budget status in getSummaryMetrics:', e);
  }

  return {
    // Current Real State (Unaltered by date filters)
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
    net_worth: netWorth,
    disponible_hoy: availableMoney,
    total_inversiones: investmentValue,
    total_deuda: totalDebt,
    riqueza_neta: netWorth,
    presupuesto_diario: presupuestoDiario,

    // Period-specific Metrics (Filtered by startDate / endDate)
    period: {
      start_date: startDate,
      end_date: endDate,
      saldo_inicial: parseFloat(initialLiquidBalance.toFixed(2)),
      saldo_final: parseFloat(finalLiquidBalancePeriod.toFixed(2)),
      income: parseFloat(periodIncome.toFixed(2)),
      expenses: parseFloat(periodExpenses.toFixed(2)),
      transfers: parseFloat(periodTransfers.toFixed(2)),
      card_payments: parseFloat(periodCardPayments.toFixed(2)),
      net_flow: parseFloat(periodNetFlow.toFixed(2)),
      tx_count: periodTxs.length
    }
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

  let liquidIncome = 0;
  let liquidOutflow = 0;
  let economicExpense = 0;
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
      economicExpense += amt;
    } else if (t.type === 'card_payment') {
      liquidOutflow += amt;
      cardPayments += amt;
    } else if (t.type === 'investment_contribution' || t.type === 'investment_deposit') {
      liquidOutflow += amt;
      investmentContributions += amt;
    } else if (t.type === 'investment_withdrawal') {
      liquidIncome += amt;
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
 * Upcoming Payments distinguishing Total Debt from Monthly Installments & Interest-Free Payments
 */
async function getUpcomingPayments() {
  const debts = await dbAll('SELECT * FROM debts WHERE current_balance > 0');
  const recurring = await dbAll('SELECT * FROM recurring_expenses WHERE (active = 1 OR active IS NULL)');
  const msiPlans = await dbAll("SELECT * FROM installment_plans WHERE status = 'active' OR remaining_balance > 0");

  const payments = [];
  const processedCardIds = new Set();

  msiPlans.forEach(m => {
    if (m.account_id) processedCardIds.add(m.account_id);
    payments.push({
      id: `msi_${m.id}`,
      type: 'MSI',
      concept: `MSI: ${m.concept}`,
      monthly_amount: parseFloat(m.monthly_amount),
      remaining_payments: parseInt(m.installments_remaining || (m.installments_total - m.installments_paid), 10),
      total_balance: parseFloat(m.remaining_balance || m.remaining_principal),
      account_id: m.account_id || m.credit_card_id
    });
  });

  debts.forEach(d => {
    payments.push({
      id: `debt_${d.id}`,
      type: d.type === 'credit_card' ? 'credit_card' : 'loan',
      name: d.name,
      monthly_amount: parseFloat(d.payment_amount || d.min_payment || 0),
      total_balance: parseFloat(d.current_balance || 0),
      due_date: d.due_date,
      cutoff_date: d.cutoff_date,
      account_id: d.account_id
    });
  });

  return {
    upcoming_payments: payments,
    total_monthly_commitment: payments.reduce((s, p) => s + (p.monthly_amount || 0), 0)
  };
}

/**
 * Reconstructs Timelines Date-by-Date based on Chronological Financial Deltas
 */
async function getTimelines(filters = {}) {
  const currentSummary = await getSummaryMetrics(filters);
  const investments = await dbAll('SELECT * FROM investments');
  const transactions = await dbAll("SELECT * FROM transactions WHERE (status != 'cancelled' OR status IS NULL) ORDER BY date ASC, id ASC");

  const todayStr = new Date().toISOString().split('T')[0];

  const txByDateMap = new Map();
  transactions.forEach(t => {
    const d = t.date ? t.date.split('T')[0] : todayStr;
    if (!txByDateMap.has(d)) {
      txByDateMap.set(d, []);
    }
    txByDateMap.get(d).push(t);
  });

  const sortedDates = Array.from(txByDateMap.keys()).sort();

  const availableMoneyTimeline = [];
  const spendableMoneyTimeline = [];
  const netWorthTimeline = [];
  const debtTimeline = [];
  const cashFlowTimeline = [];

  if (sortedDates.length === 0) {
    availableMoneyTimeline.push({ date: todayStr, available_money: currentSummary.available_money });
    spendableMoneyTimeline.push({ date: todayStr, spendable_money: currentSummary.spendable_money });
    netWorthTimeline.push({ date: todayStr, net_worth: currentSummary.net_worth });
    debtTimeline.push({ date: todayStr, total_debt: currentSummary.total_debt, credit_card_debt: currentSummary.credit_card_debt, loan_debt: currentSummary.loan_debt });
    cashFlowTimeline.push({ date: todayStr, net_cash_flow: 0 });
  } else {
    const dateStateMap = new Map();

    let stateLiquid = currentSummary.liquid_money;
    let stateInvestment = currentSummary.investment_value;
    let stateRealizable = currentSummary.realizable_investments;
    let stateCardDebt = currentSummary.credit_card_debt;
    let stateLoanDebt = currentSummary.loan_debt;

    const revDates = [...sortedDates].reverse();

    revDates.forEach((d) => {
      dateStateMap.set(d, {
        date: d,
        liquid_money: stateLiquid,
        investment_value: stateInvestment,
        realizable_investments: stateRealizable,
        available_money: stateLiquid + stateInvestment,
        spendable_money: stateLiquid + stateRealizable,
        total_debt: stateCardDebt + stateLoanDebt,
        credit_card_debt: stateCardDebt,
        loan_debt: stateLoanDebt,
        net_worth: (stateLiquid + stateInvestment) - (stateCardDebt + stateLoanDebt)
      });

      const dayTxs = txByDateMap.get(d) || [];
      dayTxs.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'income') {
          stateLiquid -= amt;
        } else if (t.type === 'expense') {
          stateLiquid += amt;
        } else if (t.type === 'card_purchase') {
          stateCardDebt -= amt;
        } else if (t.type === 'card_payment') {
          stateLiquid += amt;
          stateCardDebt += amt;
        } else if (t.type === 'investment_contribution' || t.type === 'investment_deposit') {
          stateLiquid += amt;
          stateInvestment -= amt;
          stateRealizable -= amt;
        } else if (t.type === 'investment_withdrawal') {
          stateLiquid -= amt;
          stateInvestment += amt;
          stateRealizable += amt;
        } else if (t.type === 'investment_valuation' || t.type === 'valuation') {
          const varAmt = parseFloat(t.variance) || 0;
          stateInvestment -= varAmt;
          stateRealizable -= varAmt;
        } else if (t.type === 'loan_payment') {
          stateLiquid += amt;
          stateLoanDebt += amt;
        }
      });
    });

    sortedDates.forEach(d => {
      const st = dateStateMap.get(d);
      availableMoneyTimeline.push({ date: d, available_money: st.available_money });
      spendableMoneyTimeline.push({ date: d, spendable_money: st.spendable_money });
      netWorthTimeline.push({ date: d, net_worth: st.net_worth });
      debtTimeline.push({
        date: d,
        total_debt: st.total_debt,
        credit_card_debt: st.credit_card_debt,
        loan_debt: st.loan_debt
      });

      const dayTxs = txByDateMap.get(d) || [];
      let dayCashIn = 0;
      let dayCashOut = 0;
      dayTxs.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'income' || t.type === 'investment_withdrawal') dayCashIn += amt;
        else if (t.type === 'expense' || t.type === 'card_payment' || t.type === 'investment_contribution' || t.type === 'loan_payment') dayCashOut += amt;
      });
      cashFlowTimeline.push({ date: d, net_cash_flow: dayCashIn - dayCashOut });
    });
  }

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
    spendableMoneyTimeline,
    netWorthTimeline,
    debtTimeline,
    cashFlowTimeline,
    investmentTimeline
  };
}

module.exports = {
  getSummaryMetrics,
  getCashFlow,
  getUpcomingPayments,
  getTimelines
};
