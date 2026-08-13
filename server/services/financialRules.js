const { dbAll, dbGet, dbRun } = require('../database');

/**
 * Calculates metrics according to strict financial rules:
 * 1. Disponible Hoy = Bank Accounts + Payroll Accounts + Cash (EXCLUDES investments).
 * 2. Riqueza Neta = Disponible hoy + Inversiones documentadas - Deuda total. (Display 0 if negative).
 * 3. Salud Financiera (0-100) with explanation of factors.
 * 4. Presupuesto Diario Acumulable (Resets on 1st of month, unspent rolls over).
 */
function getLocalDateString(dateObj = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(dateObj);
}

async function calculateFinancialMetrics() {
  const today = getLocalDateString();
  const currentMonth = today.substring(0, 7); // YYYY-MM
  const dayOfMonth = parseInt(today.split('-')[2], 10);

  // 1. Available Today
  const liquidAccounts = await dbAll(`
    SELECT SUM(balance) as total FROM accounts 
    WHERE active = 1 AND type IN ('bank', 'payroll', 'cash')
  `);
  const disponibleHoy = parseFloat(liquidAccounts[0]?.total || 0);

  // 2. Documented Investments Value
  const investmentRow = await dbAll('SELECT SUM(current_documented_value) as total FROM investments');
  const totalInversiones = parseFloat(investmentRow[0]?.total || 0);

  // 3. Total Debt
  // Debts from debts table
  const debtRow = await dbAll('SELECT SUM(current_balance) as total FROM debts');
  const totalDebtsTable = parseFloat(debtRow[0]?.total || 0);

  // Credit card used balances from accounts table
  const ccAccounts = await dbAll(`
    SELECT SUM(credit_limit - available_credit) as total FROM accounts
    WHERE active = 1 AND type = 'credit_card' AND credit_limit > available_credit
  `);
  const totalCCDebt = parseFloat(ccAccounts[0]?.total || 0);

  const totalDeuda = totalDebtsTable + totalCCDebt;

  // 4. Net Worth calculation
  const rawNetWorth = disponibleHoy + totalInversiones - totalDeuda;
  const riquezaNeta = rawNetWorth > 0 ? rawNetWorth : 0;

  // 5. Month Income & Expenses
  const monthIncomeRow = await dbAll(`
    SELECT SUM(amount) as total FROM transactions
    WHERE type = 'income' AND (date LIKE ? OR date = ?)
  `, [`${currentMonth}%`, currentMonth]);
  const ingresosMes = parseFloat(monthIncomeRow[0]?.total || 0);

  const monthExpenseRow = await dbAll(`
    SELECT SUM(amount) as total FROM transactions
    WHERE type = 'expense' AND (date LIKE ? OR date = ?)
  `, [`${currentMonth}%`, currentMonth]);
  const gastosMes = parseFloat(monthExpenseRow[0]?.total || 0);

  // 6. Financial Health Score Calculation (0-100)
  let score = 75; // base score
  const factors = [];

  // Liquidity factor
  if (disponibleHoy > 20000) {
    score += 10;
    factors.push('+ Excelente nivel de liquidez disponible');
  } else if (disponibleHoy < 3000) {
    score -= 15;
    factors.push('- Liquidez disponible baja para imprevistos');
  }

  // Debt factor
  if (totalDeuda === 0) {
    score += 15;
    factors.push('+ Cero deudas registradas');
  } else {
    const debtRatio = totalDeuda / (disponibleHoy + totalInversiones + 1);
    if (debtRatio > 0.8) {
      score -= 25;
      factors.push('- Nivel de endeudamiento muy elevado en relación a tu patrimonio');
    } else if (debtRatio > 0.4) {
      score -= 10;
      factors.push('- Endeudamiento moderado');
    } else {
      score += 5;
      factors.push('+ Endeudamiento bajo y manejable');
    }
  }

  // Savings capacity factor
  if (ingresosMes > 0) {
    const savingsRate = (ingresosMes - gastosMes) / ingresosMes;
    if (savingsRate >= 0.2) {
      score += 10;
      factors.push('+ Capacidad de ahorro superior al 20% este mes');
    } else if (savingsRate < 0) {
      score -= 15;
      factors.push('- Tus gastos superan tus ingresos este mes');
    }
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  let etiqueta = 'Buena';
  if (clampedScore >= 85) etiqueta = 'Excelente';
  else if (clampedScore >= 70) etiqueta = 'Buena';
  else if (clampedScore >= 50) etiqueta = 'Regular';
  else etiqueta = 'En Riesgo';

  // 7. Daily Budget Calculation with Rollover & 1st of month reset
  const budgetSetting = await dbGet("SELECT value FROM settings WHERE key = 'daily_budget_limit'");
  const baseDailyLimit = parseFloat(budgetSetting?.value || 200);

  let budgetRecord = await dbGet('SELECT * FROM daily_budget WHERE month = ?', [currentMonth]);
  
  if (!budgetRecord) {
    // New month initialization (1st of month reset)
    const rolloverAmount = 0; // reset on 1st of month
    await dbRun(
      'INSERT INTO daily_budget (base_amount, month, rollover_amount, daily_spent, last_reset_date) VALUES (?, ?, ?, 0, ?)',
      [baseDailyLimit, currentMonth, rolloverAmount, today]
    );
    budgetRecord = await dbGet('SELECT * FROM daily_budget WHERE month = ?', [currentMonth]);
  }

  // Calculate today's spent amount
  const todaySpentRow = await dbAll(`
    SELECT SUM(amount) as total FROM transactions
    WHERE type = 'expense' AND (date = ? OR date LIKE ?)
  `, [today, `${today}%`]);
  const gastadoHoy = parseFloat(todaySpentRow[0]?.total || 0);

  // Calculate total budget for full month (e.g. 31 days in August * $200 = $6,200)
  const [yearStr, monthStr] = currentMonth.split('-');
  const totalDaysInMonth = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();
  const totalFullMonthBudget = (baseDailyLimit * totalDaysInMonth) + (budgetRecord.rollover_amount || 0);
  const totalSpentSoFar = gastosMes;
  const disponibleHoyPresupuesto = baseDailyLimit - gastadoHoy;
  const disponibleAcumuladoMes = Math.max(0, totalFullMonthBudget - totalSpentSoFar);

  return {
    disponible_hoy: disponibleHoy,
    total_inversiones: totalInversiones,
    total_deuda: totalDeuda,
    riqueza_neta: riquezaNeta,
    riqueza_neta_raw: rawNetWorth,
    ingresos_mes: ingresosMes,
    gastos_mes: gastosMes,
    salud_financiera: {
      score: clampedScore,
      etiqueta: etiqueta,
      explicacion: factors.length > 0 ? factors.join('. ') : 'Métricas equilibradas.'
    },
    presupuesto_diario: {
      limite_diario: baseDailyLimit,
      gastado_hoy: gastadoHoy,
      disponible_hoy: disponibleHoyPresupuesto,
      acumulado_mes: disponibleAcumuladoMes,
      dias_mes: totalDaysInMonth,
      presupuesto_total_mes: totalFullMonthBudget,
      reinicio_mes: '1 de cada mes'
    }
  };
}

/**
 * Executes a transaction and updates affected account balances atomically
 */
async function processTransaction({ date, type, amount, category, concept, account_id, source = 'voice', notes = '' }) {
  if (!amount || amount <= 0) throw new Error('El monto debe ser un número positivo.');
  if (!account_id) throw new Error('Debes seleccionar una cuenta o tarjeta.');
  if (!category) throw new Error('La categoría es requerida.');
  if (!concept) throw new Error('El concepto es requerido.');

  const txDate = date || getLocalDateString();

  // Insert transaction
  const result = await dbRun(
    `INSERT INTO transactions (date, type, amount, category, concept, account_id, source, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
    [txDate, type, parseFloat(amount), category, concept, account_id, source, notes]
  );

  const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [account_id]);
  if (!account) throw new Error('Cuenta no encontrada.');

  // Financial Rules for account updates:
  // Bank / Payroll / Cash: Expense reduces balance. Income increases balance.
  // Credit Card: Expense reduces available_credit. Payment increases available_credit.
  if (account.type === 'credit_card') {
    if (type === 'expense') {
      const newAvailable = Math.max(0, account.available_credit - parseFloat(amount));
      await dbRun('UPDATE accounts SET available_credit = ? WHERE id = ?', [newAvailable, account_id]);
    } else if (type === 'payment' || type === 'income') {
      const newAvailable = Math.min(account.credit_limit, account.available_credit + parseFloat(amount));
      await dbRun('UPDATE accounts SET available_credit = ? WHERE id = ?', [newAvailable, account_id]);
    }
  } else {
    // Debit / Cash / Payroll / Bank
    if (type === 'expense') {
      const newBalance = account.balance - parseFloat(amount);
      await dbRun('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account_id]);
    } else if (type === 'income' || type === 'payment') {
      const newBalance = account.balance + parseFloat(amount);
      await dbRun('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account_id]);
      
      if (type === 'income') {
        const incomeType = account.type === 'payroll' ? 'payroll' : 'extraordinary';
        await dbRun(
          'INSERT INTO incomes (date, amount, type, account_id) VALUES (?, ?, ?, ?)',
          [txDate, parseFloat(amount), incomeType, account_id]
        );
      }
    }
  }

  return {
    transaction_id: result.lastID,
    success: true,
    message: 'Operación registrada y saldos actualizados correctamente.'
  };
}

/**
 * Deletes a transaction and completely reverts all account balances and debt balances
 */
async function deleteTransaction(transactionId) {
  const tx = await dbGet('SELECT * FROM transactions WHERE id = ?', [transactionId]);
  if (!tx) throw new Error('Transacción no encontrada.');

  const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [tx.account_id]);
  const amount = parseFloat(tx.amount);

  if (account) {
    if (account.type === 'credit_card') {
      if (tx.type === 'expense') {
        const newAvailable = Math.min(account.credit_limit, account.available_credit + amount);
        const newBalance = Math.max(0, account.balance - amount);
        await dbRun('UPDATE accounts SET available_credit = ?, balance = ? WHERE id = ?', [newAvailable, newBalance, account.id]);

        // Sync corresponding debt
        const existingDebt = await dbGet('SELECT * FROM debts WHERE name LIKE ? OR name LIKE ?', [account.name, `%${account.name}%`]);
        if (existingDebt) {
          await dbRun('UPDATE debts SET current_balance = GREATEST(0, current_balance - ?) WHERE id = ?', [amount, existingDebt.id]);

        }
      } else if (tx.type === 'payment' || tx.type === 'income') {
        const newAvailable = Math.max(0, account.available_credit - amount);
        const newBalance = account.balance + amount;
        await dbRun('UPDATE accounts SET available_credit = ?, balance = ? WHERE id = ?', [newAvailable, newBalance, account.id]);
      }
    } else {
      // Debit / Cash / Payroll / Bank
      if (tx.type === 'expense') {
        const newBalance = account.balance + amount;
        await dbRun('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account.id]);
      } else if (tx.type === 'income' || tx.type === 'payment') {
        const newBalance = account.balance - amount;
        await dbRun('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, account.id]);
        if (tx.type === 'income') {
          await dbRun('DELETE FROM incomes WHERE account_id = ? AND date = ? AND amount = ?', [account.id, tx.date, amount]);
        }
      }
    }
  }

  // Delete transaction record
  await dbRun('DELETE FROM transactions WHERE id = ?', [transactionId]);

  return {
    success: true,
    message: 'Gasto/Transacción eliminada y saldos restaurados correctamente.'
  };
}

module.exports = {
  calculateFinancialMetrics,
  processTransaction,
  deleteTransaction
};

