import React from 'react';
import { ShieldCheck, Wallet, ArrowUpRight, ArrowDownRight, Sparkles, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import { formatMoney } from '../utils/formatters';

export default function InicioView({ summary, onNavigate, hideValues = false }) {
  if (!summary) return <div style={{ color: 'var(--text-muted)' }}>Cargando métricas...</div>;

  const {
    disponible_hoy = 0,
    total_inversiones = 0,
    total_deuda = 0,
    riqueza_neta = 0,
    riqueza_neta_raw = 0,
    salud_financiera = {},
    presupuesto_diario = {},
    coach_recomendacion_corta = ''
  } = summary;

  const isNetWorthNegative = riqueza_neta_raw <= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Top Indicators Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        
        {/* Disponible Hoy Card */}
        <div className="glass-card" style={{ borderLeft: '4px solid #60a5fa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              DISPONIBLE HOY
            </span>
            <span className="badge badge-info">Cuentas + Nómina + Efectivo</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '700', color: '#f8fafc', margin: '0.4rem 0' }}>
            {formatMoney(disponible_hoy, hideValues)}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            * Excluye inversiones según la regla de liquidez.
          </p>
        </div>

        {/* Riqueza Neta Card */}
        <div className="glass-card" style={{ borderLeft: '4px solid #34d399' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              RIQUEZA NETA
            </span>
            <span className="badge badge-success">Patrimonio Real</span>
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '700', color: isNetWorthNegative ? 'var(--text-muted)' : '#34d399', margin: '0.4rem 0' }}>
            {isNetWorthNegative ? (hideValues ? '••••••' : '0 / Nula') : formatMoney(riqueza_neta, hideValues)}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Disponible hoy ({formatMoney(disponible_hoy, hideValues)}) + Inversiones ({formatMoney(total_inversiones, hideValues)}) - Deuda ({formatMoney(total_deuda, hideValues)})
          </p>
        </div>

        {/* Salud Financiera Card */}
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

      {/* Middle Grid: Presupuesto Diario & Coach Recommendation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        
        {/* Presupuesto Diario Acumulable */}
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={18} style={{ color: '#60a5fa' }} /> Presupuesto Diario Acumulable
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Reinicia el día 1</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', textAlign: 'center', marginBottom: '1.2rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Límite Diario</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#f8fafc' }}>
                {formatMoney(presupuesto_diario.limite_diario || 200, hideValues)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gastado Hoy</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#f43f5e' }}>
                {formatMoney(presupuesto_diario.gastado_hoy || 0, hideValues)}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Disponible Hoy</span>
              <div style={{ fontSize: '1.2rem', fontWeight: '600', color: (presupuesto_diario.disponible_hoy < 0) ? '#f43f5e' : '#34d399' }}>
                {formatMoney(presupuesto_diario.disponible_hoy || 0, hideValues)}
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                Resumen disponible del mes completo:
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Presupuesto mes ({presupuesto_diario.dias_mes || 31} días × ${presupuesto_diario.limite_diario || 200}) - Gastos del mes
              </div>
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: '700', color: '#60a5fa' }}>
              {formatMoney(presupuesto_diario.acumulado_mes || 0, hideValues)}
            </span>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
            * El disponible diario renueva a +{formatMoney(presupuesto_diario.limite_diario || 200, hideValues)} pesos al iniciar el día de mañana.
          </p>
        </div>

        {/* Coach Financial Snippet */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Sparkles style={{ color: '#a78bfa' }} size={20} />
              <h3 style={{ fontSize: '1.1rem', color: '#a78bfa' }}>Recomendación del Coach IA</h3>
            </div>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: '1.5', fontStyle: 'italic', background: 'rgba(139, 92, 246, 0.08)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
              "{coach_recomendacion_corta || 'Analizando tus patrones financieros... Revisa tu saldo disponible e inversiones en las pestañas dedicadas.'}"
            </p>
          </div>
          
          <button 
            onClick={() => onNavigate('coach')}
            className="nav-tab-btn active" 
            style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}
          >
            Conversar con el Coach Financiero
          </button>
        </div>

      </div>

      {/* Bottom Section: Próximos Pagos */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} style={{ color: '#f59e0b' }} /> Próximos Pagos Registrados
        </h3>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
          No hay pagos vencidos ni próximos en las siguientes 48 horas.
        </div>
      </div>

    </div>
  );
}
