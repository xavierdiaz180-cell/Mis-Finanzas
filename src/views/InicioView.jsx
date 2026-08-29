import React from 'react';
import { ShieldCheck, Wallet, ArrowUpRight, ArrowDownRight, Sparkles, Calendar, TrendingUp, AlertCircle, CreditCard } from 'lucide-react';
import { formatMoney } from '../utils/formatters';

export default function InicioView({ summary, onNavigate, hideValues = false }) {
  if (!summary) return <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>Cargando métricas financieras...</div>;

  const {
    disponible_hoy = 0,
    available_money = 0,
    total_inversiones = 0,
    total_deuda = 0,
    net_worth = 0,
    riqueza_neta = 0,
    salud_financiera = {},
    presupuesto_diario = {},
    coach_recomendacion_corta = ''
  } = summary;

  const displayAvailableMoney = available_money || (disponible_hoy + total_inversiones);
  const displayNetWorth = net_worth || riqueza_neta;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Top Indicators Grid: 4 Core Financial Blocks defined in Phase 2B */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
        
        {/* 1. DINERO DISPONIBLE (Liquidez + Inversiones) */}
        <div className="glass-card" style={{ borderLeft: '4px solid #60a5fa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              DINERO DISPONIBLE
            </span>
            <span className="badge badge-info">Liquidez + Inversiones</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '700', color: '#f8fafc', margin: '0.4rem 0' }}>
            {formatMoney(displayAvailableMoney, hideValues)}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Activos disponibles e Inversiones documentadas.
          </p>
        </div>

        {/* 2. PATRIMONIO NETO (Activos - Pasivos) */}
        <div className="glass-card" style={{ borderLeft: '4px solid #34d399' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              PATRIMONIO NETO
            </span>
            <span className="badge badge-success">Activos - Pasivos</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '700', color: displayNetWorth < 0 ? '#f43f5e' : '#34d399', margin: '0.4rem 0' }}>
            {formatMoney(displayNetWorth, hideValues)}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Disponible ({formatMoney(displayAvailableMoney, hideValues)}) - Deudas ({formatMoney(total_deuda, hideValues)})
          </p>
        </div>

        {/* 3. DEUDA TOTAL (Tarjetas + Préstamos) */}
        <div className="glass-card" style={{ borderLeft: '4px solid #f43f5e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              PASIVOS Y DEUDAS
            </span>
            <span className="badge badge-danger">Tarjetas + MSI + Deudas</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '700', color: '#f43f5e', margin: '0.4rem 0' }}>
            {formatMoney(total_deuda, hideValues)}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Total de saldos pendientes en tarjetas y préstamos.
          </p>
        </div>

        {/* 4. SALUD FINANCIERA */}
        <div className="glass-card" style={{ borderLeft: '4px solid #fbbf24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              SALUD FINANCIERA
            </span>
            <span className="badge badge-warning">{salud_financiera.etiqueta || 'Buena'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', margin: '0.4rem 0' }}>
            <span style={{ fontSize: '2.2rem', fontWeight: '700', color: '#fbbf24' }}>
              {salud_financiera.score || 0}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>/ 100</span>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
            {salud_financiera.explicacion}
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
            <span className={`badge ${presupuesto_diario.result === 'OVER_BUDGET' ? 'badge-danger' : 'badge-success'}`}>
              {presupuesto_diario.result || 'ON_BUDGET'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center', marginBottom: '1.2rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Límite Diario</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#f8fafc' }}>
                {formatMoney(presupuesto_diario.budget_amount || presupuesto_diario.limite_diario || 200, hideValues)}
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
