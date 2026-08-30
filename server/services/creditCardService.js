const { pool, dbAll, dbGet, dbRun } = require('../database');

/**
 * MSI-001 / MSI-003: Registrar MSI existente previamente activo
 */
async function registerExistingMSI({
  credit_card_id,
  concept,
  original_amount,
  installment_count,
  monthly_installment,
  installments_paid = 0,
  purchase_date
}) {
  const origAmount = parseFloat(original_amount);
  const totalInst = parseInt(installment_count, 10);
  const paidInst = parseInt(installments_paid, 10);
  if (!origAmount || origAmount <= 0) throw new Error('El monto original debe ser positivo.');
  if (!totalInst || totalInst <= 0) throw new Error('El plazo de mensualidades debe ser un número positivo.');
  if (paidInst < 0 || paidInst >= totalInst) throw new Error('Los meses pagados deben ser menores al plazo total.');

  const monthlyInst = monthly_installment ? parseFloat(monthly_installment) : parseFloat((origAmount / totalInst).toFixed(2));
  const remainingInst = totalInst - paidInst;
  const remainingPrincipal = parseFloat((monthlyInst * remainingInst).toFixed(2));
  const txDate = purchase_date || new Date().toISOString().split('T')[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cardRes = await client.query("SELECT * FROM accounts WHERE id = $1 AND type = 'credit_card'", [credit_card_id]);
    const card = cardRes.rows[0];
    if (!card) throw new Error('Tarjeta de crédito no encontrada.');

    // Find matching debt record using strict account_id relationship
    const debtRes = await client.query("SELECT * FROM debts WHERE account_id = $1", [credit_card_id]);
    const debtId = debtRes.rows[0]?.id || null;

    const msiRes = await client.query(
      `INSERT INTO installment_plans (
        credit_card_id, account_id, debt_id, concept, total_amount, original_amount, 
        monthly_amount, installments_total, installments_paid, installments_remaining, 
        remaining_balance, remaining_principal, purchase_date, status
      ) VALUES ($1, $1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $9, $10, 'active') RETURNING *`,
      [credit_card_id, debtId, concept, origAmount, monthlyInst, totalInst, paidInst, remainingInst, remainingPrincipal, txDate]
    );

    await client.query('COMMIT');

    return {
      success: true,
      msi_plan: msiRes.rows[0],
      monthly_installment: monthlyInst,
      installments_remaining: remainingInst,
      remaining_principal: remainingPrincipal
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Enriches credit card accounts with calculated MSI, revolving balances, and no-interest payments
 */
async function enrichAccountsWithMSIData(accounts = []) {
  const installmentPlans = await dbAll('SELECT * FROM installment_plans');
  const debts = await dbAll('SELECT * FROM debts');

  return accounts.map(acc => {
    if (acc.type === 'credit_card') {
      const matchingDebts = debts.filter(d => d.account_id === acc.id);
      const debtIds = matchingDebts.map(d => d.id);

      const msiPlans = installmentPlans.filter(p =>
        p.account_id === acc.id ||
        p.credit_card_id === acc.id ||
        (p.debt_id && debtIds.includes(p.debt_id))
      );
      const activeMsiPlans = msiPlans.filter(p => {
        const paid = parseInt(p.installments_paid, 10) || 0;
        const total = parseInt(p.installments_total, 10) || 1;
        return paid < total && p.status !== 'completed';
      });

      const msiMonthlySum = activeMsiPlans.reduce((sum, p) => sum + (parseFloat(p.monthly_amount) || 0), 0);
      const msiRemainingTotal = activeMsiPlans.reduce((sum, p) => {
        const totalInst = parseInt(p.installments_total, 10) || 12;
        const paidInst = parseInt(p.installments_paid, 10) || 0;
        const remInst = parseInt(p.installments_remaining, 10) || Math.max(0, totalInst - paidInst);
        const monthly = parseFloat(p.monthly_amount) || 0;
        return sum + (monthly * remInst);
      }, 0);

      const totalDebt = parseFloat(acc.balance || 0);
      const revolvingBalance = Math.max(0, totalDebt - msiRemainingTotal);
      const noInterestPayment = activeMsiPlans.length > 0 ? (msiMonthlySum + revolvingBalance) : (parseFloat(acc.no_interest_payment) || totalDebt);
      const available = acc.credit_limit > 0 ? Math.max(0, acc.credit_limit - totalDebt) : acc.available_credit;

      return {
        ...acc,
        balance: totalDebt,
        total_debt: totalDebt,
        available_credit: available,
        msi_pending: msiRemainingTotal,
        msi_monthly_sum: msiMonthlySum,
        msi_remaining_total: msiRemainingTotal,
        revolving_balance: revolvingBalance,
        no_interest_payment: noInterestPayment,
        msi_plans: msiPlans
      };
    }
    return acc;
  });
}

module.exports = {
  registerExistingMSI,
  enrichAccountsWithMSIData
};
