import React, { useState, useEffect } from 'react';
import { Wallet, PiggyBank, CreditCard, ShieldCheck, Sparkles, Calendar, TrendingUp, AlertCircle, ArrowUpRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatMoney } from '../utils/formatters';
import { API_BASE } from '../config';

export default function InicioView({ summary: initialSummary, onNavigate, onRefresh, hideValues = false }) {
  const [localSummary, setLocalSummary] = useState(initialSummary || null);
  const [loadingMetrics, setLoadingMetrics] = useState(!initialSummary);

  const fetchLiveSummary = () => {
    setLoadingMetrics(true);
    fetch(`${API_BASE}/api/summary`)
      .then(res => res.json())
      .then(data => {
        setLocalSummary(data);
      })
      .catch(err => console.error('Error fetching summary in InicioView:', err))
      .finally(() => setLoadingMetrics(false));
  };

  useEffect(() => {
    fetchLiveSummary();
  }, []);

  useEffect(() => {
    if (initialSummary) {
      setLocalSummary(initialSummary);
    }
  }, [initialSummary]);

  const summary = localSummary || initialSummary || {};

  const liquid_money = summary.liquid_money !== undefined ? parseFloat(summary.liquid_money) : parseFloat(summary.disponible_hoy || 0);
  const investment_value = summary.investment_value !== undefined ? parseFloat(summary.investment_value) : parseFloat(summary.total_inversiones || 0);
  const available_money = summary.available_money !== undefined ? parseFloat(summary.available_money) : (liquid_money + investment_value);
  const spendable_money = summary.spendable_money !== undefined ? parseFloat(summary.spendable_money) : (liquid_money);
  const total_debt = summary.total_debt !== undefined ? parseFloat(summary.total_debt) : parseFloat(summary.total_deuda || 0);
  const net_worth = summary.net_worth !== undefined ? parseFloat(summary.net_worth) : (available_money - total_debt);
  const presupuesto_diario = summary.presupuesto_diario || {};
  const coach_recomendacion_corta = summary.coach_recomendacion_corta || '';

  // Daily budget text mapping according to Phase 3.1 specification
  const getBudgetStatusText = (status) => {
    switch (status) {
      case 'LESS_THAN_BUDGET':
        return 'Gastaste menos de lo previsto';
      case 'ON_BUDGET':
        return 'Gastaste lo previsto';
      case 'OVER_BUDGET':
        return 'Gastaste más de lo previsto';
      default:
        return status || 'Gastaste lo previsto';
    }
  };

  const budgetResult = presupuesto_diario.result || (presupuesto_diario.available_today < 0 ? 'OVER_BUDGET' : 'LESS_THAN_BUDGET');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* 6 Core Financial Summary Cards defined in Phase 3.1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.15rem' }}>
        
        {/* 1. DINERO EN CUENTAS (liquidMoney) */}
        <div className="glass-card" style={{ borderLeft: '4px solid #38bdf8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              DINERO EN CUENTAS
            </span>
            <span className="badge badge-info"><Wallet size={12} /> Cuentas Líquidas</span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '700', color: '#f8fafc', margin: '0.4rem 0' }}>
            {formatMoney(liquid_money, hideValues)}
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Nómina, Débito, Efectivo y Cajas inmediatamente disponibles.
          </p>
        </div>

        {/* 2. INVERSIONES (investmentValue) */}
        <div className="glass-card" style={{ borderLeft: '4px solid #a855f7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              INVERSIONES
            </span>
            <span className="badge badge-info"><PiggyBank size={12} /> Portafolio</span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '700', color: '#a855f7', margin: '0.4rem 0' }}>
            {formatMoney(investment_value, hideValues)}
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Valor actual total de activos de inversión.
          </p>
        </div>

        {/* 3. DINERO DISPONIBLE (availableMoney) */}
        <div className="glass-card" style={{ borderLeft: '4px solid #60a5fa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              DINERO DISPONIBLE
            </span>
            <span className="badge badge-info">Liquidez + Inversiones</span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '700', color: '#f8fafc', margin: '0.4rem 0' }}>
            {formatMoney(available_money, hideValues)}
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Activos totales líquidos e inversiones documentadas.
          </p>
        </div>

        {/* 4. DINERO GASTABLE (spendableMoney) */}
        <div className="glass-card" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              DINERO GASTABLE
            </span>
            <span className="badge badge-success">Gasto Inmediato</span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '700', color: '#10b981', margin: '0.4rem 0' }}>
            {formatMoney(spendable_money, hideValues)}
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Liquidez + Inversiones de disponibilidad inmediata.
          </p>
        </div>

        {/* 5. DEUDAS (totalDebt) */}
        <div className="glass-card" style={{ borderLeft: '4px solid #f43f5e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              DEUDAS
            </span>
            <span className="badge badge-danger"><CreditCard size={12} /> Pasivos</span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '700', color: '#f43f5e', margin: '0.4rem 0' }}>
            {formatMoney(total_debt, hideValues)}
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Tarjetas de crédito, mensualidades MSI y préstamos.
          </p>
        </div>

        {/* 6. PATRIMONIO NETO (netWorth) */}
        <div className="glass-card" style={{ borderLeft: '4px solid #34d399' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              PATRIMONIO NETO
            </span>
            <span className="badge badge-success">Activos - Pasivos</span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '700', color: net_worth < 0 ? '#f43f5e' : '#34d399', margin: '0.4rem 0' }}>
            {formatMoney(net_worth, hideValues)}
          </div>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Disponible ({formatMoney(available_money, hideValues)}) - Deudas ({formatMoney(total_debt, hideValues)})
          </p>
        </div>

      </div>

      {/* Middle Grid: Presupuesto Diario de 24 Horas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={18} style={{ color: '#60a5fa' }} /> Presupuesto Diario de 24 Horas
            </h3>
            <span className={`badge ${budgetResult === 'OVER_BUDGET' ? 'badge-danger' : 'badge-success'}`}>
              {getBudgetStatusText(budgetResult)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center', marginBottom: '1.2rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Límite Diario</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#f8fafc' }}>
                {formatMoney(presupuesto_diario.budget_amount || presupuesto_diario.limite_diario || 500, hideValues)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gastado (24h)</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#f43f5e' }}>
                {formatMoney(presupuesto_diario.actual_spent || presupuesto_diario.gastado_hoy || 0, hideValues)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Disponible (24h)</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '600', color: ((presupuesto_diario.available_today || presupuesto_diario.disponible_hoy || 0) < 0) ? '#f43f5e' : '#34d399' }}>
                {formatMoney(presupuesto_diario.available_today || presupuesto_diario.disponible_hoy || 0, hideValues)}
              </div>
            </div>
          </div>

          {coach_recomendacion_corta && (
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Sparkles size={20} style={{ color: '#60a5fa', flexShrink: 0 }} />
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {coach_recomendacion_corta}
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
