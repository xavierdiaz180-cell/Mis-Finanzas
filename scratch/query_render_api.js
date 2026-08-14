async function checkProductionAPI() {
  try {
    const debtsRes = await fetch('https://mis-finanzas-b09e.onrender.com/api/debts');
    const debts = await debtsRes.json();
    console.log('=== PRODUCTION DEBTS ===');
    console.log(JSON.stringify(debts, null, 2));

    const accsRes = await fetch('https://mis-finanzas-b09e.onrender.com/api/accounts');
    const accounts = await accsRes.json();
    console.log('=== PRODUCTION ACCOUNTS ===');
    console.log(JSON.stringify(accounts, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkProductionAPI();
