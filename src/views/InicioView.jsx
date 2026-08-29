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
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data && !data.error && data.liquid_money !== undefined) {
          setLocalSummary(data);
        }
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
  const presupuesto_servicios = presupuesto_diario.servicios || summary.presupuesto_servicios || {
    budget_amount: 1500,
    actual_spent: 0,
    available_month: 1500,
    result: 'LESS_THAN_BUDGET'
  };
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

  const budgetFoodResult = presupuesto_diario.result || (presupuesto_diario.available_today < 0 ? 'OVER_BUDGET' : 'LESS_THAN_BUDGET');
  const budgetServicesResult = presupuesto_servicios.result || (presupuesto_servicios.available_month < 0 ? 'OVER_BUDGET' : 'LESS_THAN_BUDGET');

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

      {/* Middle Grid: Presupuesto Alimentación (24h) y Presupuesto Servicios (Mensual) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        
        {/* 1. Presupuesto Diario de Alimentación (24h) */}
        <div className="glass-card" style={{ borderTop: '3px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Calendar size={18} style={{ color: '#f59e0b' }} /> Alimentación (Presupuesto 24h)
            </h3>
            <span className={`badge ${budgetFoodResult === 'OVER_BUDGET' ? 'badge-danger' : 'badge-success'}`}>
              {getBudgetStatusText(budgetFoodResult)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', textAlign: 'center', marginBottom: '0.85rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Límite Diario</span>
              <div style={{ fontSize: '1.15rem', fontWeight: '600', color: '#f8fafc' }}>
                {formatMoney(presupuesto_diario.budget_amount || presupuesto_diario.limite_diario || 200, hideValues)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Gastado (24h)</span>
              <div style={{ fontSize: '1.15rem', fontWeight: '600', color: '#f43f5e' }}>
                {formatMoney(presupuesto_diario.actual_spent || presupuesto_diario.gastado_hoy || 0, hideValues)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Disponible (24h)</span>
              <div style={{ fontSize: '1.15rem', fontWeight: '600', color: ((presupuesto_diario.available_today ?? 0) < 0) ? '#f43f5e' : '#34d399' }}>
                {formatMoney(presupuesto_diario.available_today || presupuesto_diario.disponible_hoy || 0, hideValues)}
              </div>
            </div>
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
            * Solo descuenta gastos de <strong>Alimentación</strong>. Se actualiza cada 24 horas.
          </p>
        </div>

        {/* 2. Presupuesto Mensual de Servicios */}
        <div className="glass-card" style={{ borderTop: '3px solid #38bdf8' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <TrendingUp size={18} style={{ color: '#38bdf8' }} /> Servicios (Presupuesto Mensual)
            </h3>
            <span className={`badge ${budgetServicesResult === 'OVER_BUDGET' ? 'badge-danger' : 'badge-success'}`}>
              {getBudgetStatusText(budgetServicesResult)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', textAlign: 'center', marginBottom: '0.85rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Límite Mensual</span>
              <div style={{ fontSize: '1.15rem', fontWeight: '600', color: '#f8fafc' }}>
                {formatMoney(presupuesto_servicios.budget_amount || presupuesto_servicios.limite_mensual || 1500, hideValues)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Gastado (Mes)</span>
              <div style={{ fontSize: '1.15rem', fontWeight: '600', color: '#f43f5e' }}>
                {formatMoney(presupuesto_servicios.actual_spent || presupuesto_servicios.gastado_mes || 0, hideValues)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Disponible (Mes)</span>
              <div style={{ fontSize: '1.15rem', fontWeight: '600', color: ((presupuesto_servicios.available_month ?? 0) < 0) ? '#f43f5e' : '#34d399' }}>
                {formatMoney(presupuesto_servicios.available_month || presupuesto_servicios.disponible_mes || 0, hideValues)}
              </div>
            </div>
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
            * Solo descuenta gastos de <strong>Servicios</strong>. Se reinicia el 1° de cada mes.
          </p>
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
  );
}
