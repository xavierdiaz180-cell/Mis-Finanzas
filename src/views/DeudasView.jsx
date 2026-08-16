import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, DollarSign, Calendar, Percent, AlertTriangle, CheckCircle2, X, Sparkles, Trash2, Settings, Edit3 } from 'lucide-react';
import DocumentScannerModal from '../components/DocumentScannerModal';
import MSIConfigModal from '../components/MSIConfigModal';
import { API_BASE } from '../config';
import { formatMoney } from '../utils/formatters';

export default function DeudasView({ onRefresh, hideValues = false }) {
  const [debts, setDebts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showDocScanner, setShowDocScanner] = useState(false);

  // Modals
  const [showAddDebtModal, setShowAddDebtModal] = useState(false);
  const [showAddMSIModal, setShowAddMSIModal] = useState(false);
  const [msiModalDebt, setMsiModalDebt] = useState(null);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);

  // Form New Debt
  const [name, setName] = useState('');
  const [type, setType] = useState('credit_card');
  const [originalAmount, setOriginalAmount] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [minPayment, setMinPayment] = useState('');
  const [noInterestPayment, setNoInterestPayment] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [cutoffDate, setCutoffDate] = useState('');
  const [remainingPayments, setRemainingPayments] = useState('');

  // Form Payment
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState('');

  // Form MSI
  const [msiConcept, setMsiConcept] = useState('');
  const [msiTotal, setMsiTotal] = useState('');
  const [msiMonthly, setMsiMonthly] = useState('');
  const [msiInstallmentsTotal, setMsiInstallmentsTotal] = useState('');

  // Form Edit Debt
  const [editDebtItem, setEditDebtItem] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCurrentBalance, setEditCurrentBalance] = useState('');
  const [editMinPayment, setEditMinPayment] = useState('');
  const [editNoInterestPayment, setEditNoInterestPayment] = useState('');
  const [editCutoffDate, setEditCutoffDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editInterestRate, setEditInterestRate] = useState('');

  const handleStartEditDebt = (debt) => {
    setEditDebtItem(debt);
    setEditName(debt.name);
    setEditCurrentBalance(debt.current_balance || '');
    setEditMinPayment(debt.min_payment || '');
    setEditNoInterestPayment(debt.no_interest_payment || '');
    setEditCutoffDate(debt.cutoff_date || '');
    setEditDueDate(debt.due_date || '');
    setEditInterestRate(debt.interest_rate || '');
  };

  const handleUpdateDebt = (e) => {
    e.preventDefault();
    if (!editDebtItem || !editName) return;

    fetch(`${API_BASE}/api/debts/${editDebtItem.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        current_balance: parseFloat(editCurrentBalance || 0),
        min_payment: parseFloat(editMinPayment || 0),
        no_interest_payment: parseFloat(editNoInterestPayment || editCurrentBalance || 0),
        cutoff_date: editCutoffDate,
        due_date: editDueDate,
        interest_rate: parseFloat(editInterestRate || 0)
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setEditDebtItem(null);
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al actualizar tarjeta / deuda: ' + err.message));
  };

  const loadData = () => {
    fetch(`${API_BASE}/api/debts`)
      .then(res => res.json())
      .then(data => setDebts(data))
      .catch(err => console.error('Error al cargar deudas:', err));

    fetch(`${API_BASE}/api/accounts`)
      .then(res => res.json())
      .then(data => {
        setAccounts(data);
        if (data.length > 0) setPayAccountId(data[0].id);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteDebt = (id, debtName, currentBalance) => {
    if (!window.confirm(`¿Eliminar la deuda "${debtName}" por $${currentBalance.toLocaleString('es-MX')}?\n\nEsta acción eliminará el registro de la deuda y removerá las tarjetas o planes MSI vinculados.`)) return;

    fetch(`${API_BASE}/api/debts/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al eliminar deuda: ' + err.message));
  };

  const handleDeleteMSIPlan = (planId, concept) => {
    if (!window.confirm(`¿Eliminar el plan a MSI "${concept}"?`)) return;

    fetch(`${API_BASE}/api/installment-plans/${planId}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al eliminar plan MSI: ' + err.message));
  };

  const handleCreateDebt = (e) => {
    e.preventDefault();
    if (!name) return alert('Ingresa un nombre para la deuda.');

    fetch(`${API_BASE}/api/debts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type,
        original_amount: parseFloat(originalAmount || 0),
        current_balance: parseFloat(currentBalance || originalAmount || 0),
        payment_amount: parseFloat(paymentAmount || noInterestPayment || 0),
        min_payment: parseFloat(minPayment || 0),
        no_interest_payment: parseFloat(noInterestPayment || paymentAmount || 0),
        interest_rate: parseFloat(interestRate || 0),
        due_date: dueDate,
        cutoff_date: cutoffDate,
        remaining_payments: parseInt(remainingPayments || 0, 10)
      })
    })
      .then(res => res.json())
      .then(() => {
        setShowAddDebtModal(false);
        setName('');
        setOriginalAmount('');
        setCurrentBalance('');
        setPaymentAmount('');
        setMinPayment('');
        setNoInterestPayment('');
        setInterestRate('');
        setDueDate('');
        setCutoffDate('');
        setRemainingPayments('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al registrar deuda: ' + err.message));
  };

  const handlePayDebt = (e) => {
    e.preventDefault();
    if (!selectedDebt || !payAmount || !payAccountId) return;

    fetch(`${API_BASE}/api/debts/${selectedDebt.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: parseInt(payAccountId, 10),
        amount: parseFloat(payAmount)
      })
    })
      .then(res => res.json())
      .then(() => {
        setSelectedDebt(null);
        setShowPayModal(false);
        setPayAmount('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al abonar a la deuda: ' + err.message));
  };

  const handleCreateMSI = (e) => {
    e.preventDefault();
    if (!selectedDebt || !msiConcept || !msiTotal) return;

    fetch(`${API_BASE}/api/installment-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        debt_id: selectedDebt.id,
        concept: msiConcept,
        total_amount: parseFloat(msiTotal),
        monthly_amount: parseFloat(msiMonthly || (parseFloat(msiTotal) / parseInt(msiInstallmentsTotal, 10))),
        installments_total: parseInt(msiInstallmentsTotal, 10)
      })
    })
      .then(res => res.json())
      .then(() => {
        setShowAddMSIModal(false);
        setSelectedDebt(null);
        setMsiConcept('');
        setMsiTotal('');
        setMsiMonthly('');
        setMsiInstallmentsTotal('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al agregar MSI: ' + err.message));
  };

  const totalDebtBalance = debts.reduce((acc, d) => acc + (parseFloat(d.current_balance) || 0), 0);
  const totalNoInterestCommitment = debts.reduce((acc, d) => acc + (parseFloat(d.no_interest_payment || d.payment_amount) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CreditCard size={24} /> Deudas y Tarjetas de Crédito
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Control de saldo pendiente, pago mínimo, pago para no generar intereses y fechas de corte/pago.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={() => setShowDocScanner(true)}
            className="nav-tab-btn"
            style={{ background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#a78bfa', padding: '0.75rem 1.25rem' }}
          >
            <Sparkles size={18} /> Escanear Estado de Cuenta (Gemini)
          </button>

          <button 
            onClick={() => setShowAddDebtModal(true)}
            className="nav-tab-btn active"
            style={{ background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', padding: '0.75rem 1.25rem' }}
          >
            <Plus size={18} /> Registrar Deuda / Tarjeta
          </button>
        </div>
      </div>

      {showDocScanner && (
        <DocumentScannerModal 
          docType="credit_card" 
          onClose={() => setShowDocScanner(false)} 
          onReconciled={() => { loadData(); if (onRefresh) onRefresh(); }} 
        />
      )}

      {/* Summary Header Card */}
      <div className="glass-card" style={{ borderLeft: '4px solid #f43f5e', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        <div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>DEUDA TOTAL ACUMULADA</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f43f5e' }}>
            {formatMoney(totalDebtBalance, hideValues)}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Suma total de saldos pendientes</span>
        </div>

        <div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PAGO TOTAL PARA NO GENERAR INTERESES</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#10b981' }}>
            {formatMoney(totalNoInterestCommitment, hideValues)}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Compromiso mensual acumulado</span>
        </div>
      </div>

      {/* Debt Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {debts.length === 0 ? (
          <div className="glass-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
            <CheckCircle2 size={48} style={{ color: '#34d399', marginBottom: '1rem' }} />
            <p style={{ color: 'var(--text-secondary)' }}>¡Excelente! No tienes deudas o préstamos pendientes registrados.</p>
          </div>
        ) : (
          debts.map(debt => {
            const minPayVal = parseFloat(debt.min_payment) || Math.round((parseFloat(debt.current_balance) || 0) * 0.05);
            const noIntPayVal = parseFloat(debt.no_interest_payment || debt.payment_amount) || 0;

            return (
              <div key={debt.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', borderTop: '3px solid #f43f5e' }}>
                <div>
                  {/* Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: '600' }}>{debt.name}</h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {debt.type === 'credit_card' ? 'Tarjeta de Crédito' : debt.type === 'payroll_loan' ? 'Préstamo de Nómina' : 'Préstamo Personal'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="badge badge-warning">
                        Tasa: {debt.interest_rate || 0}%
                      </span>
                      <button 
                        onClick={() => handleStartEditDebt(debt)}
                        title="Editar Datos de la Tarjeta"
                        style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', borderRadius: '6px', padding: '0.35rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <Edit3 size={15} />
                      </button>
                      <button 
                        onClick={() => handleDeleteDebt(debt.id, debt.name, debt.current_balance)}
                        title="Eliminar Deuda"
                        style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', borderRadius: '6px', padding: '0.35rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Saldo Pendiente Main Display */}
                  <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '0.85rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#fca5a5', fontWeight: '600' }}>Saldo Pendiente:</span>
                    <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f43f5e' }}>
                      {formatMoney(debt.current_balance, hideValues)}
                    </div>
                  </div>

                  {/* Payments Breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>
                    <div style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)', padding: '0.6rem', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ fontSize: '0.7rem', color: '#fcd34d', fontWeight: '600', display: 'block' }}>Pago Mínimo:</span>
                      <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#fbbf24' }}>
                        {formatMoney(minPayVal, hideValues)}
                      </div>
                    </div>

                    <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.6rem', borderRadius: 'var(--radius-sm)' }}>
                      <span style={{ fontSize: '0.7rem', color: '#6ee7b7', fontWeight: '600', display: 'block' }}>Para No Generar Intereses:</span>
                      <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#10b981' }}>
                        {formatMoney(noIntPayVal, hideValues)}
                      </div>
                    </div>
                  </div>

                  {/* Dates Breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', background: 'rgba(255,255,255,0.03)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Fecha de Corte:</span>
                      <span style={{ fontWeight: '600', color: '#cbd5e1' }}>{debt.cutoff_date || 'No especificada'}</span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Fecha Límite de Pago:</span>
                      <span style={{ fontWeight: '600', color: '#f8fafc' }}>{debt.due_date || 'No especificada'}</span>
                    </div>
                  </div>

                  {/* MSI Plans attached */}
                  {debt.msi_plans && debt.msi_plans.length > 0 && (
                    <div style={{ marginTop: '0.85rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: '600', display: 'block', marginBottom: '0.35rem' }}>
                        Compras a Meses Sin Intereses (MSI):
                      </span>
                      {debt.msi_plans.map(msi => {
                        const paid = parseInt(msi.installments_paid, 10) || 0;
                        const total = parseInt(msi.installments_total, 10) || 12;
                        const currentInstNum = paid + 1;
                        return (
                          <div key={msi.id} style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span><strong>{msi.concept}</strong> (Abono {currentInstNum} de {total})</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: '600', color: '#a78bfa' }}>{formatMoney(msi.monthly_amount, hideValues)}/mes</span>
                              <button 
                                onClick={() => handleDeleteMSIPlan(msi.id, msi.concept)}
                                title="Eliminar este plan MSI"
                                style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>

                {/* Action buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button 
                    onClick={() => { setSelectedDebt(debt); setShowPayModal(true); setPayAmount(noIntPayVal || debt.current_balance || ''); }}
                    className="nav-tab-btn active"
                    style={{ justifyContent: 'center', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '0.55rem' }}
                  >
                    Realizar Pago
                  </button>

                  <button 
                    onClick={() => setMsiModalDebt(debt)}
                    style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontWeight: '600' }}
                  >
                    <Settings size={14} /> Configurar MSI
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MSI Configuration Modal */}
      {msiModalDebt && (
        <MSIConfigModal
          item={msiModalDebt}
          isDebt={true}
          onClose={() => setMsiModalDebt(null)}
          onSaved={() => {
            loadData();
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Modal Agregar Deuda / Tarjeta */}
      {showAddDebtModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem' }}>+ Registrar Deuda / Tarjeta</h3>
              <button onClick={() => setShowAddDebtModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateDebt} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Nombre de la Deuda / Tarjeta:</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Tarjeta BBVA Gold, Préstamo Banamex" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Tipo de Deuda:</label>
                <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}>
                  <option value="credit_card">Tarjeta de Crédito</option>
                  <option value="personal_loan">Préstamo Personal</option>
                  <option value="payroll_loan">Préstamo de Nómina</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Saldo Pendiente ($):</label>
                <input type="number" value={currentBalance} onChange={e => setCurrentBalance(e.target.value)} placeholder="Ej. 12500" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Pago Mínimo ($):</label>
                  <input type="number" value={minPayment} onChange={e => setMinPayment(e.target.value)} placeholder="Ej. 650" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Pago p/ No Generar Intereses ($):</label>
                  <input type="number" value={noInterestPayment} onChange={e => setNoInterestPayment(e.target.value)} placeholder="Ej. 3200" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Fecha de Corte:</label>
                  <input type="date" value={cutoffDate} onChange={e => setCutoffDate(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Fecha Límite de Pago:</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Tasa de Interés (% anual):</label>
                <input type="number" value={interestRate} onChange={e => setInterestRate(e.target.value)} placeholder="Ej. 42" step="0.1" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
              </div>

              <button type="submit" className="nav-tab-btn active" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.75rem', background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' }}>Guardar Deuda / Tarjeta</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Realizar Pago */}
      {selectedDebt && showPayModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '440px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem' }}>Abonar a {selectedDebt.name}</h3>
              <button onClick={() => { setSelectedDebt(null); setShowPayModal(false); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handlePayDebt} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Cuenta Origen del Pago:</label>
                <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} (${acc.balance})</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Monto del Abonar ($):</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Ej. 1500.00" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <button type="submit" className="nav-tab-btn active" style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                Confirmar Pago y Descontar Saldo
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Deuda / Tarjeta */}
      {editDebtItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', color: '#60a5fa' }}>✏️ Editar Datos de {editDebtItem.name}</h3>
              <button onClick={() => setEditDebtItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleUpdateDebt} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Nombre de la Tarjeta / Deuda:</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Saldo Total Pendiente ($):</label>
                <input type="number" value={editCurrentBalance} onChange={e => setEditCurrentBalance(e.target.value)} step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Pago Mínimo ($):</label>
                  <input type="number" value={editMinPayment} onChange={e => setEditMinPayment(e.target.value)} step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Pago p/ No Generar Int. ($):</label>
                  <input type="number" value={editNoInterestPayment} onChange={e => setEditNoInterestPayment(e.target.value)} step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Fecha de Corte:</label>
                  <input type="date" value={editCutoffDate} onChange={e => setEditCutoffDate(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Fecha Límite de Pago:</label>
                  <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Tasa de Interés (% anual):</label>
                <input type="number" value={editInterestRate} onChange={e => setEditInterestRate(e.target.value)} step="0.1" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
              </div>

              <button type="submit" className="nav-tab-btn active" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.75rem', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
                Guardar Cambios
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Agregar Plan MSI */}
      {selectedDebt && showAddMSIModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '440px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem' }}>+ Agregar Plan MSI a {selectedDebt.name}</h3>
              <button onClick={() => { setSelectedDebt(null); setShowAddMSIModal(false); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateMSI} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Concepto de la Compra:</label>
                <input type="text" value={msiConcept} onChange={e => setMsiConcept(e.target.value)} placeholder="Ej. Laptop Trabajo, Vuelo Liverpool" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Monto Total ($):</label>
                <input type="number" value={msiTotal} onChange={e => setMsiTotal(e.target.value)} placeholder="Ej. 18000" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Plazo (Meses):</label>
                  <input type="number" value={msiInstallmentsTotal} onChange={e => setMsiInstallmentsTotal(e.target.value)} placeholder="Ej. 12" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Mensualidad ($):</label>
                  <input type="number" value={msiMonthly} onChange={e => setMsiMonthly(e.target.value)} placeholder="Ej. 1500" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
              </div>

              <button type="submit" className="nav-tab-btn active" style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}>Guardar Plan MSI</button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
