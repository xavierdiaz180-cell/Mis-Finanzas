const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const { initDatabase, dbAll, dbGet, dbRun } = require('./database');
const { calculateFinancialMetrics, processTransaction, deleteTransaction } = require('./services/financialRules');

const { parseVoiceDictation, analyzeDocument } = require('./services/geminiService');
const { generateCoachChatResponse, getCoachRecommendations, generateDeepAnalysis } = require('./services/coachService');
const { getFullAnalysisData } = require('./services/analysisService');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const PREDEFINED_CATEGORIES = [
  'Alimentación',
  'Transporte',
  'Servicios',
  'Entretenimiento',
  'Salud',
  'Educación',
  'Compras',
  'Nómina',
  'Ingreso Extraordinario',
  'Otros'
];

initDatabase().catch(err => {
  console.error('Error al inicializar la base de datos:', err);
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbCheck = await dbGet('SELECT 1 as test');
    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      database: dbCheck.test === 1 ? 'connected' : 'error',
      version: '1.0.0'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected', message: error.message });
  }
});

// Settings
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await dbAll('SELECT key, value FROM settings');
    const settingsMap = {};
    rows.forEach(r => { settingsMap[r.key] = r.value; });
    res.json(settingsMap);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settingsMap = req.body;
    for (const [key, value] of Object.entries(settingsMap)) {
      await dbRun(
        `INSERT INTO settings (key, value) VALUES (?, ?) 
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, String(value)]
      );
    }
    res.json({ success: true, message: 'Configuraciones guardadas' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Summary & Financial Metrics
app.get('/api/summary', async (req, res) => {
  try {
    const metrics = await calculateFinancialMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories', (req, res) => {
  res.json(PREDEFINED_CATEGORIES);
});

// Accounts (CARTERA)
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await dbAll('SELECT * FROM accounts WHERE active = 1 ORDER BY id ASC');
    const installmentPlans = await dbAll('SELECT * FROM installment_plans');
    const debts = await dbAll('SELECT * FROM debts');

    const processedAccounts = accounts.map(acc => {
      if (acc.type === 'credit_card') {
        // Find debts matching this account
        const matchingDebts = debts.filter(d => d.name === acc.name || d.name.toLowerCase().includes(acc.name.toLowerCase()) || acc.name.toLowerCase().includes(d.name.toLowerCase()));
        const debtIds = matchingDebts.map(d => d.id);

        // Sum remaining balances of all MSI plans linked to this account or its debts
        const msiPlans = installmentPlans.filter(p => p.account_id === acc.id || debtIds.includes(p.debt_id));
        const msiPending = msiPlans.reduce((sum, p) => sum + (p.remaining_balance || 0), 0);

        const totalDebt = (acc.balance || 0) + msiPending;
        const available = acc.credit_limit > 0 ? Math.max(0, acc.credit_limit - totalDebt) : acc.available_credit;

        return {
          ...acc,
          msi_pending: msiPending,
          total_debt: totalDebt,
          available_credit: available
        };
      }
      return acc;
    });

    res.json(processedAccounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/accounts', async (req, res) => {
  try {
    const { name, type, balance = 0, credit_limit = 0, interest_rate = 0, due_date, cutoff_date } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Nombre y tipo de cuenta son requeridos.' });
    }
    const initialAvailable = type === 'credit_card' ? parseFloat(credit_limit) - parseFloat(balance) : parseFloat(balance);
    
    const result = await dbRun(
      `INSERT INTO accounts (name, type, balance, available_credit, credit_limit, interest_rate, due_date, cutoff_date, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [name, type, parseFloat(balance), initialAvailable, parseFloat(credit_limit), parseFloat(interest_rate), due_date, cutoff_date]
    );

    let debtId = null;
    if (type === 'credit_card') {
      const debtAmount = parseFloat(balance);
      const minPayment = parseFloat(req.body.minimum_payment || debtAmount * 0.05);
      const debtResult = await dbRun(
        `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, interest_rate, due_date)
         VALUES (?, 'credit_card', ?, ?, ?, ?, ?)`,
        [name, debtAmount, debtAmount, minPayment, parseFloat(interest_rate), due_date]
      );
      debtId = debtResult.lastID;
    }

    if (req.body.msi_plans && Array.isArray(req.body.msi_plans)) {
      for (const msi of req.body.msi_plans) {
        if (msi.concept && parseFloat(msi.monthly_amount) > 0) {
          const totalInst = parseInt(msi.installments_total || 12, 10);
          const paidInst = parseInt(msi.installments_paid || 0, 10);
          const remInst = Math.max(0, totalInst - paidInst);
          const monthly = parseFloat(msi.monthly_amount);
          const totalAmt = parseFloat(msi.total_amount || (monthly * totalInst));
          const remBal = monthly * remInst;

          await dbRun(
            `INSERT INTO installment_plans (account_id, debt_id, concept, total_amount, monthly_amount, installments_total, installments_paid, remaining_balance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [result.lastID, debtId, msi.concept, totalAmt, monthly, totalInst, paidInst, remBal]
          );
        }
      }
    }

    res.json({ success: true, account_id: result.lastID, debt_id: debtId, message: 'Cuenta agregada exitosamente.' });


  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/accounts/:id', async (req, res) => {
  try {
    const accountId = req.params.id;
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada.' });

    const currentMonth = new Date().toISOString().substring(0, 7);

    const incRow = await dbAll(
      `SELECT SUM(amount) as total FROM transactions WHERE account_id = ? AND type = 'income' AND date LIKE ?`,
      [accountId, `${currentMonth}%`]
    );
    const monthIncome = incRow[0]?.total || 0;

    const expRow = await dbAll(
      `SELECT SUM(amount) as total FROM transactions WHERE account_id = ? AND type = 'expense' AND date LIKE ?`,
      [accountId, `${currentMonth}%`]
    );
    const monthExpense = expRow[0]?.total || 0;

    const lastTx = await dbGet(
      'SELECT * FROM transactions WHERE account_id = ? ORDER BY date DESC, id DESC LIMIT 1',
      [accountId]
    );

    const history = await dbAll(
      'SELECT * FROM transactions WHERE account_id = ? ORDER BY date DESC, id DESC',
      [accountId]
    );

    res.json({
      account,
      month_income: monthIncome,
      month_expense: monthExpense,
      last_transaction: lastTx || null,
      history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, balance, credit_limit } = req.body;
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [id]);
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada.' });

    const newBalance = balance !== undefined ? parseFloat(balance) : account.balance;
    const newLimit = credit_limit !== undefined ? parseFloat(credit_limit) : account.credit_limit;
    const newAvailable = account.type === 'credit_card' ? newLimit - (account.credit_limit - account.available_credit) : newBalance;

    await dbRun(
      'UPDATE accounts SET name = ?, balance = ?, available_credit = ?, credit_limit = ? WHERE id = ?',
      [name || account.name, newBalance, newAvailable, newLimit, id]
    );
    res.json({ success: true, message: 'Cuenta actualizada.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM transactions WHERE account_id = ?', [id]);
    await dbRun('DELETE FROM accounts WHERE id = ?', [id]);
    res.json({ success: true, message: 'Cuenta y sus transacciones eliminadas.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Transactions (GASTOS & INGRESOS)
app.get('/api/transactions', async (req, res) => {
  try {
    const { type, category, account_id, concept, start_date, end_date } = req.query;
    let sql = 'SELECT t.*, a.name as account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND t.type = ?';
      params.push(type);
    }
    if (category) {
      sql += ' AND t.category = ?';
      params.push(category);
    }
    if (account_id) {
      sql += ' AND t.account_id = ?';
      params.push(account_id);
    }
    if (concept) {
      sql += ' AND t.concept LIKE ?';
      params.push(`%${concept}%`);
    }
    if (start_date) {
      sql += ' AND t.date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND t.date <= ?';
      params.push(end_date);
    }

    sql += ' ORDER BY t.date DESC, t.id DESC';
    const transactions = await dbAll(sql, params);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const result = await processTransaction(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteTransaction(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/incomes', async (req, res) => {
  try {
    const { type, account_id } = req.query;
    let sql = `
      SELECT t.*, a.name as account_name 
      FROM transactions t 
      LEFT JOIN accounts a ON t.account_id = a.id 
      WHERE t.type = 'income'
    `;
    const params = [];

    if (type) {
      sql += ' AND t.category = ?';
      params.push(type);
    }
    if (account_id) {
      sql += ' AND t.account_id = ?';
      params.push(account_id);
    }

    sql += ' ORDER BY t.date DESC, t.id DESC';
    const incomes = await dbAll(sql, params);
    res.json(incomes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// INVERSIONES API
app.get('/api/investments', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM investments ORDER BY id DESC');
    const investments = rows.map(inv => {
      const profitLoss = inv.current_documented_value - inv.invested_amount;
      const profitLossPercentage = inv.invested_amount > 0 ? (profitLoss / inv.invested_amount) * 100 : 0;
      return {
        ...inv,
        profit_loss: profitLoss,
        profit_loss_percentage: profitLossPercentage
      };
    });
    res.json(investments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/investments', async (req, res) => {
  try {
    const { name, invested_amount = 0, current_documented_value = 0, risk_level = 'medium' } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre de la inversión es requerido.' });

    const today = new Date().toISOString().split('T')[0];
    const result = await dbRun(
      `INSERT INTO investments (name, invested_amount, current_documented_value, risk_level, last_update)
       VALUES (?, ?, ?, ?, ?)`,
      [name, parseFloat(invested_amount), parseFloat(current_documented_value || invested_amount), risk_level, today]
    );

    res.json({ success: true, investment_id: result.lastID, message: 'Inversión registrada correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/investments/:id/update-value', async (req, res) => {
  try {
    const { id } = req.params;
    const { current_documented_value } = req.body;
    if (current_documented_value === undefined) {
      return res.status(400).json({ error: 'El valor documentado es requerido.' });
    }

    const today = new Date().toISOString().split('T')[0];
    await dbRun(
      'UPDATE investments SET current_documented_value = ?, last_update = ? WHERE id = ?',
      [parseFloat(current_documented_value), today, id]
    );

    res.json({ success: true, message: 'Valor documentado actualizado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/investments/:id/deposit', async (req, res) => {
  try {
    const { id } = req.params;
    const { account_id, amount } = req.body;

    if (!account_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Cuenta de origen y monto válido son requeridos.' });
    }

    const investment = await dbGet('SELECT * FROM investments WHERE id = ?', [id]);
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [account_id]);

    if (!investment || !account) return res.status(404).json({ error: 'Inversión o cuenta no encontrada.' });

    await dbRun('UPDATE accounts SET balance = balance - ? WHERE id = ?', [parseFloat(amount), account_id]);

    const today = new Date().toISOString().split('T')[0];
    await dbRun(
      `UPDATE investments SET 
        invested_amount = invested_amount + ?, 
        current_documented_value = current_documented_value + ?, 
        last_update = ? 
       WHERE id = ?`,
      [parseFloat(amount), parseFloat(amount), today, id]
    );

    await dbRun(
      `INSERT INTO transactions (date, type, amount, category, concept, account_id, source, status)
       VALUES (?, 'investment_deposit', ?, 'Inversiones', ?, ?, 'manual_confirm', 'confirmed')`,
      [today, parseFloat(amount), `Depósito a inversión: ${investment.name}`, account_id]
    );

    res.json({ success: true, message: 'Depósito a inversión ejecutado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/investments/:id/withdraw', async (req, res) => {
  try {
    const { id } = req.params;
    const { account_id, amount } = req.body;

    if (!account_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Cuenta destino y monto válido son requeridos.' });
    }

    const investment = await dbGet('SELECT * FROM investments WHERE id = ?', [id]);
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [account_id]);

    if (!investment || !account) return res.status(404).json({ error: 'Inversión o cuenta no encontrada.' });

    if (investment.current_documented_value < parseFloat(amount)) {
      return res.status(400).json({ error: 'El monto a retirar supera el valor documentado actual de la inversión.' });
    }

    await dbRun('UPDATE accounts SET balance = balance + ? WHERE id = ?', [parseFloat(amount), account_id]);

    const today = new Date().toISOString().split('T')[0];
    await dbRun(
      `UPDATE investments SET 
        current_documented_value = current_documented_value - ?, 
        last_update = ? 
       WHERE id = ?`,
      [parseFloat(amount), today, id]
    );

    await dbRun(
      `INSERT INTO transactions (date, type, amount, category, concept, account_id, source, status)
       VALUES (?, 'investment_withdrawal', ?, 'Inversiones', ?, ?, 'manual_confirm', 'confirmed')`,
      [today, parseFloat(amount), `Retiro de inversión: ${investment.name}`, account_id]
    );

    res.json({ success: true, message: 'Retiro de inversión completado exitosamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DEUDAS API
app.get('/api/debts', async (req, res) => {
  try {
    const debts = await dbAll('SELECT * FROM debts ORDER BY id DESC');
    const installmentPlans = await dbAll('SELECT * FROM installment_plans');

    const debtsWithMSI = debts.map(debt => {
      const msi = installmentPlans.filter(plan => plan.debt_id === debt.id);
      return {
        ...debt,
        msi_plans: msi
      };
    });

    res.json(debtsWithMSI);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/debts', async (req, res) => {
  try {
    const { 
      name, 
      type, 
      original_amount = 0, 
      current_balance = 0, 
      payment_amount = 0, 
      min_payment = 0,
      no_interest_payment = 0,
      interest_rate = 0, 
      due_date, 
      cutoff_date,
      remaining_payments = 0 
    } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Nombre y tipo de deuda son requeridos.' });

    const finalNoInterestPayment = parseFloat(no_interest_payment || payment_amount || current_balance || 0);
    const finalMinPayment = parseFloat(min_payment || (current_balance ? Math.round(current_balance * 0.05) : 0));

    const result = await dbRun(
      `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, min_payment, no_interest_payment, interest_rate, due_date, cutoff_date, remaining_payments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, 
        type, 
        parseFloat(original_amount), 
        parseFloat(current_balance || original_amount), 
        finalNoInterestPayment,
        finalMinPayment,
        finalNoInterestPayment,
        parseFloat(interest_rate), 
        due_date, 
        cutoff_date,
        parseInt(remaining_payments, 10)
      ]
    );

    res.json({ success: true, debt_id: result.lastID, message: 'Deuda registrada exitosamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/debts/:id/pay', async (req, res) => {
  try {
    const { id } = req.params;
    const { account_id, amount } = req.body;

    if (!account_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Cuenta de origen y monto válido son requeridos.' });
    }

    const debt = await dbGet('SELECT * FROM debts WHERE id = ?', [id]);
    const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [account_id]);

    if (!debt || !account) return res.status(404).json({ error: 'Deuda o cuenta no encontrada.' });

    const newDebtBalance = Math.max(0, debt.current_balance - parseFloat(amount));
    const newRemainingPayments = debt.remaining_payments > 0 ? debt.remaining_payments - 1 : 0;

    await dbRun(
      'UPDATE debts SET current_balance = ?, remaining_payments = ? WHERE id = ?',
      [newDebtBalance, newRemainingPayments, id]
    );

    // Update origin account (e.g. debit account used to pay)
    if (account.type === 'credit_card') {
      await dbRun('UPDATE accounts SET available_credit = available_credit + ? WHERE id = ?', [parseFloat(amount), account_id]);
    } else {
      await dbRun('UPDATE accounts SET balance = balance - ? WHERE id = ?', [parseFloat(amount), account_id]);
    }

    // If debt is a credit card, also update the target credit card account's balance and available_credit
    if (debt.type === 'credit_card') {
      const ccAccount = await dbGet("SELECT * FROM accounts WHERE type = 'credit_card' AND (name LIKE ? OR name LIKE ?)", [debt.name, `%${debt.name}%`]);
      if (ccAccount) {
        await dbRun(
          'UPDATE accounts SET balance = GREATEST(0, balance - ?), available_credit = available_credit + ? WHERE id = ?',
          [parseFloat(amount), parseFloat(amount), ccAccount.id]
        );
      }
    }


    const today = new Date().toISOString().split('T')[0];

    await dbRun(
      `INSERT INTO transactions (date, type, amount, category, concept, account_id, source, status)
       VALUES (?, 'payment', ?, 'Pago de Deuda', ?, ?, 'manual_confirm', 'confirmed')`,
      [today, parseFloat(amount), `Pago a deuda: ${debt.name}`, account_id]
    );

    res.json({ success: true, message: 'Pago a deuda registrado y saldos actualizados.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/debts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const debt = await dbGet('SELECT * FROM debts WHERE id = ?', [id]);
    if (debt) {
      await dbRun('DELETE FROM installment_plans WHERE debt_id = ?', [id]);
      await dbRun("DELETE FROM accounts WHERE name LIKE ? AND type = 'credit_card'", [debt.name]);

      await dbRun('DELETE FROM debts WHERE id = ?', [id]);
    }
    res.json({ success: true, message: 'Deuda y sus planes asociados eliminados correctamente.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/installment-plans', async (req, res) => {
  try {
    const plans = await dbAll('SELECT * FROM installment_plans ORDER BY id DESC');
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/installment-plans/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM installment_plans WHERE id = ?', [id]);
    res.json({ success: true, message: 'Plan a Meses Sin Intereses eliminado.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/installment-plans', async (req, res) => {
  try {
    const { debt_id, account_id, concept, total_amount, monthly_amount, installments_total, installments_paid = 0 } = req.body;
    if (!concept || !total_amount || !monthly_amount || !installments_total) {
      return res.status(400).json({ error: 'Datos requeridos del plan de MSI incompletos.' });
    }

    const remainingBalance = parseFloat(total_amount) - (parseFloat(monthly_amount) * parseInt(installments_paid, 10));

    const result = await dbRun(
      `INSERT INTO installment_plans (debt_id, account_id, concept, total_amount, monthly_amount, installments_total, installments_paid, remaining_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [debt_id || null, account_id || null, concept, parseFloat(total_amount), parseFloat(monthly_amount), parseInt(installments_total, 10), parseInt(installments_paid, 10), Math.max(0, remainingBalance)]
    );

    res.json({ success: true, plan_id: result.lastID, message: 'Plan a Meses Sin Intereses registrado.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FASE 4 IA GEMINI (VOICE & DOCUMENT SCANNER)
app.post('/api/voice/process', async (req, res) => {
  try {
    const { dictation_text } = req.body;
    if (!dictation_text) {
      return res.status(400).json({ error: 'Debes proporcionar un texto dictado.' });
    }

    const accounts = await dbAll('SELECT id, name, type FROM accounts WHERE active = 1');
    const parsed = await parseVoiceDictation(dictation_text, PREDEFINED_CATEGORIES, accounts);

    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/documents/scan', upload.single('file'), async (req, res) => {
  try {
    const { doc_type, reference_name, target_account_id } = req.body;
    const fileBuffer = req.file ? req.file.buffer : null;
    const mimeType = req.file ? req.file.mimetype : 'image/png';

    let existingData = null;
    if (target_account_id) {
      existingData = await dbGet('SELECT * FROM accounts WHERE id = ?', [target_account_id]);
    }

    const analysis = await analyzeDocument(fileBuffer, mimeType, doc_type, reference_name, existingData);

    const result = await dbRun(
      `INSERT INTO documents (type, reference, processing_status, extracted_data, reconciliation_status)
       VALUES (?, ?, ?, ?, ?)`,
      [doc_type, reference_name || 'Documento', 'processed', JSON.stringify(analysis.extractedData), analysis.discrepancy ? 'flagged' : 'none']
    );

    res.json({
      document_id: result.lastID,
      ...analysis
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/documents/reconcile', async (req, res) => {
  try {
    const { document_id, doc_type, account_id, extracted_data } = req.body;
    const today = new Date().toISOString().split('T')[0];

    if (doc_type === 'payroll') {
      const depositAmount = parseFloat(extracted_data.deposit_amount || 0);
      const payrollLoansDeduction = parseFloat(extracted_data.payroll_loans_deduction || 0);

      if (depositAmount > 0 && account_id) {
        await processTransaction({
          date: today,
          type: 'income',
          amount: depositAmount,
          category: 'Nómina',
          concept: `Nómina Escaneada - ${extracted_data.employer || 'Empresa'}`,
          account_id: parseInt(account_id, 10),
          source: 'document'
        });
      }

      if (payrollLoansDeduction > 0) {
        await dbRun(
          `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, interest_rate, due_date)
           VALUES (?, 'payroll_loan', ?, ?, ?, 0, ?)`,
          [`Descuento de Nómina - ${extracted_data.employer || 'Empresa'}`, payrollLoansDeduction * 12, payrollLoansDeduction * 6, payrollLoansDeduction, today]
        );
      }
    } else if (doc_type === 'credit_card' && account_id) {
      const totalBalance = parseFloat(extracted_data.total_balance || 0);
      const availableCredit = parseFloat(extracted_data.available_credit || 0);
      const minPayment = parseFloat(extracted_data.minimum_payment || 0);
      const noInterestPayment = parseFloat(extracted_data.no_interest_payment || extracted_data.payment_for_no_interest || totalBalance || 0);
      const interestRate = parseFloat(extracted_data.interest_rate || 0);
      const dueDate = extracted_data.due_date || null;
      const cutoffDate = extracted_data.cutoff_date || null;

      const account = await dbGet('SELECT * FROM accounts WHERE id = ?', [account_id]);
      if (account) {
        const calculatedLimit = account.credit_limit > 0 ? account.credit_limit : (totalBalance + availableCredit);
        const calculatedAvailable = availableCredit > 0 ? availableCredit : Math.max(0, calculatedLimit - totalBalance);

        await dbRun(
          `UPDATE accounts SET 
            balance = ?, 
            available_credit = ?, 
            credit_limit = ?, 
            interest_rate = ?, 
            due_date = ?, 
            cutoff_date = ?,
            min_payment = ?,
            no_interest_payment = ?
           WHERE id = ?`,
          [totalBalance, calculatedAvailable, calculatedLimit, interestRate, dueDate, cutoffDate, minPayment, noInterestPayment, account_id]
        );

        // Upsert Debt entry corresponding to this Credit Card
        const existingDebt = await dbGet('SELECT * FROM debts WHERE name LIKE ? OR name LIKE ? OR id = ?', [account.name, `%${account.name}%`, account_id]);
        let debtId;
        if (existingDebt) {
          debtId = existingDebt.id;
          await dbRun(
            `UPDATE debts SET 
              original_amount = CASE WHEN original_amount = 0 THEN ? ELSE original_amount END,
              current_balance = ?, 
              payment_amount = ?, 
              min_payment = ?,
              no_interest_payment = ?,
              interest_rate = ?, 
              due_date = ?,
              cutoff_date = ?
             WHERE id = ?`,
            [totalBalance, totalBalance, noInterestPayment, minPayment, noInterestPayment, interestRate, dueDate, cutoffDate, existingDebt.id]
          );
        } else {
          const debtRes = await dbRun(
            `INSERT INTO debts (name, type, original_amount, current_balance, payment_amount, min_payment, no_interest_payment, interest_rate, due_date, cutoff_date)
             VALUES (?, 'credit_card', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [account.name, totalBalance, totalBalance, noInterestPayment, minPayment, noInterestPayment, interestRate, dueDate, cutoffDate]
          );
          debtId = debtRes.lastID;
        }

        // Process MSI plans attached to debt & account
        if (extracted_data.msi_plans && Array.isArray(extracted_data.msi_plans)) {
          for (const msi of extracted_data.msi_plans) {
            await dbRun(
              `INSERT INTO installment_plans (account_id, debt_id, concept, total_amount, monthly_amount, installments_total, installments_paid, remaining_balance)
               VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
              [account_id, debtId, msi.concept, msi.monthly_amount * (msi.remaining_installments || 6), msi.monthly_amount, msi.remaining_installments || 6, msi.monthly_amount * (msi.remaining_installments || 6)]
            );
          }
        }
      }
    }


    if (document_id) {
      await dbRun("UPDATE documents SET reconciliation_status = 'reconciled' WHERE id = ?", [document_id]);
    }

    res.json({ success: true, message: 'Documento reconciliado e información financiera actualizada.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// FASE 5 COACH FINANCIERO & METAS
app.get('/api/goals', async (req, res) => {
  try {
    const goal = await dbGet('SELECT * FROM financial_goals LIMIT 1');
    res.json(goal || { target_age: 55, target_amount: 10000000 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/goals', async (req, res) => {
  try {
    const { target_age, target_amount } = req.body;
    await dbRun('DELETE FROM financial_goals');
    await dbRun(
      'INSERT INTO financial_goals (target_age, target_amount, status) VALUES (?, ?, "active")',
      [parseInt(target_age, 10), parseFloat(target_amount)]
    );
    res.json({ success: true, message: 'Meta de libertad financiera actualizada.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/coach/recommendations', async (req, res) => {
  try {
    const recs = await getCoachRecommendations();
    res.json(recs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/coach/chat', async (req, res) => {
  try {
    const { message, chat_history } = req.body;
    if (!message) return res.status(400).json({ error: 'El mensaje es requerido.' });

    const response = await generateCoachChatResponse(message, chat_history || []);
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// =======================================================
// FASE 6 — ANÁLISIS, PROYECCIONES & GASTOS RECURRENTES
// =======================================================

// 1. Full Analysis Endpoint (Charts data, categories breakdown, MoM, 30-day forecast)
app.get('/api/analysis', async (req, res) => {
  try {
    const analysis = await getFullAnalysisData();
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1b. Deep AI Analysis Endpoint (Powered by Gemini)
app.post('/api/analysis/deep', async (req, res) => {
  try {
    const deepAnalysis = await generateDeepAnalysis();
    res.json(deepAnalysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// 2. Recurring Expenses CRUD (Gastos Recurrentes)
app.get('/api/recurring', async (req, res) => {
  try {
    const rows = await dbAll('SELECT r.*, a.name as account_name FROM recurring_expenses r LEFT JOIN accounts a ON r.account_id = a.id WHERE r.active = 1 ORDER BY r.id DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/recurring', async (req, res) => {
  try {
    const { concept, category, frequency, amount, variable_amount = 0, account_id, next_due_date } = req.body;
    if (!concept || !category || !frequency || amount === undefined) {
      return res.status(400).json({ error: 'Concepto, categoría, frecuencia y monto son requeridos.' });
    }

    const result = await dbRun(
      `INSERT INTO recurring_expenses (concept, category, frequency, amount, variable_amount, account_id, next_due_date, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [concept, category, frequency, parseFloat(amount), variable_amount ? 1 : 0, account_id || null, next_due_date || null]
    );

    res.json({ success: true, recurring_id: result.lastID, message: 'Gasto recurrente registrado.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/recurring/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun('UPDATE recurring_expenses SET active = 0 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Gasto recurrente eliminado.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset all data (borrar datos de prueba)
app.post('/api/reset', async (req, res) => {
  try {
    await dbRun('DELETE FROM transactions');
    await dbRun('DELETE FROM accounts');
    await dbRun('DELETE FROM investments');
    await dbRun('DELETE FROM debts');
    await dbRun('DELETE FROM debt_payments');
    await dbRun('DELETE FROM recurring_expenses');
    res.json({ success: true, message: 'Todos los datos han sido eliminados. Puedes empezar de cero.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});
