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

    // Find matching debt record if exists
    const debtRes = await client.query("SELECT * FROM debts WHERE type = 'credit_card' AND (LOWER(name) = LOWER($1) OR LOWER(name) LIKE LOWER($2))", [card.name, `%${card.name}%`]);
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

module.exports = {
  registerExistingMSI
};
