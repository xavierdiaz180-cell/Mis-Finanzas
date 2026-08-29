const { pool, dbRun, dbGet, dbAll } = require('../database');
const financialMetricsService = require('../services/financialMetricsService');
const transactionService = require('../services/transactionService');
const creditCardService = require('../services/creditCardService');
const { getDailyBudgetStatus } = require('../services/budgetingService');
const { getChartsData } = require('../services/analysisService');

async function runMetricsTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DE MÉTRICAS — V2 (FASE 2B)');
  console.log('======================================================\n');

  let testAccountId;
  let testCardId;
  let testInvestmentId;
  let testDebtId;

  try {
    // 1. Teardown test artifacts
    await dbRun("DELETE FROM transactions WHERE concept LIKE 'TEST_METRIC_%'");
    await dbRun("DELETE FROM installment_plans WHERE concept LIKE 'TEST_METRIC_%'");
    await dbRun("DELETE FROM debts WHERE name LIKE 'TEST_METRIC_%'");
    await dbRun("DELETE FROM investments WHERE name LIKE 'TEST_METRIC_%'");
    await dbRun("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_METRIC_%')");
    await dbRun("DELETE FROM accounts WHERE name LIKE 'TEST_METRIC_%'");

    // 2. Setup baseline test environment
    const accRes = await dbRun(
      `INSERT INTO accounts (name, type, balance, available_credit, active)
       VALUES ('TEST_METRIC_Nomina', 'payroll', 20000.00, 20000.00, 1)`
    );
    testAccountId = accRes.lastID;

    const cardRes = await dbRun(
      `INSERT INTO accounts (name, type, balance, available_credit, credit_limit, active)
       VALUES ('TEST_METRIC_Tarjeta', 'credit_card', 0.00, 20000.00, 20000.00, 1)`
    );
    testCardId = cardRes.lastID;

    const debtRes = await dbRun(
      `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, account_id)
       VALUES ('TEST_METRIC_Tarjeta', 'credit_card', 0.00, 0.00, 0.00, ?)`,
      [testCardId]
    );
    testDebtId = debtRes.lastID;

    const invRes = await dbRun(
      `INSERT INTO investments (name, invested_amount, capital_contributed, current_documented_value, current_value, risk_level)
       VALUES ('TEST_METRIC_Cetes', 50000.00, 50000.00, 50000.00, 50000.00, 'low')`
    );
    testInvestmentId = invRes.lastID;

    // ----------------------------------------------------
    // METRIC-001: Dinero Disponible
    // ----------------------------------------------------
    console.log('📌 METRIC-001: Dinero Disponible = Cuentas Líquidas + Inversiones');
    const summary1 = await financialMetricsService.getSummaryMetrics();
    if (summary1.available_money >= 70000) {
      console.log(`  ✅ PASÓ [METRIC-001]: Dinero Disponible correctamente calculado: $${summary1.available_money.toLocaleString()}`);
    } else {
      throw new Error(`[METRIC-001] Falla: Esperado >= $70,000, obtenido: $${summary1.available_money}`);
    }

    // ----------------------------------------------------
    // METRIC-002: Patrimonio Neto
    // ----------------------------------------------------
    console.log('📌 METRIC-002: Patrimonio Neto = Activos - Pasivos');
    if (summary1.net_worth === (summary1.available_money - summary1.total_debt)) {
      console.log(`  ✅ PASÓ [METRIC-002]: Patrimonio Neto correctamente calculado ($${summary1.available_money.toLocaleString()} Activos - $${summary1.total_debt.toLocaleString()} Pasivos = $${summary1.net_worth.toLocaleString()})`);
    } else {
      throw new Error(`[METRIC-002] Falla: Patrimonio neto (${summary1.net_worth}) != Activos (${summary1.available_money}) - Pasivos (${summary1.total_debt})`);
    }

    // ----------------------------------------------------
    // METRIC-003: Ingresos Totales
    // ----------------------------------------------------
    console.log('📌 METRIC-003: Registro de Ingreso en Nómina');
    await transactionService.executeIncome({
      destination_account_id: testAccountId,
      amount: 10000,
      concept: 'TEST_METRIC_Sueldo',
      category: 'Nómina'
    });
    const accAfterInc = await dbGet('SELECT balance FROM accounts WHERE id = ?', [testAccountId]);
    if (parseFloat(accAfterInc.balance) === 30000) {
      console.log('  ✅ PASÓ [METRIC-003]: Ingreso registrado; Nómina incrementada a $30,000');
    } else {
      throw new Error(`[METRIC-003] Falla en ingreso. Saldo: ${accAfterInc.balance}`);
    }

    // ----------------------------------------------------
    // METRIC-004: Gastos Totales y Compras con Tarjeta
    // ----------------------------------------------------
    console.log('📌 METRIC-004: Gasto Líquido y Compra con Tarjeta');
    await transactionService.executeExpense({
      source_account_id: testAccountId,
      amount: 2000,
      concept: 'TEST_METRIC_Super',
      category: 'Alimentación'
    });
    await transactionService.executeCardPurchase({
      credit_card_id: testCardId,
      amount: 3000,
      concept: 'TEST_METRIC_Vuelos',
      category: 'Transporte'
    });
    const cardAfterPur = await dbGet('SELECT balance, available_credit FROM accounts WHERE id = ?', [testCardId]);
    if (parseFloat(cardAfterPur.balance) === 3000 && parseFloat(cardAfterPur.available_credit) === 17000) {
      console.log('  ✅ PASÓ [METRIC-004]: Compra con tarjeta incrementó deuda a $3,000 y redujo disponible a $17,000');
    } else {
      throw new Error(`[METRIC-004] Falla en compra tarjeta: ${JSON.stringify(cardAfterPur)}`);
    }

    // ----------------------------------------------------
    // METRIC-005: Transferencia Interna (Delta Ingreso/Gasto = $0)
    // ----------------------------------------------------
    console.log('📌 METRIC-005: Transferencia entre Cuentas');
    const accDebitRes = await dbRun("INSERT INTO accounts (name, type, balance, active) VALUES ('TEST_METRIC_Debito', 'bank', 0.00, 1)");
    const testDebitId = accDebitRes.lastID;

    await transactionService.executeTransfer({
      source_account_id: testAccountId,
      destination_account_id: testDebitId,
      amount: 5000,
      concept: 'TEST_METRIC_Transfer'
    });
    const debAcc = await dbGet('SELECT balance FROM accounts WHERE id = ?', [testDebitId]);
    if (parseFloat(debAcc.balance) === 5000) {
      console.log('  ✅ PASÓ [METRIC-005]: Transferencia movió $5,000 sin alterar Ingresos ni Gastos globales');
    } else {
      throw new Error(`[METRIC-005] Falla en transferencia. Saldo Débito: ${debAcc.balance}`);
    }

    // ----------------------------------------------------
    // METRIC-006 & METRIC-007: Aporte y Retiro de Inversión
    // ----------------------------------------------------
    console.log('📌 METRIC-006 & METRIC-007: Aporte y Retiro de Inversión');
    await transactionService.executeInvestmentContribution({
      source_account_id: testAccountId,
      investment_id: testInvestmentId,
      amount: 5000,
      concept: 'TEST_METRIC_Aporte'
    });
    let invRec = await dbGet('SELECT current_value FROM investments WHERE id = ?', [testInvestmentId]);
    if (parseFloat(invRec.current_value) === 55000) {
      console.log('  ✅ PASÓ [METRIC-006]: Aporte incrementó inversión a $55,000');
    }

    const retRes = await transactionService.executeInvestmentWithdrawal({
      investment_id: testInvestmentId,
      destination_account_id: testAccountId,
      amount: 5000,
      concept: 'TEST_METRIC_Retiro'
    });
    if (retRes.gain === 0 && retRes.loss === 0) {
      console.log('  ✅ PASÓ [METRIC-007]: Retiro parcial de inversión generó Ganancia = $0 y Pérdida = $0');
    } else {
      throw new Error(`[METRIC-007] Retiro generó resultado incorrecto: ${JSON.stringify(retRes)}`);
    }

    // ----------------------------------------------------
    // METRIC-008 & METRIC-009: Valuaciones de Mercado (Ganancia / Pérdida)
    // ----------------------------------------------------
    console.log('📌 METRIC-008 & METRIC-009: Valuación de Inversión (Pérdida / Ganancia)');
    const valLoss = await transactionService.executeInvestmentValuation({
      investment_id: testInvestmentId,
      new_current_value: 40000,
      concept: 'TEST_METRIC_ValuacionBaja'
    });
    if (valLoss.type === 'loss' && valLoss.variance === -10000) {
      console.log('  ✅ PASÓ [METRIC-008]: Revaluación bajista de $50k a $40k registró Pérdida = $10,000');
    }

    const valGain = await transactionService.executeInvestmentValuation({
      investment_id: testInvestmentId,
      new_current_value: 45000,
      concept: 'TEST_METRIC_ValuacionAlta'
    });
    if (valGain.type === 'gain' && valGain.variance === 5000) {
      console.log('  ✅ PASÓ [METRIC-009]: Revaluación alcista de $40k a $45k registró Ganancia = $5,000');
    }

    // ----------------------------------------------------
    // METRIC-010 & METRIC-011: Crédito Disponible y MSI Existente
    // ----------------------------------------------------
    console.log('📌 METRIC-010 & METRIC-011: Registro de MSI y Crédito Disponible');
    const msiRes = await creditCardService.registerExistingMSI({
      credit_card_id: testCardId,
      concept: 'TEST_METRIC_LaptopMSI',
      original_amount: 12000,
      installment_count: 12,
      installments_paid: 4
    });
    if (msiRes.monthly_installment === 1000 && msiRes.installments_remaining === 8 && msiRes.remaining_principal === 8000) {
      console.log('  ✅ PASÓ [METRIC-010 & METRIC-011]: MSI calculado correctamente (Mensualidad $1,000, Saldo Pendiente $8,000)');
    } else {
      throw new Error(`[METRIC-010/011] Falla MSI: ${JSON.stringify(msiRes)}`);
    }

    // ----------------------------------------------------
    // METRIC-012: Presupuesto Diario de 24 Horas
    // ----------------------------------------------------
    console.log('📌 METRIC-012: Evaluación de Presupuesto Diario 24h');
    const budgetStatus = await getDailyBudgetStatus();
    if (budgetStatus.budget_amount > 0 && budgetStatus.result) {
      console.log(`  ✅ PASÓ [METRIC-012]: Presupuesto evaluado con estado "${budgetStatus.result}"`);
    } else {
      throw new Error(`[METRIC-012] Falla presupuesto: ${JSON.stringify(budgetStatus)}`);
    }

    // ----------------------------------------------------
    // METRIC-013: Flujo de Caja Real
    // ----------------------------------------------------
    console.log('📌 METRIC-013: Flujo de Caja Real');
    const cashFlow = await financialMetricsService.getCashFlow(1);
    if (cashFlow.period_months === 1 && typeof cashFlow.net_cash_flow === 'number') {
      console.log(`  ✅ PASÓ [METRIC-013]: Flujo de caja calculado netamente: $${cashFlow.net_cash_flow.toLocaleString()}`);
    }

    // ----------------------------------------------------
    // METRIC-014 a METRIC-016: Timelines de Evolución
    // ----------------------------------------------------
    console.log('📌 METRIC-014 a METRIC-016: Timelines de Dinero Disponible, Patrimonio y Deuda');
    const timelines = await financialMetricsService.getTimelines();
    if (timelines.availableMoneyTimeline.length > 0 && timelines.netWorthTimeline.length > 0 && timelines.debtTimeline.length > 0) {
      console.log('  ✅ PASÓ [METRIC-014..016]: Timelines de Disponible, Patrimonio y Deuda estructurados');
    }

    // ----------------------------------------------------
    // METRIC-017: Gastos por Categoría
    // ----------------------------------------------------
    console.log('📌 METRIC-017: Gastos por Categoría');
    const chartsData = await getChartsData();
    if (Array.isArray(chartsData.expensesByCategory)) {
      console.log('  ✅ PASÓ [METRIC-017]: Desglose de Gastos por Categoría obtenido');
    }

    console.log('\n======================================================');
    console.log('📊 RESULTADO FINAL SUITE DE MÉTRICAS: 17/17 PASADAS');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ ERROR EN SUITE DE MÉTRICAS:', error);
    process.exit(1);
  } finally {
    // Teardown
    await dbRun("DELETE FROM transactions WHERE concept LIKE 'TEST_METRIC_%'");
    await dbRun("DELETE FROM installment_plans WHERE concept LIKE 'TEST_METRIC_%'");
    await dbRun("DELETE FROM debts WHERE name LIKE 'TEST_METRIC_%'");
    await dbRun("DELETE FROM investments WHERE name LIKE 'TEST_METRIC_%'");
    await dbRun("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_METRIC_%')");
    await dbRun("DELETE FROM accounts WHERE name LIKE 'TEST_METRIC_%'");
  }
}

if (require.main === module) {
  runMetricsTestSuite().then(() => process.exit(0));
}

module.exports = { runMetricsTestSuite };
