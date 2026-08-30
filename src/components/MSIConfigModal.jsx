import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit3, Check, ShoppingBag, Info, Calculator, Calendar, ArrowRight, HelpCircle } from 'lucide-react';
import { API_BASE } from '../config';
import { formatMoney } from '../utils/formatters';

export default function MSIConfigModal({ item, isDebt = false, onClose, onSaved }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [concept, setConcept] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [installmentsTotal, setInstallmentsTotal] = useState(12);

  // Input mode: 'current' (e.g. "Abono 6 de 12") OR 'remaining' (e.g. "Faltan 5 mensualidades por pagar")
  const [inputMode, setInputMode] = useState('remaining');
  const [currentInstallmentNumber, setCurrentInstallmentNumber] = useState(1);
  const [remainingInstallments, setRemainingInstallments] = useState(5);

  const accountId = isDebt ? null : item.id;
  const debtId = isDebt ? item.id : null;
  const totalBalance = parseFloat(item.balance || item.current_balance || 0);

  const loadPlans = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/installment-plans`)
      .then(res => res.json())
      .then(allPlans => {
        const itemPlans = allPlans.filter(p => {
          const targetCardId = isDebt ? item.account_id : item.id;
          const targetDebtId = isDebt ? item.id : null;

          if (targetCardId && (p.account_id === targetCardId || p.credit_card_id === targetCardId)) return true;
          if (targetDebtId && p.debt_id === targetDebtId) return true;
          if (item.account_id && (p.account_id === item.account_id || p.credit_card_id === item.account_id)) return true;
          // Match by name if ID didn't match directly
          if (item.name && p.concept) {
            const itemName = item.name.toLowerCase();
            const planConcept = p.concept.toLowerCase();
            if (itemName.includes(planConcept) || planConcept.includes(itemName)) return true;
          }
          return false;
        });
        setPlans(itemPlans);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error al cargar planes MSI:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadPlans();
  }, [item.id]);

  const resetForm = () => {
    setEditingPlanId(null);
    setConcept('');
    setMonthlyAmount('');
    setInstallmentsTotal(12);
    setInputMode('remaining');
    setCurrentInstallmentNumber(1);
    setRemainingInstallments(5);
  };

  const handleStartEdit = (plan) => {
    setEditingPlanId(plan.id);
    setConcept(plan.concept);
    setMonthlyAmount(plan.monthly_amount);
    setInstallmentsTotal(plan.installments_total);

    const paid = parseInt(plan.installments_paid, 10) || 0;
    const total = parseInt(plan.installments_total, 10) || 12;
    const currentNum = paid + 1;
    const remaining = Math.max(0, total - paid);

    setCurrentInstallmentNumber(currentNum);
    setRemainingInstallments(remaining);
  };

  const handleDeletePlan = (planId, planConcept) => {
    if (!window.confirm(`¿Eliminar la compra a MSI "${planConcept}"?`)) return;

    fetch(`${API_BASE}/api/installment-plans/${planId}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => {
        loadPlans();
        if (onSaved) onSaved();
      })
      .catch(err => alert('Error al eliminar plan MSI: ' + err.message));
  };

  const handleSubmitPlan = (e) => {
    e.preventDefault();
    if (!concept || !monthlyAmount || parseFloat(monthlyAmount) <= 0) {
      return alert('Ingresa un concepto y un monto mensual válido.');
    }

    const totalMonths = Math.max(1, parseInt(installmentsTotal || 12, 10));
    let paidMonths = 0;

    if (inputMode === 'remaining') {
      const remaining = Math.max(0, parseInt(remainingInstallments || 0, 10));
      paidMonths = Math.max(0, totalMonths - remaining);
    } else {
      const currentNum = Math.max(1, parseInt(currentInstallmentNumber || 1, 10));
      paidMonths = Math.max(0, currentNum - 1);
    }

    const monthly = parseFloat(monthlyAmount);

    const targetCardId = isDebt ? item.account_id : item.id;
    const targetDebtId = isDebt ? item.id : null;

    const payload = {
      account_id: targetCardId,
      credit_card_id: targetCardId,
      debt_id: targetDebtId,
      concept,
      monthly_amount: monthly,
      installments_total: totalMonths,
      installments_paid: paidMonths,
      total_amount: monthly * totalMonths
    };

    const url = editingPlanId
      ? `${API_BASE}/api/installment-plans/${editingPlanId}`
      : `${API_BASE}/api/installment-plans`;

    const method = editingPlanId ? 'PUT' : 'POST';

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        resetForm();
        loadPlans();
        if (onSaved) onSaved();
      })
      .catch(err => alert('Error al guardar MSI: ' + err.message));
  };

  // Calculations for live summary banner
  const activePlans = plans.filter(p => (parseInt(p.installments_paid, 10) || 0) < (parseInt(p.installments_total, 10) || 1));
  const msiMonthlySum = activePlans.reduce((sum, p) => sum + (parseFloat(p.monthly_amount) || 0), 0);
  const msiRemainingTotal = activePlans.reduce((sum, p) => {
    const remInst = Math.max(0, (parseInt(p.installments_total, 10) || 0) - (parseInt(p.installments_paid, 10) || 0));
    return sum + (parseFloat(p.monthly_amount) * remInst);
  }, 0);

  const revolvingBalance = Math.max(0, totalBalance - msiRemainingTotal);
  const noInterestPayment = activePlans.length > 0 ? (msiMonthlySum + revolvingBalance) : totalBalance;

  // Presets for total months
  const PRESET_MONTHS = [3, 5, 6, 9, 12, 18, 24, 36];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 1100, padding: '1rem'
    }}>
      <div className="glass-card" style={{ maxWidth: '680px', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
        
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShoppingBag size={22} /> Configuración de Meses Sin Intereses
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {item.name} · Saldo Total Pendiente: <strong>{formatMoney(totalBalance)}</strong>
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Live Financial Breakdown Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          borderRadius: 'var(--radius-sm)',
          padding: '1rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{ fontSize: '0.78rem', color: '#c4b5fd', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Calculator size={16} /> Desglose Financiero (Pago para No Generar Intereses)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Mensualidades MSI este mes:</span>
              <span style={{ fontSize: '1.15rem', fontWeight: '700', color: '#a78bfa' }}>
                {formatMoney(msiMonthlySum)}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>
                ({activePlans.length} plan{activePlans.length !== 1 ? 'es' : ''} activo{activePlans.length !== 1 ? 's' : ''})
              </span>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.35)', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Saldo a 1 solo pago (Revolvente):</span>
              <span style={{ fontSize: '1.15rem', fontWeight: '700', color: '#60a5fa' }}>
                {formatMoney(revolvingBalance)}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>
                ({formatMoney(totalBalance)} total − {formatMoney(msiRemainingTotal)} MSI futuros)
              </span>
            </div>
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '0.75rem 1rem', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#6ee7b7', fontWeight: '700', display: 'block' }}>PAGO PARA NO GENERAR INTERESES ESTE MES:</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {activePlans.length > 0 
                  ? `${formatMoney(revolvingBalance)} (revolvente) + ${formatMoney(msiMonthlySum)} (mensualidades MSI)`
                  : 'Sin MSI activos (pago del saldo total)'}
              </span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#10b981' }}>
              {formatMoney(noInterestPayment)}
            </div>
          </div>
        </div>

        {/* Existing MSI Plans List */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            Compras a Meses Sin Intereses Activas ({plans.length})
          </h4>

          {loading ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cargando planes...</div>
          ) : plans.length === 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px border var(--border-subtle)', borderRadius: '6px', padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No hay compras a MSI configuradas para esta tarjeta. Agrega tus compras a meses corriendo abajo.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '220px', overflowY: 'auto' }}>
              {plans.map(plan => {
                const paid = parseInt(plan.installments_paid, 10) || 0;
                const total = parseInt(plan.installments_total, 10) || 12;
                const currentInstNum = paid + 1;
                const isFinished = paid >= total;
                const remInst = Math.max(0, total - paid);
                const remBal = parseFloat(plan.monthly_amount) * remInst;

                return (
                  <div key={plan.id} style={{
                    background: editingPlanId === plan.id ? 'rgba(167, 139, 250, 0.15)' : 'rgba(255,255,255,0.03)',
                    border: editingPlanId === plan.id ? '1px solid #a78bfa' : '1px solid var(--border-subtle)',
                    borderRadius: '8px', padding: '0.75rem 1rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem'
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.95rem', color: '#f8fafc' }}>{plan.concept}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {isFinished ? (
                          <span style={{ color: '#10b981', fontWeight: '600' }}>✓ Plan completado</span>
                        ) : (
                          <>
                            Abono <strong style={{ color: '#a78bfa' }}>{currentInstNum} de {total}</strong> · <strong style={{ color: '#f59e0b' }}>Faltan {remInst} mensualidades</strong> ({formatMoney(remBal)} pendiente)
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#a78bfa' }}>
                          {formatMoney(plan.monthly_amount)}/mes
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Total: {formatMoney(plan.total_amount || (plan.monthly_amount * total))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          onClick={() => handleStartEdit(plan)}
                          title="Editar este plan"
                          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer' }}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeletePlan(plan.id, plan.concept)}
                          title="Eliminar este plan"
                          style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e', borderRadius: '6px', padding: '0.4rem', cursor: 'pointer' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add / Edit Plan Form */}
        <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '1.1rem' }}>
          <h4 style={{ fontSize: '0.98rem', fontWeight: '600', marginBottom: '1rem', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{editingPlanId ? '✏️ Editar Compra a MSI' : '+ Configurar Nueva Compra a MSI (Pasada o Nueva)'}</span>
            {editingPlanId && (
              <button onClick={resetForm} style={{ fontSize: '0.75rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
                Cancelar Edición
              </button>
            )}
          </h4>

          <form onSubmit={handleSubmitPlan} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                Nombre / Concepto de la Compra:
              </label>
              <input
                type="text"
                value={concept}
                onChange={e => setConcept(e.target.value)}
                placeholder="Ej. Abono Stori, Carro Laura, Teléfono DiDi"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: '0.9rem' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                  Pago Mensual ($/mes):
                </label>
                <input
                  type="number"
                  value={monthlyAmount}
                  onChange={e => setMonthlyAmount(e.target.value)}
                  placeholder="Ej. 500 o 2004.00"
                  step="0.01"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: '0.9rem' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                  Plazo Total (Meses):
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={installmentsTotal}
                  onChange={e => setInstallmentsTotal(e.target.value)}
                  placeholder="Ej. 12"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'white', fontSize: '0.9rem' }}
                  required
                />
              </div>
            </div>

            {/* Quick Preset Pills for Plazo Total */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Atajos de plazo:</span>
              {PRESET_MONTHS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setInstallmentsTotal(m)}
                  style={{
                    background: parseInt(installmentsTotal, 10) === m ? '#a78bfa' : 'rgba(255,255,255,0.06)',
                    color: parseInt(installmentsTotal, 10) === m ? '#0f172a' : '#cbd5e1',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>

            {/* Config Mode Switcher: "Por abono actual" vs "Por mensualidades que faltan" */}
            <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)', padding: '0.85rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#c4b5fd', fontWeight: '600', marginBottom: '0.5rem' }}>
                ⚙️ ¿Cómo prefieres indicar el avance de esta compra?
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setInputMode('remaining')}
                  style={{
                    flex: 1,
                    padding: '0.45rem 0.65rem',
                    borderRadius: '6px',
                    border: inputMode === 'remaining' ? '1px solid #a78bfa' : '1px solid transparent',
                    background: inputMode === 'remaining' ? 'rgba(167, 139, 250, 0.25)' : 'rgba(0,0,0,0.3)',
                    color: inputMode === 'remaining' ? '#ffffff' : 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Faltan X mensualidades (ej. faltan 5)
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('current')}
                  style={{
                    flex: 1,
                    padding: '0.45rem 0.65rem',
                    borderRadius: '6px',
                    border: inputMode === 'current' ? '1px solid #a78bfa' : '1px solid transparent',
                    background: inputMode === 'current' ? 'rgba(167, 139, 250, 0.25)' : 'rgba(0,0,0,0.3)',
                    color: inputMode === 'current' ? '#ffffff' : 'var(--text-secondary)',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Voy en el abono X de Y (ej. 6 de 12)
                </button>
              </div>

              {inputMode === 'remaining' ? (
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#93c5fd', fontWeight: '600', display: 'block', marginBottom: '0.35rem' }}>
                    Mensualidades que FALTAN por pagar:
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="number"
                      min="1"
                      max={installmentsTotal}
                      value={remainingInstallments}
                      onChange={e => setRemainingInstallments(e.target.value)}
                      style={{ width: '100px', padding: '0.5rem 0.65rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid #60a5fa', color: 'white', fontWeight: '700', fontSize: '1.05rem', textAlign: 'center' }}
                      required
                    />
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      mensualidad{parseInt(remainingInstallments, 10) !== 1 ? 'es' : ''} restantes (de {installmentsTotal} meses)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    💡 <em>Se calculará automáticamente que se han pagado {Math.max(0, parseInt(installmentsTotal || 12, 10) - parseInt(remainingInstallments || 0, 10))} mensualidades previas.</em>
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#93c5fd', fontWeight: '600', display: 'block', marginBottom: '0.35rem' }}>
                    Abono o mensualidad actual:
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="number"
                      min="1"
                      max={installmentsTotal}
                      value={currentInstallmentNumber}
                      onChange={e => setCurrentInstallmentNumber(e.target.value)}
                      style={{ width: '100px', padding: '0.5rem 0.65rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid #60a5fa', color: 'white', fontWeight: '700', fontSize: '1.05rem', textAlign: 'center' }}
                      required
                    />
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      de <strong>{installmentsTotal}</strong> meses totales
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    💡 <em>Ej. Si pones abono 6 de 12, significa que se pagaron 5 meses antes y quedan 7 mensualidades pendientes por cubrir.</em>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="nav-tab-btn active"
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.3rem', padding: '0.75rem', background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', fontSize: '0.95rem' }}
            >
              {editingPlanId ? '✓ Actualizar Compra a MSI' : 'Guardar y Recalcular Pago de Tarjeta'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
