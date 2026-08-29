const { initDatabase, dbAll, dbGet, dbRun } = require('../server/database');
const creditCardController = require('../server/controllers/creditCardController');
const { syncCreditCardsAndDebts } = require('../server/services/financialRules');

async function testDebtsCrud() {
  await initDatabase();
  console.log('Testing sync and deduplication...');
  await syncCreditCardsAndDebts();

  const debtsBefore = await dbAll('SELECT id, name, current_balance, account_id FROM debts');
  console.log('Debts in DB after sync:', debtsBefore);

  // Test create temporary test debt
  const createRes = await dbRun(
    "INSERT INTO debts (name, type, current_balance, min_payment, no_interest_payment) VALUES ('TEST_DELETE_ME', 'credit_card', 5000, 250, 5000)"
  );
  const testDebtId = createRes.lastID;
  console.log('Created test debt ID:', testDebtId);

  // Test edit debt
  const reqEdit = {
    params: { id: testDebtId },
    body: { name: 'TEST_EDITED_DEBT', current_balance: 6000, min_payment: 300, no_interest_payment: 6000 }
  };
  let editRes = null;
  const resEdit = {
    json: (data) => { editRes = data; return resEdit; },
    status: (code) => { console.log('Edit HTTP Status:', code); return resEdit; }
  };
  await creditCardController.updateDebt(reqEdit, resEdit);
  console.log('Edit result:', editRes);

  const editedDebt = await dbGet('SELECT * FROM debts WHERE id = ?', [testDebtId]);
  console.log('Edited debt balance in DB:', editedDebt ? editedDebt.current_balance : 'NULL');

  // Test delete debt
  const reqDel = { params: { id: testDebtId } };
  let delRes = null;
  const resDel = {
    json: (data) => { delRes = data; return resDel; },
    status: (code) => { console.log('Delete HTTP Status:', code); return resDel; }
  };
  await creditCardController.deleteDebt(reqDel, resDel);
  console.log('Delete result:', delRes);

  const deletedCheck = await dbGet('SELECT * FROM debts WHERE id = ?', [testDebtId]);
  console.log('Debt exists after delete?:', !!deletedCheck);

  if (!deletedCheck && editedDebt && editedDebt.current_balance === 6000) {
    console.log('\n✅ CRUD DEUDAS TEST PASSED 100%!');
  } else {
    console.error('\n❌ CRUD DEUDAS TEST FAILED!');
    process.exit(1);
  }
}

testDebtsCrud()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error in CRUD test:', err);
    process.exit(1);
  });
