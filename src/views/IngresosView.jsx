import React, { useState, useEffect } from 'react';
import { TrendingUp, Mic, Filter, Plus, FileText, CheckCircle2, Sparkles } from 'lucide-react';
import DocumentScannerModal from '../components/DocumentScannerModal';
import { API_BASE } from '../config';

export default function IngresosView({ onRefresh }) {
  const [incomes, setIncomes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showDocScanner, setShowDocScanner] = useState(false);

  // Form State
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [incomeType, setIncomeType] = useState('payroll');
  const [accountId, setAccountId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Filters
  const [filterAccount, setFilterAccount] = useState('');

  const loadData = () => {
    let url = `${API_BASE}/api/incomes`;
    if (filterAccount) url += `?account_id=${filterAccount}`;

    fetch(url)
      .then(res => res.json())
      .then(data => setIncomes(data))
      .catch(err => console.error('Error al cargar ingresos:', err));
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/accounts`)
      .then(res => res.json())
      .then(data => {
        setAccounts(data);
        if (data.length > 0) {
          // Default to first payroll account if available
          const payrollAcc = data.find(a => a.type === 'payroll') || data[0];
          setAccountId(payrollAcc.id);
        }
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [filterAccount]);

  const handleAddIncome = (e) => {
    e.preventDefault();
    if (!amount || amount <= 0) return alert('Por favor ingresa un monto válido.');
    if (!concept) return alert('Por favor ingresa un concepto.');
    if (!accountId) return alert('Por favor selecciona una cuenta.');

    const categoryName = incomeType === 'payroll' ? 'Nómina' : 'Ingreso Extraordinario';

    fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date().toISOString().split('T')[0],
        type: 'income',
        amount: parseFloat(amount),
        category: categoryName,
        concept: concept,
        account_id: parseInt(accountId, 10),
        source: 'manual_confirm'
      })
    })
      .then(res => res.json())
      .then(() => {
        setShowAddModal(false);
        setAmount('');
        setConcept('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al guardar ingreso: ' + err.message));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header & Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={24} /> Registro e Historial de Ingresos
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Registra tu nómina e ingresos extraordinarios por voz o formulario.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={() => setShowDocScanner(true)}
            className="nav-tab-btn"
            style={{ background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#a78bfa', padding: '0.75rem 1.25rem' }}
          >
            <Sparkles size={18} /> Escanear Nómina con Gemini
          </button>

          <button 
            onClick={() => setShowAddModal(true)}
            className="nav-tab-btn active"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '0.75rem 1.25rem' }}
          >
            <Plus size={18} /> Registrar Ingreso
          </button>
        </div>
      </div>

      {showDocScanner && (
        <DocumentScannerModal 
          docType="payroll" 
          onClose={() => setShowDocScanner(false)} 
          onReconciled={() => { loadData(); if (onRefresh) onRefresh(); }} 
        />
      )}

      {/* Filter Bar */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} /> Filtros de Ingresos
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <select 
            value={filterAccount} 
            onChange={e => setFilterAccount(e.target.value)}
            style={{ padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}
          >
            <option value="">Todas las Cuentas</option>
            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
          </select>
        </div>
      </div>

      {/* Income List */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Historial de Ingresos Registrados</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {incomes.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
              No se encontraron ingresos registrados.
            </div>
          ) : (
            incomes.map(inc => (
              <div 
                key={inc.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem 1.1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: '600' }}>{inc.concept}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', marginTop: '0.2rem' }}>
                    <span>{inc.date}</span>
                    <span>• {inc.category}</span>
                    <span>• {inc.account_name || 'Cuenta'}</span>
                  </div>
                </div>

                <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#34d399' }}>
                  +${inc.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Income Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="glass-card" style={{ maxWidth: '480px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem' }}>+ Registrar Ingreso</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAddIncome} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Monto del Ingreso ($):
                </label>
                <input 
                  type="number" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Ej. 15000.00"
                  step="0.01"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Tipo de Ingreso:
                </label>
                <select 
                  value={incomeType} 
                  onChange={e => setIncomeType(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}
                >
                  <option value="payroll">Nómina Quincenal/Mensual</option>
                  <option value="extraordinary">Ingreso Extraordinario / Bonos</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Concepto:
                </label>
                <input 
                  type="text" 
                  value={concept} 
                  onChange={e => setConcept(e.target.value)}
                  placeholder="Ej. Depósito Nómina 1a Quincena"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Cuenta Destino:
                </label>
                <select 
                  value={accountId} 
                  onChange={e => setAccountId(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}
                >
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>)}
                </select>
              </div>

              <button 
                type="submit"
                className="nav-tab-btn active"
                style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.75rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
              >
                Guardar e Incrementar Saldo
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
