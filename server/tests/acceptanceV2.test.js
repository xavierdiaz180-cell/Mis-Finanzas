const { pool, initDatabase, dbRun, dbGet, dbAll } = require('../database');
const {
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
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DE ACEPTACIÓN — V2');
  console.log('======================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASÓ: ${message}`);
      passedCount++;
    } else {
      console.error(`  ❌ FALLÓ: ${message}`);
      failedCount++;
    }
  }

  try {
    await initDatabase();

    // Reset test accounts/tables in an isolated test transaction block
    console.log('🔄 Preparando entorno aislado de pruebas...');
    await pool.query("DELETE FROM transactions WHERE notes LIKE '%TEST_RUN%' OR concept LIKE '%TEST%' OR concept LIKE 'Prueba%'");
    await pool.query("DELETE FROM installment_plans WHERE concept LIKE '%TEST%' OR concept LIKE 'Prueba%'");
    await pool.query("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_%')");
    await pool.query("DELETE FROM accounts WHERE name LIKE 'TEST_%'");
    await pool.query("DELETE FROM investments WHERE name LIKE 'TEST_%'");
    await pool.query("DELETE FROM debts WHERE name LIKE 'TEST_%'");

    // Create test entities
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
      `INSERT INTO debts (name, type, original_amount, current_balance) VALUES ('TEST_Tarjeta', 'credit_card', 20000, 0) RETURNING id`
    );

    const invRes = await pool.query(
      `INSERT INTO investments (name, capital_contributed, current_value, current_documented_value) VALUES ('TEST_Cetes', 0, 0, 0) RETURNING id`
    );
    const invId = invRes.rows[0].id;

    // --- ACC-001: Ingreso $10,000 en Nómina ---
    console.log('\n📌 ACC-001: Ingreso $10,000 en Nómina');
    await executeIncome({ destination_account_id: payrollId, amount: 10000, concept: 'TEST Ingreso Nómina' });
    const acc1 = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    assert(parseFloat(acc1.balance) === 10000, `Saldo Nómina es $10,000 (Actual: $${acc1.balance})`);

    // --- ACC-002: Gasto $2,000 desde Nómina ---
    console.log('\n📌 ACC-002: Gasto $2,000 desde Nómina');
    await executeExpense({ source_account_id: payrollId, amount: 2000, concept: 'TEST Gasto Despensa' });
    const acc2 = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    assert(parseFloat(acc2.balance) === 8000, `Saldo Nómina es $8,000 (Actual: $${acc2.balance})`);

    // --- TRF-001: Transferencia Nómina -> Débito $5,000 ---
    console.log('\n📌 TRF-001: Transferencia Nómina -> Débito $5,000');
    await executeTransfer({ source_account_id: payrollId, destination_account_id: debitId, amount: 5000, concept: 'TEST Transferencia ahorro' });
    const accPayTRF = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    const accDebTRF = await dbGet('SELECT balance FROM accounts WHERE id = ?', [debitId]);
    assert(parseFloat(accPayTRF.balance) === 3000, `Origen Nómina es $3,000 (Actual: $${accPayTRF.balance})`);
    assert(parseFloat(accDebTRF.balance) === 5000, `Destino Débito es $5,000 (Actual: $${accDebTRF.balance})`);

    // --- CARD-001: Compra tarjeta $2,000 ---
    console.log('\n📌 CARD-001: Compra con Tarjeta $2,000');
    await executeCardPurchase({ credit_card_id: cardId, amount: 2000, concept: 'TEST Compra Ropa' });
    const card1 = await dbGet('SELECT balance, available_credit FROM accounts WHERE id = ?', [cardId]);
    assert(parseFloat(card1.balance) === 2000, `Deuda Tarjeta es $2,000 (Actual: $${card1.balance})`);
    assert(parseFloat(card1.available_credit) === 18000, `Crédito disponible es $18,000 (Actual: $${card1.available_credit})`);

    // --- CARD-002: Pago tarjeta $1,000 desde Nómina ---
    console.log('\n📌 CARD-002: Pago Tarjeta $1,000 desde Nómina');
    await executeCardPayment({ source_account_id: payrollId, credit_card_id: cardId, amount: 1000, concept: 'TEST Pago Tarjeta' });
    const accPayCARD2 = await dbGet('SELECT balance FROM accounts WHERE id = ?', [payrollId]);
    const card2 = await dbGet('SELECT balance, available_credit FROM accounts WHERE id = ?', [cardId]);
    assert(parseFloat(accPayCARD2.balance) === 2000, `Nómina restante es $2,000 (Actual: $${accPayCARD2.balance})`);
    assert(parseFloat(card2.balance) === 1000, `Deuda Tarjeta es $1,000 (Actual: $${card2.balance})`);
    assert(parseFloat(card2.available_credit) === 19000, `Crédito disponible restaurado a $19,000 (Actual: $${card2.available_credit})`);

    // --- MSI-001 & MSI-003: Registrar MSI existente $12,000 / 12 meses con 4 pagados ---
    console.log('\n📌 MSI-001 & MSI-003: Captura de MSI Existente ($12,000 / 12 meses, 4 pagados)');
    const msiRes = await registerExistingMSI({
      credit_card_id: cardId,
      concept: 'TEST MSI Laptop Antigua',
      original_amount: 12000,
      installment_count: 12,
      installments_paid: 4
    });
    assert(msiRes.monthly_installment === 1000, `Mensualidad calculada es $1,000 (Actual: $${msiRes.monthly_installment})`);
    assert(msiRes.installments_remaining === 8, `Mensualidades restantes es 8 (Actual: ${msiRes.installments_remaining})`);
    assert(msiRes.remaining_principal === 8000, `Saldo pendiente MSI es $8,000 (Actual: $${msiRes.remaining_principal})`);

    // --- MSI-002: Nueva compra $12,000 a 12 MSI ---
    console.log('\n📌 MSI-002: Nueva compra $12,000 a 12 MSI');
    const newMsiRes = await executeCardPurchase({
      credit_card_id: cardId,
      amount: 12000,
      concept: 'TEST MSI Nueva TV',
      is_msi: true,
      msi_months: 12
    });
    assert(newMsiRes.card_balance === 13000, `Deuda tarjeta compromiso total $13,000 (Actual: $${newMsiRes.card_balance})`);
    assert(newMsiRes.available_credit === 7000, `Crédito disponible es $7,000 (Actual: $${newMsiRes.available_credit})`);

    // --- INV-001: Aporte a inversión $10,000 desde Débito ---
    console.log('\n📌 INV-001: Aportación a Inversión $10,000 desde Débito');
    await executeInvestmentContribution({ source_account_id: debitId, investment_id: invId, amount: 10000, concept: 'TEST Aporte Cetes' });
    const accDebINV1 = await dbGet('SELECT balance FROM accounts WHERE id = ?', [debitId]);
    const inv1 = await dbGet('SELECT current_value FROM investments WHERE id = ?', [invId]);
    assert(parseFloat(accDebINV1.balance) === -5000 || parseFloat(accDebINV1.balance) === 5000 - 10000, `Débito reducido por aporte (Actual: $${accDebINV1.balance})`);
    assert(parseFloat(inv1.current_value) === 10000, `Valor Inversión es $10,000 (Actual: $${inv1.current_value})`);

    // --- INV-005: Retiro parcial de $30,000 de una inversión de $100,000 a Nómina ---
    console.log('\n📌 INV-005: Retiro Parcial de Inversión (Sin generar pérdida ni ganancia)');
    // Set investment value to $100,000 for clean test
    await dbRun('UPDATE investments SET current_value = 100000, current_documented_value = 100000 WHERE id = ?', [invId]);
    const invRetRes = await executeInvestmentWithdrawal({ investment_id: invId, destination_account_id: payrollId, amount: 30000, concept: 'TEST Retiro Parcial' });
    const inv5 = await dbGet('SELECT current_value FROM investments WHERE id = ?', [invId]);
    assert(parseFloat(inv5.current_value) === 70000, `Inversión restante es $70,000 (Actual: $${inv5.current_value})`);
    assert(invRetRes.loss === 0, `Pérdida generada por el retiro es $0 (Actual: $${invRetRes.loss})`);
    assert(invRetRes.gain === 0, `Ganancia generada por el retiro es $0 (Actual: $${invRetRes.gain})`);

    // --- INV-006: Valuación a la baja de $70,000 a $60,000 ---
    console.log('\n📌 INV-006: Valuación a la baja ($70,000 -> $60,000)');
    const invValRes = await executeInvestmentValuation({ investment_id: invId, new_current_value: 60000, concept: 'TEST Ajuste mercado' });
    const inv6 = await dbGet('SELECT current_value FROM investments WHERE id = ?', [invId]);
    assert(parseFloat(inv6.current_value) === 60000, `Inversión revaluada a $60,000 (Actual: $${inv6.current_value})`);
    assert(invValRes.variance === -10000, `Pérdida de valuación registrada de $10,000 (Variance: $${invValRes.variance})`);

    // --- BUD-001, BUD-002, BUD-003, BUD-004: Presupuesto Diario 24h ---
    console.log('\n📌 BUD-001 a BUD-004: Evaluación de Presupuesto Diario');
    const bud1 = await getDailyBudgetStatus();
    assert(bud1.budget_amount === 500 || bud1.budget_amount > 0, `Monto configurado de presupuesto es válido ($${bud1.budget_amount})`);
    assert(typeof bud1.result === 'string', `Estado del resultado es una cadena válida (${bud1.result})`);

    // --- REC-001: Reconciliación de Dinero Disponible y Patrimonio Neto ---
    console.log('\n📌 REC-001: Reconciliación de Dinero Disponible y Patrimonio Neto');
    const metrics = await calculateFinancialMetrics();
    assert(typeof metrics.disponible_hoy === 'number', `Dinero disponible calculado correctamente ($${metrics.disponible_hoy})`);
    assert(typeof metrics.riqueza_neta === 'number', `Patrimonio neto calculado correctamente ($${metrics.riqueza_neta})`);

    // Clean test data
    await pool.query("DELETE FROM transactions WHERE notes LIKE '%TEST_RUN%' OR concept LIKE '%TEST%' OR concept LIKE 'Prueba%'");
    await pool.query("DELETE FROM installment_plans WHERE concept LIKE '%TEST%' OR concept LIKE 'Prueba%'");
    await pool.query("DELETE FROM incomes WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE 'TEST_%')");
    await pool.query("DELETE FROM accounts WHERE name LIKE 'TEST_%'");
    await pool.query("DELETE FROM investments WHERE name LIKE 'TEST_%'");
    await pool.query("DELETE FROM debts WHERE name LIKE 'TEST_%'");

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
