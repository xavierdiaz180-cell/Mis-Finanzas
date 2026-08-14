const dotenv = require('dotenv');
dotenv.config();
const { dbAll } = require('./server/database');

async function check() {
  try {
    console.log('--- ACCOUNTS ---');
    const accs = await dbAll("SELECT id, name, type, balance, available_credit, credit_limit, min_payment, no_interest_payment, cutoff_date, due_date FROM accounts");
    console.log(accs);

    console.log('--- DEBTS ---');
    const debts = await dbAll("SELECT id, name, type, current_balance, min_payment, no_interest_payment, cutoff_date, due_date FROM debts");
    console.log(debts);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
