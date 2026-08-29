import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, X, Trash2, Settings, Edit3, ShoppingBag, Banknote, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import DocumentScannerModal from '../components/DocumentScannerModal';
import MSIConfigModal from '../components/MSIConfigModal';
import { API_BASE } from '../config';
import { formatMoney } from '../utils/formatters';

const CATEGORIES = [
  'Alimentación', 'Transporte', 'Servicios', 'Entretenimiento',
  'Salud', 'Educación', 'Compras', 'Ropa', 'Tecnología', 'Viajes', 'Otros'
];

export default function DeudasView({ onRefresh, hideValues = false }) {
  const [debts, setDebts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDocScanner, setShowDocScanner] = useState(false);

  // Modal state
  const [msiModalDebt, setMsiModalDebt] = useState(null);
  const [editDebt, setEditDebt] = useState(null);
  const [payDebt, setPayDebt] = useState(null);
  const [expenseDebt, setExpenseDebt] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add Debt form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('credit_card');
  const [newBalance, setNewBalance] = useState('');
  const [newCreditLimit, setNewCreditLimit] = useState('');
  const [newMinPayment, setNewMinPayment] = useState('');
  const [newNoInterest, setNewNoInterest] = useState('');
  const [newInterestRate, setNewInterestRate] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newCutoffDate, setNewCutoffDate] = useState('');

  // Edit form
  const [eName, setEName] = useState('');
  const [eBalance, setEBalance] = useState('');
  const [eCreditLimit, setECreditLimit] = useState('');
  const [eMinPayment, setEMinPayment] = useState('');
  const [eNoInterest, setENoInterest] = useState('');
  const [eRate, setERate] = useState('');
  const [eCutoff, setECutoff] = useState('');
  const [eDue, setEDue] = useState('');

  // Pay form
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');

  // Expense form
  const [expAmount, setExpAmount] = useState('');
  const [expConcept, setExpConcept] = useState('');
  const [expCategory, setExpCategory] = useState('Compras');
  const [expIsMsi, setExpIsMsi] = useState(false);
  const [expMsiMonths, setExpMsiMonths] = useState('12');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().split('T')[0]);

  // MSI quick form
  const [msiConcept, setMsiConcept] = useState('');
  const [msiTotal, setMsiTotal] = useState('');
  const [msiMonthly, setMsiMonthly] = useState('');
  const [msiMonths, setMsiMonths] = useState('12');

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/api/debts`).then(r => r.json()).catch(() => []),
      fetch(`${API_BASE}/api/accounts`).then(r => r.json()).catch(() => [])
    ]).then(([d, a]) => {
      setDebts(Array.isArray(d) ? d : []);
      const liquidAccounts = Array.isArray(a)
        ? a.filter(acc => acc.type !== 'credit_card')
        : [];
      setAccounts(liquidAccounts);
      if (liquidAccounts.length > 0) setPayAccountId(liquidAccounts[0].id);
      setLoading(false);
    });
  };

  useEffect(() => { loadData(); }, []);

  /* ─── Handlers ─── */

  const handleStartEdit = (debt) => {
    setEditDebt(debt);
    setEName(debt.name || '');
    setEBalance(debt.revolving_balance !== undefined ? debt.revolving_balance : (debt.current_balance || 0));
    setECreditLimit(debt.original_amount || '');
    setEMinPayment(debt.min_payment || '');
    setENoInterest(debt.no_interest_payment || '');
    setERate(debt.interest_rate || '');
    setECutoff(debt.cutoff_date || '');
    setEDue(debt.due_date || '');
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editDebt || !eName) return;

    fetch(`${API_BASE}/api/debts/${editDebt.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: eName,
        current_balance: parseFloat(eBalance || 0),
        credit_limit: parseFloat(eCreditLimit || 0),
        min_payment: parseFloat(eMinPayment || 0),
        no_interest_payment: parseFloat(eNoInterest || eBalance || 0),
        cutoff_date: eCutoff || null,
        due_date: eDue || null,
        interest_rate: parseFloat(eRate || 0)
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setEditDebt(null);
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al actualizar: ' + err.message));
  };

  const handleDelete = (debt) => {
    if (!window.confirm(`¿Eliminar "${debt.name}"?\n\nSe eliminarán también sus planes MSI vinculados.`)) return;
    fetch(`${API_BASE}/api/debts/${debt.id}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al eliminar: ' + err.message));
  };

  const handlePay = (e) => {
    e.preventDefault();
    if (!payDebt || !payAmount || !payAccountId) return;

    fetch(`${API_BASE}/api/debts/${payDebt.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: parseInt(payAccountId, 10),
        amount: parseFloat(payAmount)
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setPayDebt(null);
        setPayAmount('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al pagar: ' + err.message));
  };

  const handleExpense = (e) => {
    e.preventDefault();
    if (!expenseDebt || !expAmount || !expConcept) return;

    fetch(`${API_BASE}/api/debts/${expenseDebt.id}/expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseFloat(expAmount),
        concept: expConcept,
        category: expCategory,
        is_msi: expIsMsi,
        msi_months: parseInt(expMsiMonths, 10),
        date: expDate
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setExpenseDebt(null);
        setExpAmount('');
        setExpConcept('');
        setExpIsMsi(false);
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al registrar gasto: ' + err.message));
  };

  const handleCreateDebt = (e) => {
    e.preventDefault();
    if (!newName) return alert('Ingresa un nombre.');

    fetch(`${API_BASE}/api/debts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName,
        type: newType,
        current_balance: parseFloat(newBalance || 0),
        credit_limit: parseFloat(newCreditLimit || 0),
        min_payment: parseFloat(newMinPayment || 0),
        no_interest_payment: parseFloat(newNoInterest || newBalance || 0),
        interest_rate: parseFloat(newInterestRate || 0),
        due_date: newDueDate || null,
        cutoff_date: newCutoffDate || null
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setShowAddModal(false);
        setNewName(''); setNewType('credit_card'); setNewBalance('');
        setNewCreditLimit(''); setNewMinPayment(''); setNewNoInterest('');
        setNewInterestRate(''); setNewDueDate(''); setNewCutoffDate('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al registrar: ' + err.message));
  };

  /* ─── Summary ─── */
  const totalDebt = debts.reduce((s, d) => s + (parseFloat(d.current_balance) || 0), 0);
  const totalNoInterest = debts.reduce((s, d) => s + (parseFloat(d.no_interest_payment) || 0), 0);

  /* ─── Styles helpers ─── */
  const inputStyle = { width: '100%', padding: '0.65rem', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' };
  const modalBackdrop = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' };
  const modalBox = { maxWidth: '520px', width: '100%', maxHeight: '92vh', overflowY: 'auto' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CreditCard size={24} /> Deudas y Tarjetas de Crédito
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Registra gastos, pagos, meses sin intereses y controla tu crédito disponible.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={() => setShowDocScanner(true)}
            className="nav-tab-btn"
            style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#a78bfa', padding: '0.7rem 1.1rem' }}>
            <Sparkles size={16} /> Escanear Estado de Cuenta
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="nav-tab-btn active"
            style={{ background: 'linear-gradient(135deg,#f43f5e,#e11d48)', padding: '0.7rem 1.1rem' }}>
            <Plus size={16} /> Registrar Deuda / Tarjeta
          </button>
        </div>
      </div>

      {showDocScanner && (
        <DocumentScannerModal docType="credit_card" onClose={() => setShowDocScanner(false)}
          onReconciled={() => { loadData(); if (onRefresh) onRefresh(); }} />
      )}

      {/* Summary */}
      <div className="glass-card" style={{ borderLeft: '4px solid #f43f5e', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deuda Total Acumulada</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f43f5e' }}>{formatMoney(totalDebt, hideValues)}</div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Suma de saldos pendientes</span>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pago Total Sin Intereses</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#10b981' }}>{formatMoney(totalNoInterest, hideValues)}</div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Para no generar intereses este mes</span>
        </div>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Cargando tarjetas...</div>
      ) : debts.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <CheckCircle2 size={48} style={{ color: '#34d399', marginBottom: '1rem' }} />
          <p style={{ color: 'var(--text-secondary)' }}>¡No tienes deudas registradas! Usa el botón "+ Registrar" para agregar una.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: '1.25rem' }}>
          {debts.map(debt => {
            const balance = parseFloat(debt.current_balance || 0);
            const minPay = parseFloat(debt.min_payment) || Math.round(balance * 0.05);
            const noInt = parseFloat(debt.no_interest_payment) || balance;
            const creditLimit = parseFloat(debt.original_amount || 0);
            const availCredit = debt.available_credit !== null && debt.available_credit !== undefined
              ? parseFloat(debt.available_credit)
              : (creditLimit > 0 ? Math.max(0, creditLimit - balance) : null);
            const usagePct = creditLimit > 0 ? Math.min(100, Math.round((balance / creditLimit) * 100)) : null;
            const activeMsi = (debt.msi_plans || []).filter(p => (parseInt(p.installments_paid, 10) || 0) < (parseInt(p.installments_total, 10) || 1));

            return (
              <div key={debt.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: `3px solid ${balance > 0 ? '#f43f5e' : '#10b981'}` }}>

                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.1rem' }}>{debt.name}</h3>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {debt.type === 'credit_card' ? '💳 Tarjeta de Crédito' : debt.type === 'payroll_loan' ? '🏦 Préstamo Nómina' : '📋 Préstamo Personal'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    {debt.interest_rate > 0 && (
                      <span style={{ fontSize: '0.72rem', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', borderRadius: '4px', padding: '0.2rem 0.45rem' }}>
                        {debt.interest_rate}% anual
                      </span>
                    )}
                    <button onClick={() => handleStartEdit(debt)} title="Configurar tarjeta"
                      style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#60a5fa', borderRadius: '6px', padding: '0.35rem 0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', fontWeight: '600' }}>
                      <Edit3 size={13} /> Editar
                    </button>
                    <button onClick={() => handleDelete(debt)} title="Eliminar deuda"
                      style={{ background: 'rgba(244,63,94,0.2)', border: '1px solid rgba(244,63,94,0.4)', color: '#f43f5e', borderRadius: '6px', padding: '0.35rem 0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.75rem', fontWeight: '600' }}>
                      <Trash2 size={13} /> Borrar
                    </button>
                  </div>
                </div>

                {/* Balance */}
                <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#fca5a5', fontWeight: '600' }}>Saldo Total Pendiente</span>
                  <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f43f5e', lineHeight: 1.2 }}>
                    {formatMoney(balance, hideValues)}
                  </div>
                  {debt.msi_remaining_total > 0 && (
                    <div style={{ fontSize: '0.72rem', color: '#c4b5fd', marginTop: '0.2rem' }}>
                      Del cual {formatMoney(debt.msi_remaining_total, hideValues)} es a MSI
                      {debt.revolving_balance > 0 ? ` + ${formatMoney(debt.revolving_balance, hideValues)} revolving` : ''}
                    </div>
                  )}
                  {creditLimit > 0 && (
                    <div style={{ marginTop: '0.4rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                        <span>Crédito disponible: {formatMoney(availCredit, hideValues)}</span>
                        <span>{usagePct}% usado</span>
                      </div>
                      <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${usagePct}%`, background: usagePct > 80 ? '#f43f5e' : usagePct > 50 ? '#fbbf24' : '#10b981', borderRadius: '2px', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Payment breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
                  <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', padding: '0.55rem', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.68rem', color: '#fcd34d', fontWeight: '600', display: 'block' }}>Pago Mínimo</span>
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: '#fbbf24' }}>{formatMoney(minPay, hideValues)}</span>
                  </div>
                  <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', padding: '0.55rem', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.68rem', color: '#6ee7b7', fontWeight: '600', display: 'block' }}>
                      {debt.msi_monthly_sum > 0 ? 'Pago Este Mes (sin int.)' : 'Sin Intereses'}
                    </span>
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: '#10b981' }}>{formatMoney(noInt, hideValues)}</span>
                    {debt.msi_monthly_sum > 0 && (
                      <span style={{ fontSize: '0.65rem', color: '#6ee7b7', display: 'block' }}>
                        Mensualidad MSI: {formatMoney(debt.msi_monthly_sum, hideValues)}/mes
                      </span>
                    )}
                  </div>
                </div>


                {/* Dates */}
                {(debt.cutoff_date || debt.due_date) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', fontSize: '0.78rem', background: 'rgba(255,255,255,0.03)', padding: '0.55rem', borderRadius: '6px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.68rem' }}>Fecha de Corte</span>
                      <span style={{ fontWeight: '600' }}>{debt.cutoff_date || '—'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.68rem' }}>Fecha Límite de Pago</span>
                      <span style={{ fontWeight: '600', color: '#f8fafc' }}>{debt.due_date || '—'}</span>
                    </div>
                  </div>
                )}

                {/* Active MSI Plans */}
                {activeMsi.length > 0 && (
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: '600', display: 'block', marginBottom: '0.3rem' }}>
                      Meses Sin Intereses Activos ({activeMsi.length})
                    </span>
                    {activeMsi.map(msi => {
                      const paid = parseInt(msi.installments_paid, 10) || 0;
                      const total = parseInt(msi.installments_total, 10) || 12;
                      const remaining = total - paid;
                      return (
                        <div key={msi.id} style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.78rem', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontWeight: '600' }}>{msi.concept}</span>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem' }}>({remaining} de {total} meses restantes)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: '700', color: '#a78bfa' }}>{formatMoney(msi.monthly_amount, hideValues)}/mes</span>
                            <button onClick={() => {
                              if (!window.confirm(`¿Eliminar plan MSI "${msi.concept}"?`)) return;
                              fetch(`${API_BASE}/api/installment-plans/${msi.id}`, { method: 'DELETE' })
                                .then(() => { loadData(); if (onRefresh) onRefresh(); });
                            }} style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '0.15rem', display: 'flex' }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 'auto' }}>
                  <button onClick={() => { setExpenseDebt(debt); setExpDate(new Date().toISOString().split('T')[0]); }}
                    style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', color: '#fca5a5', borderRadius: '6px', padding: '0.6rem 0.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: '600' }}>
                    <ShoppingBag size={14} /> Gasto
                  </button>
                  <button onClick={() => { setPayDebt(debt); setPayAmount(noInt || balance || ''); }}
                    style={{ background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', color: 'white', borderRadius: '6px', padding: '0.6rem 0.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: '700' }}>
                    <Banknote size={14} /> Pagar
                  </button>
                  <button onClick={() => setMsiModalDebt(debt)}
                    style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: '#c4b5fd', borderRadius: '6px', padding: '0.6rem 0.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontSize: '0.78rem', fontWeight: '600' }}>
                    <Settings size={14} /> MSI
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MSI Config Modal ── */}
      {msiModalDebt && (
        <MSIConfigModal item={msiModalDebt} isDebt={true}
          onClose={() => setMsiModalDebt(null)}
          onSaved={() => { loadData(); if (onRefresh) onRefresh(); }} />
      )}

      {/* ── Add Debt Modal ── */}
      {showAddModal && (
        <div style={modalBackdrop}>
          <div className="glass-card" style={modalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem' }}>➕ Registrar Deuda / Tarjeta</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateDebt} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={labelStyle}>Nombre *</label>
                <input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej. BBVA Azul, Préstamo Banamex" required />
              </div>
              <div>
                <label style={labelStyle}>Tipo *</label>
                <select style={{ ...inputStyle, background: '#121a2b' }} value={newType} onChange={e => setNewType(e.target.value)}>
                  <option value="credit_card">Tarjeta de Crédito</option>
                  <option value="personal_loan">Préstamo Personal</option>
                  <option value="payroll_loan">Préstamo de Nómina</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Saldo Actual ($) *</label>
                  <input style={inputStyle} type="number" value={newBalance} onChange={e => setNewBalance(e.target.value)} placeholder="0.00" step="0.01" required />
                </div>
                {newType === 'credit_card' && (
                  <div>
                    <label style={labelStyle}>Límite de Crédito ($)</label>
                    <input style={inputStyle} type="number" value={newCreditLimit} onChange={e => setNewCreditLimit(e.target.value)} placeholder="Ej. 20000" step="0.01" />
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Pago Mínimo ($)</label>
                  <input style={inputStyle} type="number" value={newMinPayment} onChange={e => setNewMinPayment(e.target.value)} placeholder="Ej. 650" step="0.01" />
                </div>
                <div>
                  <label style={labelStyle}>Pago Sin Intereses ($)</label>
                  <input style={inputStyle} type="number" value={newNoInterest} onChange={e => setNewNoInterest(e.target.value)} placeholder="Ej. 5000" step="0.01" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Tasa de Interés (% anual)</label>
                <input style={inputStyle} type="number" value={newInterestRate} onChange={e => setNewInterestRate(e.target.value)} placeholder="Ej. 42" step="0.1" />
              </div>
              {newType === 'credit_card' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>Fecha de Corte</label>
                    <input style={{ ...inputStyle, background: '#121a2b' }} type="date" value={newCutoffDate} onChange={e => setNewCutoffDate(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Fecha Límite de Pago</label>
                    <input style={{ ...inputStyle, background: '#121a2b' }} type="date" value={newDueDate} onChange={e => setNewDueDate(e.target.value)} />
                  </div>
                </div>
              )}
              <button type="submit" className="nav-tab-btn active"
                style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', background: 'linear-gradient(135deg,#f43f5e,#e11d48)', marginTop: '0.25rem' }}>
                Guardar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Debt Modal ── */}
      {editDebt && (
        <div style={modalBackdrop}>
          <div className="glass-card" style={modalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', color: '#60a5fa' }}>✏️ Configurar: {editDebt.name}</h3>
              <button onClick={() => setEditDebt(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={labelStyle}>Nombre</label>
                <input style={inputStyle} value={eName} onChange={e => setEName(e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Saldo Pendiente ($)</label>
                  <input style={inputStyle} type="number" value={eBalance} onChange={e => setEBalance(e.target.value)} step="0.01" />
                </div>
                <div>
                  <label style={labelStyle}>Límite de Crédito ($)</label>
                  <input style={inputStyle} type="number" value={eCreditLimit} onChange={e => setECreditLimit(e.target.value)} step="0.01" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Pago Mínimo ($)</label>
                  <input style={inputStyle} type="number" value={eMinPayment} onChange={e => setEMinPayment(e.target.value)} step="0.01" />
                </div>
                <div>
                  <label style={labelStyle}>Pago Sin Intereses ($)</label>
                  <input style={inputStyle} type="number" value={eNoInterest} onChange={e => setENoInterest(e.target.value)} step="0.01" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Tasa de Interés (% anual)</label>
                <input style={inputStyle} type="number" value={eRate} onChange={e => setERate(e.target.value)} step="0.1" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Fecha de Corte</label>
                  <input style={{ ...inputStyle, background: '#121a2b' }} type="date" value={eCutoff} onChange={e => setECutoff(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Fecha Límite de Pago</label>
                  <input style={{ ...inputStyle, background: '#121a2b' }} type="date" value={eDue} onChange={e => setEDue(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="nav-tab-btn active"
                style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', marginTop: '0.25rem' }}>
                Guardar Cambios
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Pay Modal ── */}
      {payDebt && (
        <div style={modalBackdrop}>
          <div className="glass-card" style={{ maxWidth: '420px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem' }}>💳 Pagar: {payDebt.name}</h3>
              <button onClick={() => setPayDebt(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handlePay} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={labelStyle}>Cuenta Origen del Pago</label>
                <select style={{ ...inputStyle, background: '#121a2b' }} value={payAccountId} onChange={e => setPayAccountId(e.target.value)}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} (${parseFloat(a.balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })})</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Monto a Pagar ($)</label>
                <input style={inputStyle} type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} step="0.01" required />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setPayAmount(parseFloat(payDebt.min_payment || 0).toFixed(2))}
                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', borderRadius: '4px', cursor: 'pointer' }}>
                    Mínimo {formatMoney(payDebt.min_payment, hideValues)}
                  </button>
                  <button type="button" onClick={() => setPayAmount(parseFloat(payDebt.no_interest_payment || payDebt.current_balance || 0).toFixed(2))}
                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', borderRadius: '4px', cursor: 'pointer' }}>
                    Sin intereses {formatMoney(payDebt.no_interest_payment || payDebt.current_balance, hideValues)}
                  </button>
                </div>
              </div>
              <button type="submit" className="nav-tab-btn active"
                style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                Confirmar Pago
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Expense Modal ── */}
      {expenseDebt && (
        <div style={modalBackdrop}>
          <div className="glass-card" style={{ maxWidth: '460px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem' }}>🛒 Gasto en: {expenseDebt.name}</h3>
              <button onClick={() => setExpenseDebt(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleExpense} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={labelStyle}>Concepto *</label>
                <input style={inputStyle} value={expConcept} onChange={e => setExpConcept(e.target.value)} placeholder="Ej. Despensa Walmart, Netflix" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Monto ($) *</label>
                  <input style={inputStyle} type="number" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="0.00" step="0.01" required />
                </div>
                <div>
                  <label style={labelStyle}>Fecha</label>
                  <input style={{ ...inputStyle, background: '#121a2b' }} type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Categoría</label>
                <select style={{ ...inputStyle, background: '#121a2b' }} value={expCategory} onChange={e => setExpCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* MSI option */}
              <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', padding: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', color: '#c4b5fd' }}>
                  <input type="checkbox" checked={expIsMsi} onChange={e => setExpIsMsi(e.target.checked)} />
                  ¿Es compra a Meses Sin Intereses (MSI)?
                </label>
                {expIsMsi && (
                  <div style={{ marginTop: '0.6rem' }}>
                    <label style={labelStyle}>Número de Meses</label>
                    <select style={{ ...inputStyle, background: '#121a2b' }} value={expMsiMonths} onChange={e => setExpMsiMonths(e.target.value)}>
                      {[3, 6, 9, 12, 18, 24].map(m => <option key={m} value={m}>{m} meses</option>)}
                    </select>
                    {expAmount && expMsiMonths && (
                      <p style={{ fontSize: '0.78rem', color: '#a78bfa', marginTop: '0.35rem' }}>
                        Mensualidad: {formatMoney(parseFloat(expAmount) / parseInt(expMsiMonths, 10), hideValues)}/mes
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button type="submit" className="nav-tab-btn active"
                style={{ width: '100%', justifyContent: 'center', padding: '0.8rem', background: 'linear-gradient(135deg,#f43f5e,#e11d48)' }}>
                Registrar Gasto
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
