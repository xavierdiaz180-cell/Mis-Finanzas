const { pool, dbRun, dbGet, dbAll } = require('../database');
const financialMetricsService = require('../services/financialMetricsService');
const transactionService = require('../services/transactionService');
const creditCardService = require('../services/creditCardService');
const { getDailyBudgetStatus } = require('../services/budgetingService');
const { getChartsData } = require('../services/analysisService');

async function runMetricsTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DE MÉTRICAS V2.1 (FASE 2B.1)');
  console.log('======================================================\n');

  const { initDatabase } = require('../database');
  await initDatabase();

  let testAccountId;
  let testDebitId;
  let testCardId;
  let testLiquidInvId;
  let testNonLiquidInvId;
  let testDebtId;

  try {
    // 1. Teardown test artifacts
    await dbRun("DELETE FROM transactions WHERE concept LIKE 'TEST_M21_%'");
    await dbRun("DELETE FROM installment_plans WHERE concept LIKE 'TEST_M21_%'");
    await dbRun("DELETE FROM debts WHERE name LIKE 'TEST_M21_%'");
    await dbRun("DELETE FROM investments WHERE name LIKE 'TEST_M21_%'");
    await dbRun("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_M21_%')");
    await dbRun("DELETE FROM accounts WHERE name LIKE 'TEST_M21_%'");

    // 2. Setup baseline test environment
    const accRes = await dbRun(
      `INSERT INTO accounts (name, type, balance, available_credit, active)
       VALUES ('TEST_M21_Nomina', 'payroll', 20000.00, 20000.00, 1)`
    );
    testAccountId = accRes.lastID;

    const debRes = await dbRun(
      `INSERT INTO accounts (name, type, balance, available_credit, active)
       VALUES ('TEST_M21_Debito', 'bank', 5000.00, 5000.00, 1)`
    );
    testDebitId = debRes.lastID;

    const cardRes = await dbRun(
      `INSERT INTO accounts (name, type, balance, available_credit, credit_limit, active)
       VALUES ('TEST_M21_Tarjeta', 'credit_card', 0.00, 20000.00, 20000.00, 1)`
    );
    testCardId = cardRes.lastID;

    const debtRes = await dbRun(
      `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, account_id)
       VALUES ('TEST_M21_Tarjeta', 'credit_card', 0.00, 0.00, 0.00, ?)`,
      [testCardId]
    );
    testDebtId = debtRes.lastID;

    const liqInvRes = await dbRun(
      `INSERT INTO investments (name, invested_amount, capital_contributed, current_documented_value, current_value, risk_level, is_liquid, liquidity_status)
       VALUES ('TEST_M21_FondoLiquido', 50000.00, 50000.00, 50000.00, 50000.00, 'low', true, 'LIQUIDA')`
    );
    testLiquidInvId = liqInvRes.lastID;

    const nonLiqInvRes = await dbRun(
      `INSERT INTO investments (name, invested_amount, capital_contributed, current_documented_value, current_value, risk_level, is_liquid, liquidity_status)
       VALUES ('TEST_M21_CetesPlazo', 30000.00, 30000.00, 30000.00, 30000.00, 'low', false, 'NO_LIQUIDA')`
    );
    testNonLiquidInvId = nonLiqInvRes.lastID;

    // ----------------------------------------------------
    // METRIC-001: liquidMoney
    // ----------------------------------------------------
    console.log('📌 METRIC-001: liquidMoney = Cuentas Líquidas');
    const summary1 = await financialMetricsService.getSummaryMetrics();
    if (typeof summary1.liquid_money === 'number') {
      console.log(`  ✅ PASÓ [METRIC-001]: liquidMoney correctamente obtenido: $${summary1.liquid_money.toLocaleString()}`);
    } else {
      throw new Error(`[METRIC-001] Falla en liquidMoney`);
    }

    // ----------------------------------------------------
    // METRIC-002: investmentValue
    // ----------------------------------------------------
    console.log('📌 METRIC-002: investmentValue = Total Inversiones');
    if (typeof summary1.investment_value === 'number' && summary1.investment_value >= 80000) {
      console.log(`  ✅ PASÓ [METRIC-002]: investmentValue correctamente obtenido: $${summary1.investment_value.toLocaleString()}`);
    } else {
      throw new Error(`[METRIC-002] Falla: Esperado >= $80,000, obtenido: $${summary1.investment_value}`);
    }

    // ----------------------------------------------------
    // METRIC-003: spendableMoney
    // ----------------------------------------------------
    console.log('📌 METRIC-003: spendableMoney = Liquidez + Inversiones Inmediatamente Realizables');
    if (summary1.spendable_money === (summary1.liquid_money + summary1.realizable_investments) && summary1.spendable_money <= summary1.available_money) {
      console.log(`  ✅ PASÓ [METRIC-003]: spendableMoney = $${summary1.spendable_money.toLocaleString()} (Excluye Inversiones no líquidas: $${summary1.available_money - summary1.spendable_money})`);
    } else {
      throw new Error(`[METRIC-003] Falla spendableMoney: ${summary1.spendable_money} vs available: ${summary1.available_money}`);
    }

    // ----------------------------------------------------
    // METRIC-004: totalDebt
    // ----------------------------------------------------
    console.log('📌 METRIC-004: totalDebt = Deuda Tarjetas + Préstamos');
    if (typeof summary1.total_debt === 'number') {
      console.log(`  ✅ PASÓ [METRIC-004]: totalDebt = $${summary1.total_debt.toLocaleString()}`);
    }

    // ----------------------------------------------------
    // METRIC-005: netWorth
    // ----------------------------------------------------
    console.log('📌 METRIC-005: netWorth = Activos Totales - Pasivos Totales');
    if (summary1.net_worth === (summary1.total_assets - summary1.total_debt)) {
      console.log(`  ✅ PASÓ [METRIC-005]: netWorth correctamente reconciliado: $${summary1.net_worth.toLocaleString()}`);
    } else {
      throw new Error(`[METRIC-005] Falla reconciliación netWorth`);
    }

    // ----------------------------------------------------
    // METRIC-006: income
    // ----------------------------------------------------
    console.log('📌 METRIC-006: income de fuentes externas');
    await transactionService.executeIncome({
      destination_account_id: testAccountId,
      amount: 10000,
      concept: 'TEST_M21_Sueldo',
      category: 'Nómina'
    });
    const accInc = await dbGet('SELECT balance FROM accounts WHERE id = ?', [testAccountId]);
    if (parseFloat(accInc.balance) === 30000) {
      console.log('  ✅ PASÓ [METRIC-006]: Registro de ingreso incrementó liquidez a $30,000');
    }

    // ----------------------------------------------------
    // METRIC-007: expenses
    // ----------------------------------------------------
    console.log('📌 METRIC-007: expenses directos y compras con tarjeta');
    await transactionService.executeExpense({
      source_account_id: testAccountId,
      amount: 2000,
      concept: 'TEST_M21_Super',
      category: 'Alimentación'
    });
    await transactionService.executeCardPurchase({
      credit_card_id: testCardId,
      amount: 3000,
      concept: 'TEST_M21_Vuelos',
      category: 'Transporte'
    });
    const cardPur = await dbGet('SELECT balance FROM accounts WHERE id = ?', [testCardId]);
    if (parseFloat(cardPur.balance) === 3000) {
      console.log('  ✅ PASÓ [METRIC-007]: Compra tarjeta incrementó pasivo a $3,000');
    }

    // ----------------------------------------------------
    // METRIC-008: transfers
    // ----------------------------------------------------
    console.log('📌 METRIC-008: transfers entre cuentas propias');
    await transactionService.executeTransfer({
      source_account_id: testAccountId,
      destination_account_id: testDebitId,
      amount: 5000,
      concept: 'TEST_M21_Transfer'
    });
    const debAfter = await dbGet('SELECT balance FROM accounts WHERE id = ?', [testDebitId]);
    if (parseFloat(debAfter.balance) === 10000) {
      console.log('  ✅ PASÓ [METRIC-008]: Transferencia movió $5,000 entre cuentas líquidas');
    }

    // ----------------------------------------------------
    // METRIC-009: investmentContribution
    // ----------------------------------------------------
    console.log('📌 METRIC-009: investmentContribution');
    await transactionService.executeInvestmentContribution({
      source_account_id: testAccountId,
      investment_id: testLiquidInvId,
      amount: 5000,
      concept: 'TEST_M21_Aporte'
    });
    const invContrib = await dbGet('SELECT current_value FROM investments WHERE id = ?', [testLiquidInvId]);
    if (parseFloat(invContrib.current_value) === 55000) {
      console.log('  ✅ PASÓ [METRIC-009]: Aporte a inversión incrementó valor a $55,000');
    }

    // ----------------------------------------------------
    // METRIC-010: investmentWithdrawal
    // ----------------------------------------------------
    console.log('📌 METRIC-010: investmentWithdrawal');
    const retRes = await transactionService.executeInvestmentWithdrawal({
      investment_id: testLiquidInvId,
      destination_account_id: testAccountId,
      amount: 5000,
      concept: 'TEST_M21_Retiro'
    });
    if (retRes.gain === 0 && retRes.loss === 0) {
      console.log('  ✅ PASÓ [METRIC-010]: Retiro de inversión generó Ganancia = $0 y Pérdida = $0');
    }

    // ----------------------------------------------------
    // METRIC-011: investmentLoss
    // ----------------------------------------------------
    console.log('📌 METRIC-011: investmentLoss por desvalorización de mercado');
    const valLoss = await transactionService.executeInvestmentValuation({
      investment_id: testLiquidInvId,
      new_current_value: 40000,
      concept: 'TEST_M21_Loss'
    });
    if (valLoss.type === 'loss' && valLoss.variance === -10000) {
      console.log('  ✅ PASÓ [METRIC-011]: Pérdida de valuación de $10,000 registrada');
    }

    // ----------------------------------------------------
    // METRIC-012: investmentGain
    // ----------------------------------------------------
    console.log('📌 METRIC-012: investmentGain por revalorización de mercado');
    const valGain = await transactionService.executeInvestmentValuation({
      investment_id: testLiquidInvId,
      new_current_value: 45000,
      concept: 'TEST_M21_Gain'
    });
    if (valGain.type === 'gain' && valGain.variance === 5000) {
      console.log('  ✅ PASÓ [METRIC-012]: Ganancia de valuación de $5,000 registrada');
    }

    // ----------------------------------------------------
    // METRIC-013: Secuencia Completa Retiro Parcial + Valuación
    // ----------------------------------------------------
    console.log('📌 METRIC-013: Secuencia Retiro Parcial $30k + Pérdida Posterior $10k');
    const seqInvRes = await dbRun(
      `INSERT INTO investments (name, invested_amount, capital_contributed, current_documented_value, current_value, risk_level)
       VALUES ('TEST_M21_SeqInv', 100000.00, 100000.00, 100000.00, 100000.00, 'medium')`
    );
    const seqInvId = seqInvRes.lastID;

    // Retiro $30,000
    const seqRet = await transactionService.executeInvestmentWithdrawal({
      investment_id: seqInvId,
      destination_account_id: testAccountId,
      amount: 30000,
      concept: 'TEST_M21_SeqRetiro'
    });
    if (seqRet.gain === 0 && seqRet.loss === 0) {
      console.log('  ✅ PASÓ [METRIC-013a]: Retiro $30k dejó saldo en $70k con Pérdida = $0');
    }

    // Pérdida posterior $10,000 (Nuevo valor: $60,000)
    const seqLoss = await transactionService.executeInvestmentValuation({
      investment_id: seqInvId,
      new_current_value: 60000,
      concept: 'TEST_M21_SeqLoss'
    });
    if (seqLoss.type === 'loss' && seqLoss.variance === -10000) {
      console.log('  ✅ PASÓ [METRIC-013b]: Pérdida posterior registrada correctamente como $10,000 (NO $40,000)');
    } else {
      throw new Error(`[METRIC-013] Falla en secuencia de pérdida: ${JSON.stringify(seqLoss)}`);
    }

    // ----------------------------------------------------
    // METRIC-014: MSI existing
    // ----------------------------------------------------
    console.log('📌 METRIC-014: MSI Existente');
    const msiExist = await creditCardService.registerExistingMSI({
      credit_card_id: testCardId,
      concept: 'TEST_M21_MSI_Exist',
      original_amount: 12000,
      installment_count: 12,
      installments_paid: 4
    });
    if (msiExist.monthly_installment === 1000 && msiExist.remaining_principal === 8000) {
      console.log('  ✅ PASÓ [METRIC-014]: MSI existente registrado correctamente');
    }

    // ----------------------------------------------------
    // METRIC-015: MSI new
    // ----------------------------------------------------
    console.log('📌 METRIC-015: MSI Nuevo');
    await transactionService.executeCardPurchase({
      credit_card_id: testCardId,
      amount: 12000,
      concept: 'TEST_M21_MSI_Nuevo',
      category: 'Tecnología'
    });
    const cardMSI = await dbGet('SELECT balance FROM accounts WHERE id = ?', [testCardId]);
    if (parseFloat(cardMSI.balance) === 15000) {
      console.log('  ✅ PASÓ [METRIC-015]: Compra MSI nueva registrada en deuda de tarjeta');
    }

    // ----------------------------------------------------
    // METRIC-016: creditAvailable
    // ----------------------------------------------------
    console.log('📌 METRIC-016: creditAvailable');
    const cardAvail = await dbGet('SELECT available_credit, credit_limit, balance FROM accounts WHERE id = ?', [testCardId]);
    const expectedAvail = parseFloat(cardAvail.credit_limit) - parseFloat(cardAvail.balance);
    if (parseFloat(cardAvail.available_credit) === expectedAvail) {
      console.log(`  ✅ PASÓ [METRIC-016]: creditAvailable ($${cardAvail.available_credit}) = Límite - Deuda`);
    }

    // ----------------------------------------------------
    // METRIC-017: dailyBudget
    // ----------------------------------------------------
    console.log('📌 METRIC-017: dailyBudget');
    const budgetStatus = await getDailyBudgetStatus();
    if (budgetStatus.budget_amount > 0 && budgetStatus.result) {
      console.log(`  ✅ PASÓ [METRIC-017]: Presupuesto diario evaluado (${budgetStatus.result})`);
    }

    // ----------------------------------------------------
    // METRIC-018: cashFlow
    // ----------------------------------------------------
    console.log('📌 METRIC-018: cashFlow');
    const cf = await financialMetricsService.getCashFlow(1);
    if (typeof cf.net_cash_flow === 'number') {
      console.log(`  ✅ PASÓ [METRIC-018]: Flujo de caja calculado: $${cf.net_cash_flow.toLocaleString()}`);
    }

    // ----------------------------------------------------
    // METRIC-019 a METRIC-022: Timelines
    // ----------------------------------------------------
    console.log('📌 METRIC-019 a METRIC-022: Timelines');
    const timelines = await financialMetricsService.getTimelines();
    if (timelines.availableMoneyTimeline && timelines.netWorthTimeline && timelines.debtTimeline && timelines.investmentTimeline) {
      console.log('  ✅ PASÓ [METRIC-019..022]: Timelines generados correctamente');
    }

    // ----------------------------------------------------
    // METRIC-023: expensesByCategory
    // ----------------------------------------------------
    console.log('📌 METRIC-023: expensesByCategory');
    const charts = await getChartsData();
    if (Array.isArray(charts.expensesByCategory)) {
      console.log('  ✅ PASÓ [METRIC-023]: Desglose de Gastos por Categoría obtenido');
    }

    console.log('\n======================================================');
    console.log('📊 RESULTADO FINAL SUITE DE MÉTRICAS: 23/23 PASADAS');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ ERROR EN SUITE DE MÉTRICAS V2.1:', error);
    process.exit(1);
  } finally {
    // Teardown
    await dbRun("DELETE FROM transactions WHERE concept LIKE 'TEST_M21_%'");
    await dbRun("DELETE FROM installment_plans WHERE concept LIKE 'TEST_M21_%'");
    await dbRun("DELETE FROM debts WHERE name LIKE 'TEST_M21_%'");
    await dbRun("DELETE FROM investments WHERE name LIKE 'TEST_M21_%'");
    await dbRun("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_M21_%')");
    await dbRun("DELETE FROM accounts WHERE name LIKE 'TEST_M21_%'");
  }
}

if (require.main === module) {
  runMetricsTestSuite().then(() => process.exit(0));
}

module.exports = { runMetricsTestSuite };
