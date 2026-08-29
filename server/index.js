const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const { initDatabase, dbAll, dbGet, dbRun } = require('./database');

// Domain Controllers
const accountController = require('./controllers/accountController');
const transactionController = require('./controllers/transactionController');
const creditCardController = require('./controllers/creditCardController');
const investmentController = require('./controllers/investmentController');
const budgetController = require('./controllers/budgetController');
const financialController = require('./controllers/financialController');

// Auxiliary Services
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
      version: '2.0.0'
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
app.get('/api/summary', financialController.getSummaryMetrics);
app.get('/api/metrics', financialController.getSummaryMetrics);

app.get('/api/categories', (req, res) => {
  res.json(PREDEFINED_CATEGORIES);
});

// Accounts (CARTERA)
app.get('/api/accounts', accountController.getAccounts);
app.post('/api/accounts', accountController.createAccount);
app.get('/api/accounts/:id', accountController.getAccountById);
app.put('/api/accounts/:id', accountController.updateAccount);
app.delete('/api/accounts/:id', accountController.deleteAccount);

// Transactions (MOVIMIENTOS)
app.get('/api/transactions', transactionController.getTransactions);
app.post('/api/transactions', transactionController.createTransaction);
app.delete('/api/transactions/:id', transactionController.removeTransaction);
app.get('/api/incomes', transactionController.getIncomes);

// Daily Budget (PRESUPUESTO DIARIO 24H)
app.get('/api/daily-budget', budgetController.getBudget);
app.post('/api/daily-budget', budgetController.updateBudgetConfig);

// Credit Cards & Debts (TARJETAS Y DEUDAS)
app.get('/api/debts', creditCardController.getDebts);
app.post('/api/debts', creditCardController.createDebt);
app.put('/api/debts/:id', creditCardController.updateDebt);
app.post('/api/debts/:id/pay', creditCardController.payDebt);
app.delete('/api/debts/:id', creditCardController.deleteDebt);

// Installment Plans (MSI)
app.get('/api/installment-plans', creditCardController.getInstallmentPlans);
app.post('/api/installment-plans', creditCardController.createInstallmentPlan);
app.delete('/api/installment-plans/:id', creditCardController.deleteInstallmentPlan);

// Investments (INVERSIONES)
app.get('/api/investments', investmentController.getInvestments);
app.post('/api/investments', investmentController.createInvestment);
app.post('/api/investments/:id/update-value', investmentController.updateInvestmentValue);
app.post('/api/investments/:id/deposit', investmentController.depositToInvestment);
app.post('/api/investments/:id/withdraw', investmentController.withdrawFromInvestment);
app.delete('/api/investments/:id', investmentController.deleteInvestment);

// CHARTS DATA API
app.get('/api/charts/data', async (req, res) => {
  try {
    const investments = await dbAll('SELECT * FROM investments ORDER BY last_update ASC');

    const expensesByCategory = await dbAll(`
      SELECT category, SUM(amount) as total, COUNT(*) as count
      FROM transactions
      WHERE type = 'expense'
        AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM-DD')
      GROUP BY category
      ORDER BY total DESC
    `);

    const monthlyFlow = await dbAll(`
      SELECT 
        LEFT(date, 7) as month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as net
      FROM transactions
      WHERE type IN ('income','expense')
        AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '12 months', 'YYYY-MM-DD')
      GROUP BY LEFT(date, 7)
      ORDER BY month ASC
    `);

    const dailyTransactions = await dbAll(`
      SELECT 
        date,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
      FROM transactions
      WHERE type IN ('income','expense')
        AND date >= TO_CHAR(CURRENT_DATE - INTERVAL '90 days', 'YYYY-MM-DD')
      GROUP BY date
      ORDER BY date ASC
    `);

    let cumulativeBalance = 0;
    const balanceTimeline = dailyTransactions.map(day => {
      cumulativeBalance += (parseFloat(day.income) || 0) - (parseFloat(day.expenses) || 0);
      return {
        date: day.date,
        balance: parseFloat(cumulativeBalance.toFixed(2)),
        income: parseFloat(day.income) || 0,
        expenses: parseFloat(day.expenses) || 0
      };
    });

    const investmentTimeline = investments.map(inv => ({
      name: inv.name,
      invested: parseFloat(inv.capital_contributed || inv.invested_amount || 0),
      current: parseFloat(inv.current_value || inv.current_documented_value || 0),
      gainLoss: (parseFloat(inv.current_value || inv.current_documented_value || 0)) - (parseFloat(inv.capital_contributed || inv.invested_amount || 0)),
      returnPct: inv.invested_amount > 0
        ? parseFloat((((inv.current_documented_value - inv.invested_amount) / inv.invested_amount) * 100).toFixed(2))
        : 0,
      lastUpdate: inv.last_update || 'Sin actualizar',
      riskLevel: inv.risk_level
    }));

    const totalInvested = investmentTimeline.reduce((s, i) => s + i.invested, 0);
    const totalCurrentValue = investmentTimeline.reduce((s, i) => s + i.current, 0);
    const totalReturn = totalCurrentValue - totalInvested;
    const totalReturnPct = totalInvested > 0 ? ((totalReturn / totalInvested) * 100).toFixed(2) : 0;

    res.json({
      investmentTimeline,
      investmentSummary: { totalInvested, totalCurrentValue, totalReturn, totalReturnPct: parseFloat(totalReturnPct) },
      expensesByCategory,
      monthlyFlow,
      balanceTimeline
    });
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

// FASE 6 — ANÁLISIS, PROYECCIONES & GASTOS RECURRENTES
app.get('/api/analysis', async (req, res) => {
  try {
    const analysis = await getFullAnalysisData();
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analysis/deep', async (req, res) => {
  try {
    const deepAnalysis = await generateDeepAnalysis();
    res.json(deepAnalysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

app.listen(PORT, () => {
  console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});
