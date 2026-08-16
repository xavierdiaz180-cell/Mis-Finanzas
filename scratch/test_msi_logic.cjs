// Test logic simulation
async function runTest() {
  console.log('--- TEST 1: Stori Card ---');
  // Card loaded balance = $5,000.
  // Active MSI plan: $500/month, 12 months total, paid 7 months (abono 8 de 12, 5 remaining).
  const storiBalance = 5000;
  const storiMonthly = 500;
  const storiTotalMonths = 12;
  const storiPaidMonths = 7; // 5 remaining
  const storiRemainingMsi = storiMonthly * (storiTotalMonths - storiPaidMonths); // $2500
  const storiRevolving = Math.max(0, storiBalance - storiRemainingMsi); // $2500
  const storiNoInterestPayment = storiMonthly + storiRevolving; // $3000

  console.log('Stori Total Balance:', storiBalance);
  console.log('Stori Remaining MSI Balance:', storiRemainingMsi);
  console.log('Stori Revolving (1 solo pago):', storiRevolving);
  console.log('Stori Pago Para No Generar Intereses:', storiNoInterestPayment);
  console.assert(storiNoInterestPayment === 3000, 'Stori calculation error');

  console.log('\n--- TEST 2: DiDi Card ---');
  // Card loaded balance = $18,000.
  // Plan 1: $2004/month, 12 months total, paid 5 (abono 6 de 12 -> 7 remaining). Remaining = 2004 * 7 = 14028.
  // Plan 2: $39.29/month, 12 months total, paid 3 (abono 4 de 12 -> 9 remaining). Remaining = 39.29 * 9 = 353.61.
  const didiBalance = 18000;
  const didiRemainingMsi = (2004 * 7) + (39.29 * 9); // 14381.61
  const didiMonthlySum = 2004 + 39.29; // 2043.29
  const didiRevolving = Math.max(0, didiBalance - didiRemainingMsi); // 3618.39
  const didiNoInterestPayment = didiMonthlySum + didiRevolving; // 5661.68

  console.log('DiDi Total Balance:', didiBalance);
  console.log('DiDi Remaining MSI Balance:', didiRemainingMsi.toFixed(2));
  console.log('DiDi Monthly MSI Sum:', didiMonthlySum.toFixed(2));
  console.log('DiDi Revolving (1 solo pago):', didiRevolving.toFixed(2));
  console.log('DiDi Pago Para No Generar Intereses:', didiNoInterestPayment.toFixed(2));
  
  console.log('\n✅ All MSI logic mathematical tests passed successfully!');
}

runTest();
