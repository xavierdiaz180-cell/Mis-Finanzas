import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, DollarSign, Calendar, Percent, AlertTriangle, CheckCircle2, X, Sparkles } from 'lucide-react';
import DocumentScannerModal from '../components/DocumentScannerModal';
import { API_BASE } from '../config';

export default function DeudasView({ onRefresh }) {
  const [debts, setDebts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showDocScanner, setShowDocScanner] = useState(false);

  // Modals
  const [showAddDebtModal, setShowAddDebtModal] = useState(false);
  const [showAddMSIModal, setShowAddMSIModal] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);

  // Form New Debt
  const [name, setName] = useState('');
  const [type, setType] = useState('credit_card');
  const [originalAmount, setOriginalAmount] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [remainingPayments, setRemainingPayments] = useState('');

  // Form Payment
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState('');

  // Form MSI
  const [msiConcept, setMsiConcept] = useState('');
  const [msiTotal, setMsiTotal] = useState('');
  const [msiMonthly, setMsiMonthly] = useState('');
  const [msiInstallmentsTotal, setMsiInstallmentsTotal] = useState('');

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
        payment_amount: parseFloat(paymentAmount || 0),
        interest_rate: parseFloat(interestRate || 0),
        due_date: dueDate,
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
        setInterestRate('');
        setDueDate('');
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

  const totalDebtBalance = debts.reduce((acc, d) => acc + (d.current_balance || 0), 0);
  const totalMonthlyCommitment = debts.reduce((acc, d) => acc + (d.payment_amount || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CreditCard size={24} /> Deudas y Compromisos Financieros
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Tarjetas de crédito, préstamos personales, de nómina y meses sin intereses.
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
            <Plus size={18} /> Registrar Deuda / Préstamo
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
      <div className="glass-card" style={{ borderLeft: '4px solid #f43f5e', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>DEUDA TOTAL ACUMULADA</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f43f5e' }}>
            ${totalDebtBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>COMPROMISO DE PAGO MENSUAL</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#fbbf24' }}>
            ${totalMonthlyCommitment.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Debt Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {debts.length === 0 ? (
          <div className="glass-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
            <CheckCircle2 size={48} style={{ color: '#34d399', marginBottom: '1rem' }} />
            <p style={{ color: 'var(--text-secondary)' }}>¡Excelente! No tienes deudas o préstamos pendientes registrados.</p>
          </div>
        ) : (
          debts.map(debt => (
            <div key={debt.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem', borderTop: '3px solid #f43f5e' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: '600' }}>{debt.name}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {debt.type === 'credit_card' ? 'Tarjeta de Crédito' : debt.type === 'payroll_loan' ? 'Préstamo de Nómina' : 'Préstamo Personal'}
                    </span>
                  </div>
                  <span className="badge badge-warning">
                    Tasa: {debt.interest_rate}%
                  </span>
                </div>

                <div style={{ margin: '0.75rem 0' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Saldo Pendiente:</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f43f5e' }}>
                    ${debt.current_balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pago Mensual:</span>
                    <div style={{ fontWeight: '600', color: '#fbbf24' }}>${debt.payment_amount.toLocaleString('es-MX')}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fecha Límite:</span>
                    <div style={{ fontWeight: '600', color: '#f8fafc' }}>{debt.due_date || 'No especificada'}</div>
                  </div>
                </div>

                {/* MSI Plans attached */}
                {debt.msi_plans && debt.msi_plans.length > 0 && (
                  <div style={{ marginTop: '0.85rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: '600', display: 'block', marginBottom: '0.35rem' }}>
                      Planes a Meses Sin Intereses (MSI):
                    </span>
                    {debt.msi_plans.map(msi => (
                      <div key={msi.id} style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', marginBottom: '0.35rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{msi.concept} ({msi.installments_paid}/{msi.installments_total} meses)</span>
                        <span style={{ fontWeight: '600', color: '#a78bfa' }}>${msi.monthly_amount}/mes</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button 
                  onClick={() => { setSelectedDebt(debt); setShowPayModal(true); setPayAmount(debt.payment_amount || ''); }}
                  className="nav-tab-btn active"
                  style={{ justifyContent: 'center', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '0.5rem' }}
                >
                  Realizar Pago
                </button>

                <button 
                  onClick={() => { setSelectedDebt(debt); setShowAddMSIModal(true); }}
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', cursor: 'pointer' }}
                >
                  + Agregar MSI
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Agregar Deuda */}
      {showAddDebtModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '480px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem' }}>+ Registrar Deuda / Préstamo</h3>
              <button onClick={() => setShowAddDebtModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateDebt} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Nombre / Institución:</label>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Saldo Actual Pendiente ($):</label>
                  <input type="number" value={currentBalance} onChange={e => setCurrentBalance(e.target.value)} placeholder="Ej. 12500" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Pago Mensual ($):</label>
                  <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="Ej. 1500" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Tasa de Interés (% anual):</label>
                  <input type="number" value={interestRate} onChange={e => setInterestRate(e.target.value)} placeholder="Ej. 42" step="0.1" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Fecha Límite de Pago:</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }} />
                </div>
              </div>

              <button type="submit" className="nav-tab-btn active" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.75rem', background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' }}>Guardar Deuda</button>
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
