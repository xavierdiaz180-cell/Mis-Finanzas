const URL = 'https://mis-finanzas-cik2.onrender.com';

async function main() {
  const debtsRes = await fetch(`${URL}/api/debts`);
  const debts = await debtsRes.json();
  console.log('=== PRODUCTION DEBTS ===');
  console.log(JSON.stringify(debts, null, 2));

  const accsRes = await fetch(`${URL}/api/accounts`);
  const accounts = await accsRes.json();
  console.log('=== PRODUCTION ACCOUNTS ===');
  console.log(JSON.stringify(accounts, null, 2));

  const txRes = await fetch(`${URL}/api/transactions`);
  const txs = await txRes.json();
  console.log('=== PRODUCTION RECENT TRANSACTIONS ===');
  console.log(JSON.stringify(txs.slice(0, 10), null, 2));
}

main();
