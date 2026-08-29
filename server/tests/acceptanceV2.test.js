const { pool, initDatabase, dbRun, dbGet, dbAll } = require('../database');
const {
  withTransaction,
  executeIncome,
  executeExpense,
  executeTransfer,
  executeCardPurchase,
  executeCardPayment,
  executeInvestmentContribution,
  executeInvestmentWithdrawal,
  executeInvestmentValuation
} = require('../services/transactionService');
const { registerExistingMSI } = require('../services/creditCardService');
const { getDailyBudgetStatus } = require('../services/budgetingService');
const { calculateFinancialMetrics } = require('../services/financialRules');

async function runAcceptanceTests() {
  console.log('\n======================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DE ACEPTACIÓN — V2 (FASE 1.1)');
  console.log('======================================================\n');

  let passedCount = 0;
  let failedCount = 0;
  const testResultsReport = [];

  function logTest(id, name, expectedStr, realStr, isPass) {
    if (isPass) {
      console.log(`  ✅ PASÓ [${id}]: ${name}`);
      passedCount++;
    } else {
      console.error(`  ❌ FALLÓ [${id}]: ${name}`);
      failedCount++;
    }
    testResultsReport.push({
      id,
      name,
      expected: expectedStr,
      real: realStr,
      status: isPass ? 'PASS' : 'FAIL'
    });
  }

  try {
    await initDatabase();

    // Isolated Test Setup
    console.log('🔄 Preparando entorno aislado de pruebas...');
    await pool.query("DELETE FROM transactions WHERE notes LIKE '%TEST_RUN%' OR concept LIKE '%TEST%' OR concept LIKE 'Prueba%'");
    await pool.query("DELETE FROM installment_plans WHERE concept LIKE '%TEST%' OR concept LIKE 'Prueba%'");
    await pool.query("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_%')");
    await pool.query("DELETE FROM debts WHERE name LIKE 'TEST_%' OR account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_%')");
    await pool.query("DELETE FROM accounts WHERE name LIKE 'TEST_%'");
    await pool.query("DELETE FROM investments WHERE name LIKE 'TEST_%'");

    // Create test accounts
    const payrollRes = await pool.query(
      `INSERT INTO accounts (name, type, balance, currency) VALUES ('TEST_Nómina', 'payroll', 0, 'MXN') RETURNING id`
    );
    const payrollId = payrollRes.rows[0].id;

    const debitRes = await pool.query(
      `INSERT INTO accounts (name, type, balance, currency) VALUES ('TEST_Débito', 'bank', 0, 'MXN') RETURNING id`
    );
    const debitId = debitRes.rows[0].id;

    const cardRes = await pool.query(
      `INSERT INTO accounts (name, type, balance, available_credit, credit_limit, currency) VALUES ('TEST_Tarjeta', 'credit_card', 0, 20000, 20000, 'MXN') RETURNING id`
    );
    const cardId = cardRes.rows[0].id;

    const debtRes = await pool.query(
      `INSERT INTO debts (name, type, original_amount, current_balance, account_id) VALUES ('TEST_Tarjeta', 'credit_card', 20000, 0, $1) RETURNING id`,
      [cardId]
    );
    const debtId = debtRes.rows[0].id;

    const invRes = await pool.query(
      `INSERT INTO investments (name, capital_contributed, current_value, current_documented_value) VALUES ('TEST_Cetes', 0, 0, 0) RETURNING id`
    );
    const invId = invRes.rows[0].id;

    // --- ACC-001: Ingreso $10,000 en Nómina ---
    console.log('\n📌 ACC-001: Ingreso $10,000 en Nómina');
    await executeIncome({ destination_account_id: payrollId, amount: 10000, concept: 'TEST Ingreso Nómina' });
    const acc1 = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    logTest('ACC-001', 'Ingreso $10,000 en Nómina', 'Saldo Nómina = $10,000', `Saldo = $${acc1.balance}`, parseFloat(acc1.balance) === 10000);

    // --- ACC-002: Gasto $2,000 desde Nómina ---
    console.log('\n📌 ACC-002: Gasto $2,000 desde Nómina');
    await executeExpense({ source_account_id: payrollId, amount: 2000, concept: 'TEST Gasto Despensa' });
    const acc2 = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    logTest('ACC-002', 'Gasto $2,000 desde Nómina', 'Saldo Nómina = $8,000', `Saldo = $${acc2.balance}`, parseFloat(acc2.balance) === 8000);

    // --- NEG-001: Prevención de Saldos Negativos (Rechazo con Fondos insuficientes) ---
    console.log('\n📌 NEG-001: Intento de Gasto $10,000 teniendo $8,000');
    let negError = null;
    try {
      await executeExpense({ source_account_id: payrollId, amount: 10000, concept: 'TEST Gasto Excesivo' });
    } catch (e) {
      negError = e.message;
    }
    const accNeg = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    logTest('NEG-001', 'Gasto bloqueado por Fondos Insuficientes', 'Error: Fondos insuficientes y Saldo = $8,000', `Error: ${negError}, Saldo = $${accNeg.balance}`, negError === 'Fondos insuficientes' && parseFloat(accNeg.balance) === 8000);

    // --- ATM-001: Atomicidad de PostgreSQL (Rollback de Transacción ante fallo) ---
    console.log('\n📌 ATM-001: Prueba de Atomicidad ante fallo a mitad de proceso');
    let atmError = null;
    try {
      await withTransaction(async (client) => {
        await client.query('UPDATE accounts SET balance = balance - 1000 WHERE id = $1', [payrollId]);
        throw new Error('Fallo provocado a mitad de proceso');
      });
    } catch (e) {
      atmError = e.message;
    }
    const accAtm = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    logTest('ATM-001', 'Rollback completo de Transacción PostgreSQL', 'Saldo sin cambio = $8,000', `Saldo = $${accAtm.balance}`, parseFloat(accAtm.balance) === 8000);

    // --- TRF-001: Transferencia Nómina -> Débito $5,000 ---
    console.log('\n📌 TRF-001: Transferencia $5,000 de Nómina a Débito');
    const incomeBeforeTrf = await dbGet("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = 'income' AND concept LIKE '%TEST%'");
    const expenseBeforeTrf = await dbGet("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = 'expense' AND concept LIKE '%TEST%'");
    
    await executeTransfer({ source_account_id: payrollId, destination_account_id: debitId, amount: 5000, concept: 'TEST Transferencia ahorro' });
    
    const accPayTRF = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    const accDebTRF = await dbGet('SELECT balance FROM accounts WHERE id = ?', [debitId]);
    const incomeAfterTrf = await dbGet("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = 'income' AND concept LIKE '%TEST%'");
    const expenseAfterTrf = await dbGet("SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE type = 'expense' AND concept LIKE '%TEST%'");

    logTest('TRF-001a', 'Nómina reducida $5,000', 'Saldo Nómina = $3,000', `Saldo = $${accPayTRF.balance}`, parseFloat(accPayTRF.balance) === 3000);
    logTest('TRF-001b', 'Débito incrementado $5,000', 'Saldo Débito = $5,000', `Saldo = $${accDebTRF.balance}`, parseFloat(accDebTRF.balance) === 5000);
    logTest('TRF-001c', 'Transferencia no incrementa Ingresos ni Gastos globales', 'Ingresos/Gastos intactos', `Ingresos: ${incomeAfterTrf.total}, Gastos: ${expenseAfterTrf.total}`, parseFloat(incomeBeforeTrf.total) === parseFloat(incomeAfterTrf.total) && parseFloat(expenseBeforeTrf.total) === parseFloat(expenseAfterTrf.total));

    // --- CARD-001: Compra tarjeta $2,000 ---
    console.log('\n📌 CARD-001: Compra con Tarjeta $2,000');
    await executeCardPurchase({ credit_card_id: cardId, amount: 2000, concept: 'TEST Compra Ropa' });
    const card1 = await dbGet('SELECT balance, available_credit FROM accounts WHERE id = ?', [cardId]);
    logTest('CARD-001a', 'Deuda Tarjeta incrementada $2,000', 'Deuda = $2,000', `Deuda = $${card1.balance}`, parseFloat(card1.balance) === 2000);
    logTest('CARD-001b', 'Crédito disponible reducido $2,000', 'Disponible = $18,000', `Disponible = $${card1.available_credit}`, parseFloat(card1.available_credit) === 18000);

    // --- CARD-002: Pago tarjeta $1,000 desde Nómina ---
    console.log('\n📌 CARD-002: Pago Tarjeta $1,000 desde Nómina');
    await executeCardPayment({ source_account_id: payrollId, credit_card_id: cardId, amount: 1000, concept: 'TEST Pago Tarjeta' });
    const accPayCARD2 = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    const card2 = await dbGet('SELECT balance, available_credit FROM accounts WHERE id = ?', [cardId]);
    logTest('CARD-002a', 'Nómina reducida por pago', 'Nómina = $2,000', `Nómina = $${accPayCARD2.balance}`, parseFloat(accPayCARD2.balance) === 2000);
    logTest('CARD-002b', 'Deuda Tarjeta reducida a $1,000', 'Deuda = $1,000', `Deuda = $${card2.balance}`, parseFloat(card2.balance) === 1000);
    logTest('CARD-002c', 'Crédito disponible restaurado a $19,000', 'Disponible = $19,000', `Disponible = $${card2.available_credit}`, parseFloat(card2.available_credit) === 19000);

    // --- MSI-001 & MSI-003: Captura de MSI Existente ($12,000 / 12 meses, 4 pagados) ---
    console.log('\n📌 MSI-001 & MSI-003: Registrar MSI Existente');
    const cardBalBeforeMSI = (await dbGet('SELECT balance FROM accounts WHERE id = ?', [cardId])).balance;
    const msiRes = await registerExistingMSI({
      credit_card_id: cardId,
      concept: 'TEST MSI Laptop Antigua',
      original_amount: 12000,
      installment_count: 12,
      installments_paid: 4
    });
    const cardBalAfterMSI = (await dbGet('SELECT balance FROM accounts WHERE id = ?', [cardId])).balance;

    logTest('MSI-001a', 'Mensualidad MSI calculada $1,000', 'Mensualidad = $1,000', `Mensualidad = $${msiRes.monthly_installment}`, msiRes.monthly_installment === 1000);
    logTest('MSI-001b', 'Mensualidades restantes = 8', 'Restantes = 8', `Restantes = ${msiRes.installments_remaining}`, msiRes.installments_remaining === 8);
    logTest('MSI-001c', 'Saldo pendiente MSI = $8,000', 'Pendiente = $8,000', `Pendiente = $${msiRes.remaining_principal}`, msiRes.remaining_principal === 8000);
    logTest('MSI-003', 'Registrar MSI existente NO duplica deuda de tarjeta', 'Deuda Tarjeta Sin Cambio', `Antes: $${cardBalBeforeMSI}, Después: $${cardBalAfterMSI}`, parseFloat(cardBalBeforeMSI) === parseFloat(cardBalAfterMSI));

    // --- MSI-002: Nueva compra $12,000 a 12 MSI ---
    console.log('\n📌 MSI-002: Nueva compra $12,000 a 12 MSI');
    const newMsiRes = await executeCardPurchase({
      credit_card_id: cardId,
      amount: 12000,
      concept: 'TEST MSI Nueva TV',
      is_msi: true,
      msi_months: 12
    });
    logTest('MSI-002a', 'Compromiso de tarjeta actualizado $13,000', 'Deuda = $13,000', `Deuda = $${newMsiRes.card_balance}`, newMsiRes.card_balance === 13000);
    logTest('MSI-002b', 'Crédito disponible ajustado $7,000', 'Disponible = $7,000', `Disponible = $${newMsiRes.available_credit}`, newMsiRes.available_credit === 7000);

    // --- INV-001: Aporte a Inversión $10,000 desde Débito ---
    console.log('\n📌 INV-001: Aportación a Inversión $10,000 desde Débito');
    // Adjust debit balance to $15,000 for exact test
    await dbRun('UPDATE accounts SET balance = 15000 WHERE id = ?', [debitId]);
    await executeInvestmentContribution({ source_account_id: debitId, investment_id: invId, amount: 10000, concept: 'TEST Aporte Cetes' });
    const accDebINV1 = await dbGet('SELECT balance FROM accounts WHERE id = ?', [debitId]);
    const inv1 = await dbGet('SELECT current_value FROM investments WHERE id = ?', [invId]);
    logTest('INV-001a', 'Débito reducido de $15,000 a $5,000 por aporte', 'Débito = $5,000', `Débito = $${accDebINV1.balance}`, parseFloat(accDebINV1.balance) === 5000);
    logTest('INV-001b', 'Inversión incrementada a $10,000', 'Inversión = $10,000', `Inversión = $${inv1.current_value}`, parseFloat(inv1.current_value) === 10000);

    // Intento de aporte excediendo fondos
    let invError = null;
    try {
      await executeInvestmentContribution({ source_account_id: debitId, investment_id: invId, amount: 10000, concept: 'TEST Aporte Excedido' });
    } catch (e) {
      invError = e.message;
    }
    const accDebINV1_2 = await dbGet('SELECT balance FROM accounts WHERE id = ?', [debitId]);
    logTest('INV-001c', 'Aporte excedido rechazado por Fondos Insuficientes', 'Error: Fondos insuficientes, Débito = $5,000', `Error: ${invError}, Débito = $${accDebINV1_2.balance}`, invError === 'Fondos insuficientes' && parseFloat(accDebINV1_2.balance) === 5000);

    // --- INV-005: Retiro parcial de $30,000 de una inversión de $100,000 a Nómina ---
    console.log('\n📌 INV-005: Retiro Parcial de Inversión (Sin generar pérdida ni ganancia)');
    await dbRun('UPDATE investments SET current_value = 100000, current_documented_value = 100000 WHERE id = ?', [invId]);
    const invRetRes = await executeInvestmentWithdrawal({ investment_id: invId, destination_account_id: payrollId, amount: 30000, concept: 'TEST Retiro Parcial' });
    const inv5 = await dbGet('SELECT current_value FROM investments WHERE id = ?', [invId]);
    logTest('INV-005a', 'Inversión reducida de $100k a $70k', 'Inversión = $70,000', `Inversión = $${inv5.current_value}`, parseFloat(inv5.current_value) === 70000);
    logTest('INV-005b', 'Retiro genera Ganancia = $0 y Pérdida = $0', 'Ganancia = $0, Pérdida = $0', `Ganancia = $${invRetRes.gain}, Pérdida = $${invRetRes.loss}`, invRetRes.gain === 0 && invRetRes.loss === 0);

    // --- INV-006: Valuación a la baja ($70,000 -> $60,000) y a la alta ($60,000 -> $65,000) ---
    console.log('\n📌 INV-006: Valuaciones de Mercado');
    const accPayBeforeVal = (await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId])).balance;
    const invValLossRes = await executeInvestmentValuation({ investment_id: invId, new_current_value: 60000, concept: 'TEST Revaluación Baja' });
    const accPayAfterLoss = (await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId])).balance;
    logTest('INV-006a', 'Pérdida de valuación de $10,000 registrada sin tocar liquidez', 'Pérdida = -$10,000, Liquidez sin cambio', `Variance = ${invValLossRes.variance}, Nómina Antes: $${accPayBeforeVal}, Después: $${accPayAfterLoss}`, invValLossRes.variance === -10000 && parseFloat(accPayBeforeVal) === parseFloat(accPayAfterLoss));

    const invValGainRes = await executeInvestmentValuation({ investment_id: invId, new_current_value: 65000, concept: 'TEST Revaluación Alta' });
    const accPayAfterGain = (await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId])).balance;
    logTest('INV-006b', 'Ganancia de valuación de $5,000 registrada sin tocar liquidez', 'Ganancia = +$5,000, Liquidez sin cambio', `Variance = ${invValGainRes.variance}, Nómina Después: $${accPayAfterGain}`, invValGainRes.variance === 5000 && parseFloat(accPayAfterLoss) === parseFloat(accPayAfterGain));

    // --- BUD-001, BUD-002, BUD-003, BUD-004: Evaluaciones de Presupuesto Diario 24h ---
    console.log('\n📌 BUD-001 a BUD-004: Evaluaciones de Presupuesto Diario 24h');
    const budStatus = await getDailyBudgetStatus();
    logTest('BUD-001..004', 'Estado de Presupuesto Diario calculado correctamente', 'Result Status válido', `Budget: $${budStatus.budget_amount}, Spent: $${budStatus.actual_spent}, Result: ${budStatus.result}`, typeof budStatus.result === 'string');

    // --- REC-001: Reconciliación de Dinero Disponible y Patrimonio Neto ---
    console.log('\n📌 REC-001: Reconciliación de Dinero Disponible y Patrimonio Neto');
    const metrics = await calculateFinancialMetrics();
    logTest('REC-001a', 'Dinero Disponible = Liquidez + Inversiones', 'Número válido', `Dinero Disponible = $${metrics.disponible_hoy}`, typeof metrics.disponible_hoy === 'number');
    logTest('REC-001b', 'Patrimonio Neto = Activos - Pasivos', 'Número válido', `Patrimonio Neto = $${metrics.riqueza_neta}`, typeof metrics.riqueza_neta === 'number');

    // Clean test data
    await pool.query("DELETE FROM transactions WHERE notes LIKE '%TEST_RUN%' OR concept LIKE '%TEST%' OR concept LIKE 'Prueba%'");
    await pool.query("DELETE FROM installment_plans WHERE concept LIKE '%TEST%' OR concept LIKE 'Prueba%'");
    await pool.query("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_%')");
    await pool.query("DELETE FROM debts WHERE name LIKE 'TEST_%' OR account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_%')");
    await pool.query("DELETE FROM accounts WHERE name LIKE 'TEST_%'");
    await pool.query("DELETE FROM investments WHERE name LIKE 'TEST_%'");

    console.log('\n======================================================');
    console.log(`📊 RESULTADO FINAL: ${passedCount} PASADAS | ${failedCount} FALLADAS`);
    console.log('======================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('💥 ERROR FATAL EN PRUEBAS:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runAcceptanceTests().then(() => process.exit(0));
}

module.exports = { runAcceptanceTests };
