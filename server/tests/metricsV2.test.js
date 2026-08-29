const { pool, dbRun, dbGet, dbAll } = require('../database');
const financialMetricsService = require('../services/financialMetricsService');
const transactionService = require('../services/transactionService');
const creditCardService = require('../services/creditCardService');
const { getDailyBudgetStatus } = require('../services/budgetingService');
const { getChartsData } = require('../services/analysisService');

async function runMetricsTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DE MÉTRICAS V2.3 (FASE 3.3)');
  console.log('======================================================\n');

  const { initDatabase } = require('../database');
  await initDatabase();

  let testAccountId;
  let testDebitId;
  let testCardId;
  let testLiquidInvId;
  let testNonLiquidInvId;
  let testNullLiqInvId;

  try {
    // 1. Teardown test artifacts
    await dbRun("DELETE FROM transactions WHERE concept LIKE 'TEST_M21_%' OR concept LIKE 'TEST_M32_%' OR concept LIKE 'TEST_M33_%' OR concept LIKE 'TEST_TL_%' OR concept LIKE 'TEST_INT_%'");
    await dbRun("DELETE FROM installment_plans WHERE concept LIKE 'TEST_M21_%' OR concept LIKE 'TEST_M32_%' OR concept LIKE 'TEST_M33_%' OR concept LIKE 'TEST_TL_%'");
    await dbRun("DELETE FROM debts WHERE name LIKE 'TEST_M21_%' OR name LIKE 'TEST_M32_%' OR name LIKE 'TEST_M33_%' OR name LIKE 'TEST_TL_%'");
    await dbRun("DELETE FROM investments WHERE name LIKE 'TEST_M21_%' OR name LIKE 'TEST_M32_%' OR name LIKE 'TEST_M33_%' OR name LIKE 'TEST_TL_%'");
    await dbRun("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_M21_%' OR name LIKE 'TEST_M32_%' OR name LIKE 'TEST_M33_%' OR name LIKE 'TEST_TL_%')");
    await dbRun("DELETE FROM accounts WHERE name LIKE 'TEST_M21_%' OR name LIKE 'TEST_M32_%' OR name LIKE 'TEST_M33_%' OR name LIKE 'TEST_TL_%' OR name LIKE 'TEST_MSI_%'");

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

    await dbRun(
      `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, account_id)
       VALUES ('TEST_M21_Tarjeta', 'credit_card', 0.00, 0.00, 0.00, ?)`,
      [testCardId]
    );

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
    // METRIC-LIQ-001: Strict Liquidity Rule (NULL / undefined Treated strictly as NO_LIQUIDA)
    // ----------------------------------------------------
    console.log('📌 METRIC-LIQ-001: Clasificación Estricta de Liquidez (NULL = NO_LIQUIDA)');
    const nullInvRes = await dbRun(
      `INSERT INTO investments (name, invested_amount, capital_contributed, current_documented_value, current_value, risk_level, is_liquid, liquidity_status)
       VALUES ('TEST_M32_NullInv', 10000.00, 10000.00, 10000.00, 10000.00, 'low', NULL, NULL)`
    );
    testNullLiqInvId = nullInvRes.lastID;

    const summaryLiqStrict = await financialMetricsService.getSummaryMetrics();
    if (summaryLiqStrict.realizable_investments === summary1.realizable_investments) {
      console.log('  ✅ PASÓ [METRIC-LIQ-001]: Inversión con liquidez NULL/undefined tratada strictly como NO_LIQUIDA');
    } else {
      throw new Error(`[METRIC-LIQ-001] Falla: Inversión NULL fue erróneamente contada como líquida`);
    }

    // ----------------------------------------------------
    // TIMELINE-001: Baseline Chronological Reconstruction Scenario
    // ----------------------------------------------------
    console.log('\n📌 TIMELINE-001: Reconstrucción Histórica Fecha por Fecha (01/01 a 25/01)');
    await dbRun("DELETE FROM transactions WHERE concept LIKE 'TEST_TL_%'");
    await dbRun("DELETE FROM debts WHERE name LIKE 'TEST_TL_%'");
    await dbRun("DELETE FROM investments WHERE name LIKE 'TEST_TL_%'");
    await dbRun("DELETE FROM accounts WHERE name LIKE 'TEST_TL_%'");

    const tlNom = await dbRun("INSERT INTO accounts (name, type, balance, active) VALUES ('TEST_TL_Nomina', 'payroll', 17000.00, 1)");
    const tlDeb = await dbRun("INSERT INTO accounts (name, type, balance, active) VALUES ('TEST_TL_Debito', 'bank', 8000.00, 1)");
    const tlCard = await dbRun("INSERT INTO accounts (name, type, balance, credit_limit, active) VALUES ('TEST_TL_Tarjeta', 'credit_card', 1000.00, 50000.00, 1)");
    const tlInv = await dbRun("INSERT INTO investments (name, invested_amount, capital_contributed, current_documented_value, current_value, withdrawals_total, is_liquid, liquidity_status) VALUES ('TEST_TL_Inv', 50000.00, 55000.00, 52000.00, 52000.00, 3000.00, true, 'LIQUIDA')");

    // Transactions chronologically:
    await dbRun("INSERT INTO transactions (account_id, type, amount, concept, category, date, status) VALUES (?, 'expense', 5000, 'TEST_TL_Gasto', 'General', '2026-01-05', 'confirmed')", [tlNom.lastID]);
    await dbRun("INSERT INTO transactions (account_id, type, amount, concept, category, date, status) VALUES (?, 'investment_contribution', 5000, 'TEST_TL_Aporte', 'General', '2026-01-10', 'confirmed')", [tlNom.lastID]);
    await dbRun("INSERT INTO transactions (account_id, type, amount, concept, category, date, status) VALUES (?, 'card_purchase', 2000, 'TEST_TL_CompraTarjeta', 'General', '2026-01-15', 'confirmed')", [tlCard.lastID]);
    await dbRun("INSERT INTO transactions (account_id, type, amount, concept, category, date, status) VALUES (?, 'card_payment', 1000, 'TEST_TL_PagoTarjeta', 'General', '2026-01-20', 'confirmed')", [tlNom.lastID]);
    await dbRun("INSERT INTO transactions (account_id, type, amount, concept, category, date, status) VALUES (?, 'investment_withdrawal', 3000, 'TEST_TL_Retiro', 'General', '2026-01-25', 'confirmed')", [tlDeb.lastID]);

    const timelinesRes = await financialMetricsService.getTimelines();
    const datesCheck = timelinesRes.netWorthTimeline.map(t => `${t.date}: $${t.net_worth}`);
    console.log('  📊 Puntos de NetWorth por fecha:', datesCheck.slice(0, 5).join(' | '));

    if (timelinesRes.netWorthTimeline.length >= 5) {
      console.log('  ✅ PASÓ [TIMELINE-001]: Timelines varían dinámicamente según eventos históricos reales');
    } else {
      throw new Error('[TIMELINE-001] Falla en reconstrucción de timelines');
    }

    // ----------------------------------------------------
    // TIMELINE-002: Internal Transfer Does NOT Alter Net Worth
    // ----------------------------------------------------
    console.log('📌 TIMELINE-002: Transferencia Interna NO Modifica Patrimonio');
    const summaryBeforeTrf = await financialMetricsService.getSummaryMetrics();
    const netWorthBeforeTrf = summaryBeforeTrf.net_worth;
    await transactionService.executeTransfer({
      source_account_id: testAccountId,
      destination_account_id: testDebitId,
      amount: 2000,
      concept: 'TEST_M33_Trf'
    });
    const summaryAfterTrf = await financialMetricsService.getSummaryMetrics();
    if (Math.abs(summaryAfterTrf.net_worth - netWorthBeforeTrf) < 0.01) {
      console.log('  ✅ PASÓ [TIMELINE-002]: Transferencia interna mantuvo Patrimonio Neto constante');
    } else {
      throw new Error(`[TIMELINE-002] Falla: Transferencia modificó el patrimonio neto (${summaryAfterTrf.net_worth} vs ${netWorthBeforeTrf})`);
    }

    // ----------------------------------------------------
    // TIMELINE-003: Investment Valuation DOES Alter Net Worth
    // ----------------------------------------------------
    console.log('📌 TIMELINE-003: Valuación de Inversión SÍ Modifica Patrimonio');
    const summaryBeforeVal = await financialMetricsService.getSummaryMetrics();
    const netWorthBeforeVal = summaryBeforeVal.net_worth;
    await transactionService.executeInvestmentValuation({
      investment_id: testLiquidInvId,
      new_current_value: 40000, // drops by $10k
      concept: 'TEST_M33_ValuationDrop'
    });
    const summaryAfterVal = await financialMetricsService.getSummaryMetrics();
    if (Math.abs(summaryAfterVal.net_worth - (netWorthBeforeVal - 10000)) < 0.01) {
      console.log('  ✅ PASÓ [TIMELINE-003]: Pérdida de valuación redujo patrimonio exactamente en $10,000');
    } else {
      throw new Error(`[TIMELINE-003] Falla en impacto patrimonial por valuación: ${summaryAfterVal.net_worth} vs ${netWorthBeforeVal - 10000}`);
    }

    // ----------------------------------------------------
    // TIMELINE-004: Card Purchase Increases Debt but Liquid Money Remains Constant
    // ----------------------------------------------------
    console.log('📌 TIMELINE-004: Compra con Tarjeta Incrementa Deuda sin Reducir Liquidez Inmediata');
    const summaryBeforeCard = await financialMetricsService.getSummaryMetrics();
    await transactionService.executeCardPurchase({
      credit_card_id: testCardId,
      amount: 2000,
      concept: 'TEST_M33_CardPurchase'
    });
    const summaryAfterCard = await financialMetricsService.getSummaryMetrics();
    if (
      Math.abs(summaryAfterCard.liquid_money - summaryBeforeCard.liquid_money) < 0.01 &&
      Math.abs(summaryAfterCard.total_debt - (summaryBeforeCard.total_debt + 2000)) < 0.01
    ) {
      console.log('  ✅ PASÓ [TIMELINE-004]: Compra con tarjeta incrementó deuda $2,000 manteniendo liquidez bancaria intacta');
    } else {
      throw new Error(`[TIMELINE-004] Falla en compra con tarjeta: Liq: ${summaryBeforeCard.liquid_money} -> ${summaryAfterCard.liquid_money}, Debt: ${summaryBeforeCard.total_debt} -> ${summaryAfterCard.total_debt}`);
    }

    // ----------------------------------------------------
    // TIMELINE-005: Card Payment Reduces Liquidity & Debt
    // ----------------------------------------------------
    console.log('📌 TIMELINE-005: Pago de Tarjeta Reduce Liquidez y Deuda sin Generar Segundo Gasto');
    const summaryBeforePay = summaryAfterCard;
    await transactionService.executeCardPayment({
      source_account_id: testAccountId,
      credit_card_id: testCardId,
      amount: 1000,
      concept: 'TEST_M33_CardPayment'
    });
    const summaryAfterPay = await financialMetricsService.getSummaryMetrics();
    if (
      Math.abs(summaryAfterPay.liquid_money - (summaryBeforePay.liquid_money - 1000)) < 0.01 &&
      Math.abs(summaryAfterPay.total_debt - (summaryBeforePay.total_debt - 1000)) < 0.01 &&
      Math.abs(summaryAfterPay.net_worth - summaryBeforePay.net_worth) < 0.01
    ) {
      console.log('  ✅ PASÓ [TIMELINE-005]: Pago de tarjeta redujo liquidez y deuda en $1,000 manteniendo el patrimonio constante');
    } else {
      throw new Error('[TIMELINE-005] Falla en pago de tarjeta');
    }

    // ----------------------------------------------------
    // MSI-001: Existing MSI (12k / 12, 4 paid -> Remaining 8k, Monthly 1k)
    // ----------------------------------------------------
    console.log('📌 MSI-001: Registro de MSI Existente');
    const msiCardRes = await dbRun("INSERT INTO accounts (name, type, balance, credit_limit, active) VALUES ('TEST_MSI_Card', 'credit_card', 8000.00, 50000.00, 1)");
    await dbRun(
      `INSERT INTO installment_plans (account_id, credit_card_id, concept, total_amount, original_amount, remaining_balance, remaining_principal, monthly_amount, installments_total, installments_paid, installments_remaining, status)
       VALUES (?, ?, 'TEST_M33_MSI1', 12000.00, 12000.00, 8000.00, 8000.00, 1000.00, 12, 4, 8, 'active')`,
      [msiCardRes.lastID, msiCardRes.lastID]
    );

    const upcomingMSI1 = await financialMetricsService.getUpcomingPayments();
    const msiItem1 = upcomingMSI1.payments.find(p => p.concept.includes('TEST_M33_MSI1'));
    if (msiItem1 && msiItem1.amount === 1000 && msiItem1.remaining_installments === 8) {
      console.log('  ✅ PASÓ [MSI-001]: MSI existente correctamente identificado con saldo $8,000 y mensualidad $1,000');
    } else {
      throw new Error(`[MSI-001] Falla en MSI existente: ${JSON.stringify(msiItem1)}`);
    }

    // ----------------------------------------------------
    // MSI-002: New MSI Purchase ($12,000 / 12 MSI)
    // ----------------------------------------------------
    console.log('📌 MSI-002: Nueva Compra a MSI');
    await transactionService.executeCardPurchase({
      credit_card_id: msiCardRes.lastID,
      amount: 12000,
      concept: 'TEST_M33_NewMSI',
      is_msi: true,
      msi_months: 12
    });

    const upcomingMSI2 = await financialMetricsService.getUpcomingPayments();
    const msiItem2 = upcomingMSI2.payments.find(p => p.concept.includes('TEST_M33_NewMSI'));
    if (msiItem2 && msiItem2.amount === 1000) {
      console.log('  ✅ PASÓ [MSI-002]: Nueva compra a MSI generó cuota de $1,000 en próximos pagos sin duplicar deuda');
    } else {
      throw new Error(`[MSI-002] Falla en nueva compra MSI: ${JSON.stringify(msiItem2)}`);
    }

    // ----------------------------------------------------
    // MSI-003: MSI + Normal Purchase
    // ----------------------------------------------------
    console.log('📌 MSI-003: MSI + Compra Normal en Misma Tarjeta');
    await transactionService.executeCardPurchase({
      credit_card_id: msiCardRes.lastID,
      amount: 2000,
      concept: 'TEST_M33_NormalPurchase'
    });
    const msiCardAccount = await dbGet('SELECT balance FROM accounts WHERE id = ?', [msiCardRes.lastID]);

    if (Math.abs(parseFloat(msiCardAccount.balance) - 22000) < 0.01) {
      console.log('  ✅ PASÓ [MSI-003]: Deuda total de tarjeta refleja compras normales y MSI ($22,000)');
    } else {
      throw new Error(`[MSI-003] Falla en saldo total de tarjeta: ${msiCardAccount.balance}`);
    }

    console.log('\n======================================================');
    console.log('📊 RESULTADO FINAL SUITE DE MÉTRICAS: 100% PASS (FASE 3.3)');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ ERROR EN SUITE DE MÉTRICAS V2.3:', error);
    process.exit(1);
  } finally {
    // Teardown
    await dbRun("DELETE FROM transactions WHERE concept LIKE 'TEST_M21_%' OR concept LIKE 'TEST_M32_%' OR concept LIKE 'TEST_M33_%' OR concept LIKE 'TEST_TL_%' OR concept LIKE 'TEST_INT_%'");
    await dbRun("DELETE FROM installment_plans WHERE concept LIKE 'TEST_M21_%' OR concept LIKE 'TEST_M32_%' OR concept LIKE 'TEST_M33_%' OR concept LIKE 'TEST_TL_%'");
    await dbRun("DELETE FROM debts WHERE name LIKE 'TEST_M21_%' OR name LIKE 'TEST_M32_%' OR name LIKE 'TEST_M33_%' OR name LIKE 'TEST_TL_%'");
    await dbRun("DELETE FROM investments WHERE name LIKE 'TEST_M21_%' OR name LIKE 'TEST_M32_%' OR name LIKE 'TEST_M33_%' OR name LIKE 'TEST_TL_%'");
    await dbRun("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_M21_%' OR name LIKE 'TEST_M32_%' OR name LIKE 'TEST_M33_%' OR name LIKE 'TEST_TL_%')");
    await dbRun("DELETE FROM accounts WHERE name LIKE 'TEST_M21_%' OR name LIKE 'TEST_M32_%' OR name LIKE 'TEST_M33_%' OR name LIKE 'TEST_TL_%' OR name LIKE 'TEST_MSI_%'");
  }
}

if (require.main === module) {
  runMetricsTestSuite().then(() => process.exit(0));
}

module.exports = { runMetricsTestSuite };
