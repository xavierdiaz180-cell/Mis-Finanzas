const { dbAll, dbGet } = require('../database');
const { calculateFinancialMetrics } = require('./financialRules');
const { enrichAccountsWithMSIData } = require('./creditCardService');
const budgetingService = require('./budgetingService');

/**
 * Single authoritative service for all financial metrics & contracts in Mis Finanzas V2 (Phase 3.3)
 */

async function getSummaryMetrics() {
  const accounts = await dbAll("SELECT * FROM accounts WHERE (active = 1 OR active IS TRUE OR active IS NULL)");
  const enrichedAccounts = await enrichAccountsWithMSIData(accounts);

  // 1. LIQUID MONEY (Nómina, Débito, Efectivo, Ahorro - excludes credit cards and loans)
  const liquidMoney = enrichedAccounts
    .filter(a => a.type !== 'credit_card' && a.type !== 'loan')
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

  // 6. TOTAL DEBT & CREDIT CARD DEBT (from debts table — source of truth for all cards and loans)
  const debts = await dbAll('SELECT * FROM debts');
  const totalDebt = debts.reduce((sum, d) => sum + (parseFloat(d.current_balance) || 0), 0);
  const creditCardDebt = debts
    .filter(d => d.type === 'credit_card')
    .reduce((sum, d) => sum + (parseFloat(d.current_balance) || 0), 0);
  const loanDebt = debts
    .filter(d => d.type !== 'credit_card')
    .reduce((sum, d) => sum + (parseFloat(d.current_balance) || 0), 0);

  // 7. TOTAL ASSETS & NET WORTH
  const totalAssets = liquidMoney + investmentValue;
  const netWorth = totalAssets - totalDebt;

  // 8. DAILY BUDGET STATUS
  let presupuestoDiario = {};
  try {
    presupuestoDiario = await budgetingService.getDailyBudgetStatus();
  } catch (e) {
    console.error('Error fetching daily budget status in getSummaryMetrics:', e);
  }

  return {
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
    // Aliases and additional views support
    disponible_hoy: availableMoney,
    total_inversiones: investmentValue,
    total_deuda: totalDebt,
    riqueza_neta: netWorth,
    presupuesto_diario: presupuestoDiario
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
 * Upcoming Payments distinguishing Total Debt from Monthly Installments & Interest-Free Payments
 */
async function getUpcomingPayments() {
  const debts = await dbAll('SELECT * FROM debts WHERE current_balance > 0');
  const recurring = await dbAll('SELECT * FROM recurring_expenses WHERE active = 1');
  const msiPlans = await dbAll('SELECT * FROM installment_plans WHERE remaining_balance > 0');

  const payments = [];
  const processedCardIds = new Set();

  // 1. MSI Installment Plans (Next Monthly Installment)
  msiPlans.forEach(m => {
    if (m.account_id) processedCardIds.add(m.account_id);
    payments.push({
      id: m.id,
      concept: `Mensualidad MSI: ${m.concept}`,
      amount: parseFloat(m.monthly_amount),
      due_date: m.start_date || null,
      type: 'msi_installment',
      source_account: m.account_id || null,
      credit_card_id: m.account_id || null,
      remaining_installments: m.installments_remaining !== undefined && m.installments_remaining !== null ? parseInt(m.installments_remaining, 10) : ((parseInt(m.installments_total || m.installment_count, 10) || 0) - (parseInt(m.installments_paid, 10) || 0)),
      remaining_balance: parseFloat(m.remaining_balance || 0),
      priority: 'high'
    });
  });

  // 2. Non-MSI Debts or Card Minimum/No-Interest Payments
  debts.forEach(d => {
    // If debt is a credit_card and has MSI plans, count regular payment obligation (min_payment or no_interest_payment)
    const paymentAmount = parseFloat(d.no_interest_payment || d.min_payment || d.payment_amount || d.current_balance);
    if (paymentAmount > 0) {
      payments.push({
        id: d.id,
        concept: `Pago a Deuda: ${d.name}`,
        amount: paymentAmount,
        due_date: d.due_date || null,
        type: 'debt_payment',
        source_account: d.account_id || null,
        credit_card_id: d.account_id || null,
        priority: 'high'
      });
    }
  });

  // 3. Recurring Expenses
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

  const totalUpcoming = payments.reduce((sum, p) => sum + p.amount, 0);

  return {
    total_upcoming: totalUpcoming,
    payments
  };
}

/**
 * Reconstructs Timelines Date-by-Date based on Chronological Financial Deltas (Phase 3.3)
 */
async function getTimelines() {
  const currentSummary = await getSummaryMetrics();
  const investments = await dbAll('SELECT * FROM investments');
  const transactions = await dbAll("SELECT * FROM transactions WHERE status = 'confirmed' ORDER BY date ASC, id ASC");

  const todayStr = new Date().toISOString().split('T')[0];

  // Group transactions by date
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
    // REVERSE RECONSTRUCTION:
    // Start with current summary state as of Today, and compute state for each date d
    // by subtracting transaction deltas that occurred AFTER date d.

    // Map from date to state at end of date d
    const dateStateMap = new Map();

    // Copy current state
    let stateLiquid = currentSummary.liquid_money;
    let stateInvestment = currentSummary.investment_value;
    let stateRealizable = currentSummary.realizable_investments;
    let stateCardDebt = currentSummary.credit_card_debt;
    let stateLoanDebt = currentSummary.loan_debt;

    // Process dates in reverse
    const revDates = [...sortedDates].reverse();

    revDates.forEach((d, idx) => {
      // Record state at end of date d
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

      // Rollback deltas of transactions on date d to find state before date d
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

    // Build chronological timeline arrays
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
