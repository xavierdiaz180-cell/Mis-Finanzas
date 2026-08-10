const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
function convertPlaceholders(sql) {
  let counter = 0;
  return sql.replace(/\?/g, () => `$${++counter}`);
}

// Helper: run a query (INSERT/UPDATE/DELETE), returns { lastID, changes }
const dbRun = async (sql, params = []) => {
  const converted = convertPlaceholders(sql);
  const trimmed = converted.trim().toUpperCase();
  
  // For INSERTs, append RETURNING id to capture the new row's ID
  const isInsert = trimmed.startsWith('INSERT');
  // Only append RETURNING id if not already present
  const finalSql = isInsert && !trimmed.includes('RETURNING') 
    ? converted + ' RETURNING id' 
    : converted;

  const result = await pool.query(finalSql, params);
  return {
    lastID: result.rows[0]?.id || null,
    changes: result.rowCount
  };
};

// Helper: get all rows
const dbAll = async (sql, params = []) => {
  const converted = convertPlaceholders(sql);
  const result = await pool.query(converted, params);
  // Normalize count(*) result for PostgreSQL (returns 'count' as string)
  return result.rows.map(row => {
    if (row.count !== undefined) row.count = parseInt(row.count, 10);
    return row;
  });
};

// Helper: get single row
const dbGet = async (sql, params = []) => {
  const converted = convertPlaceholders(sql);
  const result = await pool.query(converted, params);
  const row = result.rows[0] || null;
  if (row && row.count !== undefined) row.count = parseInt(row.count, 10);
  return row;
};

async function initDatabase() {
  console.log('Inicializando tablas en PostgreSQL (Supabase)...');

  // 1. Accounts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bank', 'payroll', 'cash', 'credit_card', 'loan')),
      balance REAL DEFAULT 0,
      available_credit REAL DEFAULT 0,
      credit_limit REAL DEFAULT 0,
      interest_rate REAL DEFAULT 0,
      due_date TEXT,
      cutoff_date TEXT,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Transactions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'payment', 'transfer', 'investment_deposit', 'investment_withdrawal')),
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      concept TEXT NOT NULL,
      account_id INTEGER,
      source TEXT DEFAULT 'voice',
      status TEXT DEFAULT 'confirmed',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

  // 3. Incomes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incomes (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('payroll', 'extraordinary')),
      account_id INTEGER,
      source_document_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    )
  `);

  // 4. Investments
  await pool.query(`
    CREATE TABLE IF NOT EXISTS investments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      invested_amount REAL DEFAULT 0,
      current_documented_value REAL DEFAULT 0,
      risk_level TEXT DEFAULT 'medium' CHECK(risk_level IN ('low', 'medium', 'high')),
      last_update TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 5. Debts/Loans
  await pool.query(`
    CREATE TABLE IF NOT EXISTS debts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('credit_card', 'personal_loan', 'payroll_loan')),
      original_amount REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      payment_amount REAL DEFAULT 0,
      interest_rate REAL DEFAULT 0,
      due_date TEXT,
      remaining_payments INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. Installment Plans (MSI)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS installment_plans (
      id SERIAL PRIMARY KEY,
      debt_id INTEGER,
      account_id INTEGER,
      concept TEXT NOT NULL,
      total_amount REAL NOT NULL,
      monthly_amount REAL NOT NULL,
      installments_total INTEGER NOT NULL,
      installments_paid INTEGER DEFAULT 0,
      remaining_balance REAL NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 7. Recurring Expenses
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id SERIAL PRIMARY KEY,
      concept TEXT NOT NULL,
      category TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('weekly', 'biweekly', 'monthly', 'bimonthly', 'yearly')),
      amount REAL DEFAULT 0,
      variable_amount INTEGER DEFAULT 0,
      account_id INTEGER,
      next_due_date TEXT,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 8. Documents (Gemini scan registry)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('credit_card', 'payroll', 'receipt', 'image')),
      reference TEXT,
      upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processing_status TEXT DEFAULT 'pending',
      extracted_data TEXT,
      reconciliation_status TEXT DEFAULT 'none'
    )
  `);

  // 9. Financial Goals
  await pool.query(`
    CREATE TABLE IF NOT EXISTS financial_goals (
      id SERIAL PRIMARY KEY,
      target_age INTEGER DEFAULT 60,
      target_date TEXT,
      target_amount REAL DEFAULT 5000000,
      status TEXT DEFAULT 'active'
    )
  `);

  // 10. Daily Budget
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_budget (
      id SERIAL PRIMARY KEY,
      base_amount REAL DEFAULT 200,
      month TEXT NOT NULL,
      rollover_amount REAL DEFAULT 0,
      daily_spent REAL DEFAULT 0,
      last_reset_date TEXT
    )
  `);

  // 11. Financial Health Snapshots
  await pool.query(`
    CREATE TABLE IF NOT EXISTS financial_health_snapshots (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      score INTEGER NOT NULL,
      components TEXT,
      explanation TEXT
    )
  `);

  // 12. Coach Recommendations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_recommendations (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      recommendation TEXT NOT NULL,
      rationale TEXT,
      status TEXT DEFAULT 'pending'
    )
  `);

  // 13. Settings (Key-Value Store)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Debt payments log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS debt_payments (
      id SERIAL PRIMARY KEY,
      debt_id INTEGER,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      account_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default data only if tables are empty
  await seedInitialData();
  console.log('Base de datos PostgreSQL inicializada correctamente.');
}

async function seedInitialData() {
  const accountCount = await dbGet('SELECT COUNT(*) as count FROM accounts');
  if (accountCount.count === 0) {
    console.log('Sin cuentas previas — base de datos lista para usar.');
    // Do NOT insert fake data. User will add their own accounts.
  }

  const settingsCount = await dbGet('SELECT COUNT(*) as count FROM settings');
  if (settingsCount.count === 0) {
    console.log('Insertando configuraciones iniciales...');
    await pool.query(`
      INSERT INTO settings (key, value) VALUES 
        ('user_name', 'Usuario'),
        ('daily_budget_limit', '200'),
        ('gemini_model', 'gemini-3.6-flash'),
        ('gemini_api_key', ''),
        ('financial_freedom_age', '55'),
        ('financial_freedom_target', '10000000')
      ON CONFLICT (key) DO NOTHING
    `);
  }

  const goalCount = await dbGet('SELECT COUNT(*) as count FROM financial_goals');
  if (goalCount.count === 0) {
    await pool.query(`INSERT INTO financial_goals (target_age, target_amount, status) VALUES (55, 10000000, 'active')`);
  }
}

module.exports = {
  pool,
  dbRun,
  dbAll,
  dbGet,
  initDatabase
};
