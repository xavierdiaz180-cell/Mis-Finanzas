import React, { useState, useEffect } from 'react';
import { PiggyBank, Plus, ArrowUpRight, ArrowDownRight, ShieldAlert, ShieldCheck, Shield, RefreshCw, X, Landmark, Trash2, CheckCircle2, Lock } from 'lucide-react';
import { API_BASE } from '../config';
import { formatMoney } from '../utils/formatters';

export default function InversionesView({ onRefresh, hideValues = false }) {
  const [investments, setInvestments] = useState([]);
  const [accounts, setAccounts] = useState([]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [modalType, setModalType] = useState(null); // 'deposit' | 'withdraw' | 'update_value'

  // Form states
  const [name, setName] = useState('');
  const [investedAmount, setInvestedAmount] = useState('');
  const [documentedValue, setDocumentedValue] = useState('');
  const [riskLevel, setRiskLevel] = useState('medium');
  const [isLiquid, setIsLiquid] = useState(true);

  // Operation states
  const [opAccountId, setOpAccountId] = useState('');
  const [opAmount, setOpAmount] = useState('');

  const loadData = () => {
    fetch(`${API_BASE}/api/investments`)
      .then(res => res.json())
      .then(data => setInvestments(data))
      .catch(err => console.error('Error al cargar inversiones:', err));

    fetch(`${API_BASE}/api/accounts`)
      .then(res => res.json())
      .then(data => {
        setAccounts(data);
        if (data.length > 0) setOpAccountId(data[0].id);
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateInvestment = (e) => {
    e.preventDefault();
    if (!name) return alert('Ingresa un nombre para la inversión.');

    fetch(`${API_BASE}/api/investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        invested_amount: parseFloat(investedAmount || 0),
        current_documented_value: parseFloat(documentedValue || investedAmount || 0),
        risk_level: riskLevel,
        is_liquid: isLiquid,
        liquidity_status: isLiquid ? 'LIQUIDA' : 'NO_LIQUIDA'
      })
    })
      .then(res => res.json())
      .then(() => {
        setShowAddModal(false);
        setName('');
        setInvestedAmount('');
        setDocumentedValue('');
        setIsLiquid(true);
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al crear inversión: ' + err.message));
  };

  const handleUpdateValue = (e) => {
    e.preventDefault();
    if (!selectedInvestment || opAmount === '') return;

    fetch(`${API_BASE}/api/investments/${selectedInvestment.id}/update-value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_documented_value: parseFloat(opAmount) })
    })
      .then(res => res.json())
      .then(() => {
        setSelectedInvestment(null);
        setModalType(null);
        setOpAmount('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al actualizar valor: ' + err.message));
  };

  const handleDeposit = (e) => {
    e.preventDefault();
    if (!selectedInvestment || !opAmount || !opAccountId) return;

    fetch(`${API_BASE}/api/investments/${selectedInvestment.id}/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: parseInt(opAccountId, 10),
        amount: parseFloat(opAmount)
      })
    })
      .then(res => res.json())
      .then(() => {
        setSelectedInvestment(null);
        setModalType(null);
        setOpAmount('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al realizar depósito: ' + err.message));
  };

  const handleWithdraw = (e) => {
    e.preventDefault();
    if (!selectedInvestment || !opAmount || !opAccountId) return;

    fetch(`${API_BASE}/api/investments/${selectedInvestment.id}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: parseInt(opAccountId, 10),
        amount: parseFloat(opAmount)
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) return alert(data.error);
        setSelectedInvestment(null);
        setModalType(null);
        setOpAmount('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al realizar retiro: ' + err.message));
  };

  const handleDeleteInvestment = (inv) => {
    if (!window.confirm(`¿Eliminar la inversión "${inv.name}"? Se borrará del portafolio permanentemente. Esta acción no se puede deshacer.`)) return;
    fetch(`${API_BASE}/api/investments/${inv.id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(data => {
        if (data.error) return alert(data.error);
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al eliminar inversión: ' + err.message));
  };

  const getRiskBadge = (risk) => {
    switch (risk) {
      case 'low':
        return <span className="badge badge-success"><ShieldCheck size={13} /> Riesgo Bajo</span>;
      case 'medium':
        return <span className="badge badge-info"><Shield size={13} /> Riesgo Medio</span>;
      case 'high':
        return <span className="badge badge-warning"><ShieldAlert size={13} /> Riesgo Alto</span>;
      default:
        return <span className="badge badge-info">{risk}</span>;
    }
  };

  const totalPortfolioValue = investments.reduce((acc, i) => acc + (parseFloat(i.current_documented_value || i.current_value) || 0), 0);
  const totalInvested = investments.reduce((acc, i) => acc + (parseFloat(i.invested_amount || i.capital_contributed) || 0), 0);
  const totalGainLoss = totalPortfolioValue - totalInvested;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PiggyBank size={24} /> Portafolio de Inversiones
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Las inversiones participan en tu Riqueza Neta y Análisis. Las marcadas como Líquidas alimentan tu Dinero Gastable (`spendableMoney`).
          </p>
        </div>

        <button 
          onClick={() => setShowAddModal(true)}
          className="nav-tab-btn active"
          style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', padding: '0.75rem 1.25rem' }}
        >
          <Plus size={18} /> Nueva Inversión
        </button>
      </div>

      {/* Summary Portfolio Card */}
      <div className="glass-card" style={{ borderLeft: '4px solid #10b981', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>VALOR TOTAL PORTAFOLIO</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#34d399' }}>
            {formatMoney(totalPortfolioValue, hideValues)}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>MONTO CAPITAL INVERTIDO</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#f8fafc' }}>
            {formatMoney(totalInvested, hideValues)}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>GANANCIA / PÉRDIDA TOTAL</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: totalGainLoss >= 0 ? '#34d399' : '#f43f5e' }}>
            {formatMoney(totalGainLoss, hideValues)}
          </div>
        </div>
      </div>

      {/* Investment Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {investments.length === 0 ? (
          <div className="glass-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
            <PiggyBank size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
            <p style={{ color: 'var(--text-secondary)' }}>No tienes inversiones registradas. Registra tu primera inversión en el botón superior.</p>
          </div>
        ) : (
          investments.map(inv => {
            const isLiq = inv.is_liquid !== false && inv.liquidity_status !== 'NO_LIQUIDA';
            const curVal = parseFloat(inv.current_documented_value || inv.current_value || 0);
            const invCap = parseFloat(inv.invested_amount || inv.capital_contributed || 0);
            const diff = curVal - invCap;

            return (
              <div key={inv.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: '600' }}>{inv.name}</h3>
                      <div style={{ marginTop: '0.25rem' }}>
                        {isLiq ? (
                          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}><CheckCircle2 size={11} /> Disponible Inmediatamente (Líquida)</span>
                        ) : (
                          <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}><Lock size={11} /> Bloqueada a Plazo (No Líquida)</span>
                        )}
                      </div>
                    </div>
                    {getRiskBadge(inv.risk_level)}
                  </div>

                  <div style={{ margin: '0.75rem 0' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Valor Documentado Actual:</span>
                    <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#34d399' }}>
                      {formatMoney(curVal, hideValues)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                    <span>Invertido: {formatMoney(invCap, hideValues)}</span>
                    <span style={{ color: diff >= 0 ? '#34d399' : '#f43f5e', fontWeight: '600' }}>
                      {formatMoney(diff, hideValues)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Última actualización: {inv.last_update || 'Reciente'}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                  <button 
                    onClick={() => { setSelectedInvestment(inv); setModalType('deposit'); setOpAmount(''); }}
                    style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', padding: '0.45rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}
                  >
                    <ArrowUpRight size={14} /> Invertir
                  </button>

                  <button 
                    onClick={() => { setSelectedInvestment(inv); setModalType('withdraw'); setOpAmount(''); }}
                    style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e', padding: '0.45rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}
                  >
                    <ArrowDownRight size={14} /> Retirar
                  </button>

                  <button 
                    onClick={() => { setSelectedInvestment(inv); setModalType('update_value'); setOpAmount(curVal); }}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '0.45rem', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}
                  >
                    <RefreshCw size={14} /> Actualizar
                  </button>
                </div>

                <button
                  onClick={() => handleDeleteInvestment(inv)}
                  style={{
                    width: '100%',
                    background: 'rgba(244,63,94,0.08)',
                    border: '1px solid rgba(244,63,94,0.25)',
                    color: '#f87171',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.4rem',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <Trash2 size={13} /> Eliminar Inversión
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Nueva Inversión */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '480px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem' }}>+ Registrar Nueva Inversión</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateInvestment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Nombre de la Inversión:</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. CETES Directo, Nu 15%, Fondo Fintual" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Monto Capital Invertido ($):</label>
                <input type="number" value={investedAmount} onChange={e => setInvestedAmount(e.target.value)} placeholder="Ej. 10000" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Valor Documentado Actual ($):</label>
                <input type="number" value={documentedValue} onChange={e => setDocumentedValue(e.target.value)} placeholder="Ej. 10450" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Disponibilidad de Retiro (Disponibilidad Inmediata):</label>
                <select value={isLiquid ? 'true' : 'false'} onChange={e => setIsLiquid(e.target.value === 'true')} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}>
                  <option value="true">Disponibilidad Inmediata (Suma a Dinero Gastable)</option>
                  <option value="false">Bloqueada a Plazo (Excluida de Dinero Gastable)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Nivel de Riesgo:</label>
                <select value={riskLevel} onChange={e => setRiskLevel(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}>
                  <option value="low">Bajo (Ej. CETES, Sofipos)</option>
                  <option value="medium">Medio (Ej. Fibras, Deuda Corporativa)</option>
                  <option value="high">Alto (Ej. Acciones, Cripto, ETF Variable)</option>
                </select>
              </div>

              <button type="submit" className="nav-tab-btn active" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.75rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>Guardar Inversión</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Operaciones (Depósito / Retiro / Actualizar) */}
      {selectedInvestment && modalType && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '440px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem' }}>
                {modalType === 'deposit' && `Invertir en ${selectedInvestment.name}`}
                {modalType === 'withdraw' && `Retirar de ${selectedInvestment.name}`}
                {modalType === 'update_value' && `Actualizar valor de ${selectedInvestment.name}`}
              </h3>
              <button onClick={() => { setSelectedInvestment(null); setModalType(null); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {modalType === 'deposit' && (
              <form onSubmit={handleDeposit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Cuenta Origen:</label>
                  <select value={opAccountId} onChange={e => setOpAccountId(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}>
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} (${acc.balance})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Monto a Invertir ($):</label>
                  <input type="number" value={opAmount} onChange={e => setOpAmount(e.target.value)} placeholder="0.00" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
                </div>
                <button type="submit" className="nav-tab-btn active" style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}>Confirmar Depósito</button>
              </form>
            )}

            {modalType === 'withdraw' && (
              <form onSubmit={handleWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Cuenta Destino:</label>
                  <select value={opAccountId} onChange={e => setOpAccountId(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}>
                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Monto a Retirar ($):</label>
                  <input type="number" value={opAmount} onChange={e => setOpAmount(e.target.value)} placeholder="0.00" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
                </div>
                <button type="submit" className="nav-tab-btn active" style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)' }}>Confirmar Retiro</button>
              </form>
            )}

            {modalType === 'update_value' && (
              <form onSubmit={handleUpdateValue} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Nuevo Valor Documentado ($):</label>
                  <input type="number" value={opAmount} onChange={e => setOpAmount(e.target.value)} placeholder="0.00" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
                </div>
                <button type="submit" className="nav-tab-btn active" style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}>Guardar Nuevo Valor</button>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
