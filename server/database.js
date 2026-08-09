const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'mis_finanzas.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error al conectar con SQLite:', err.message);
  } else {
    console.log('Conectado exitosamente a la base de datos SQLite:', DB_PATH);
  }
});

// Helper para promisificar consultas
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

async function initDatabase() {
  console.log('Inicializando tablas de la base de datos...');

  // 1. Accounts
  await dbRun(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bank', 'payroll', 'cash', 'credit_card', 'loan')),
      balance REAL DEFAULT 0,
      available_credit REAL DEFAULT 0,
      credit_limit REAL DEFAULT 0,
      interest_rate REAL DEFAULT 0,
      due_date TEXT,
      cutoff_date TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Transactions
  await dbRun(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'payment', 'transfer', 'investment_deposit', 'investment_withdrawal')),
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      concept TEXT NOT NULL,
      account_id INTEGER,
      source TEXT DEFAULT 'voice',
      status TEXT DEFAULT 'confirmed',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

  // 3. Incomes
  await dbRun(`
    CREATE TABLE IF NOT EXISTS incomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('payroll', 'extraordinary')),
      account_id INTEGER,
      source_document_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

  // 4. Investments
  await dbRun(`
    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invested_amount REAL DEFAULT 0,
      current_documented_value REAL DEFAULT 0,
      risk_level TEXT DEFAULT 'medium' CHECK(risk_level IN ('low', 'medium', 'high')),
      last_update TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 5. Debts/Loans
  await dbRun(`
    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('credit_card', 'personal_loan', 'payroll_loan')),
      original_amount REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      payment_amount REAL DEFAULT 0,
      interest_rate REAL DEFAULT 0,
      due_date TEXT,
      remaining_payments INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. Installment Plans (MSI)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS installment_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER,
      account_id INTEGER,
      concept TEXT NOT NULL,
      total_amount REAL NOT NULL,
      monthly_amount REAL NOT NULL,
      installments_total INTEGER NOT NULL,
      installments_paid INTEGER DEFAULT 0,
      remaining_balance REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 7. Recurring Expenses
  await dbRun(`
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept TEXT NOT NULL,
      category TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly', 'bimonthly', 'yearly')),
      amount REAL DEFAULT 0,
      variable_amount INTEGER DEFAULT 0,
      account_id INTEGER,
      next_due_date TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 8. Documents (Gemini scan registry)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('credit_card', 'payroll', 'receipt', 'image')),
      reference TEXT,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      processing_status TEXT DEFAULT 'pending',
      extracted_data TEXT,
      reconciliation_status TEXT DEFAULT 'none'
    )
  `);

  // 9. Financial Goals
  await dbRun(`
    CREATE TABLE IF NOT EXISTS financial_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_age INTEGER DEFAULT 60,
      target_date TEXT,
      target_amount REAL DEFAULT 5000000,
      status TEXT DEFAULT 'active'
    )
  `);

  // 10. Daily Budget
  await dbRun(`
    CREATE TABLE IF NOT EXISTS daily_budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_amount REAL DEFAULT 200,
      month TEXT NOT NULL, -- YYYY-MM
      rollover_amount REAL DEFAULT 0,
      daily_spent REAL DEFAULT 0,
      last_reset_date TEXT
    )
  `);

  // 11. Financial Health Snapshots
  await dbRun(`
    CREATE TABLE IF NOT EXISTS financial_health_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      score INTEGER NOT NULL,
      components TEXT,
      explanation TEXT
    )
  `);

  // 12. Coach Recommendations
  await dbRun(`
    CREATE TABLE IF NOT EXISTS coach_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      recommendation TEXT NOT NULL,
      rationale TEXT,
      status TEXT DEFAULT 'pending'
    )
  `);

  // 13. Settings (Key-Value Store)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Seed default data if empty
  await seedInitialData();
  console.log('Base de datos inicializada correctamente.');
}

async function seedInitialData() {
  // Seed default accounts if accounts table is empty
  const accountCount = await dbGet('SELECT COUNT(*) as count FROM accounts');
  if (accountCount.count === 0) {
    console.log('Insertando cuentas iniciales...');
    await dbRun(`INSERT INTO accounts (name, type, balance, available_credit, credit_limit) VALUES 
      ('BBVA Nómina', 'payroll', 18500.00, 0, 0),
      ('Efectivo', 'cash', 1200.00, 0, 0),
      ('Banamex Débito', 'bank', 5400.00, 0, 0),
      ('Tarjeta BBVA Gold', 'credit_card', 0.00, 32000.00, 40000.00)
    `);
  }

  // Seed default setting values
  const settingsCount = await dbGet('SELECT COUNT(*) as count FROM settings');
  if (settingsCount.count === 0) {
    console.log('Insertando configuraciones iniciales...');
    await dbRun(`INSERT INTO settings (key, value) VALUES 
      ('user_name', 'Usuario'),
      ('daily_budget_limit', '200'),
      ('gemini_model', 'gemini-2.5-flash'),
      ('gemini_api_key', ''),
      ('financial_freedom_age', '55'),
      ('financial_freedom_target', '10000000')
    `);
  }

  // Seed default goal if none exists
  const goalCount = await dbGet('SELECT COUNT(*) as count FROM financial_goals');
  if (goalCount.count === 0) {
    await dbRun(`INSERT INTO financial_goals (target_age, target_amount, status) VALUES (55, 10000000, 'active')`);
  }
}

module.exports = {
  db,
  dbRun,
  dbAll,
  dbGet,
  initDatabase
};
