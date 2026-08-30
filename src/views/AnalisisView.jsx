import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Calendar, PieChart, DollarSign, Plus, Trash2, Shield, AlertCircle, Sparkles, Target, Zap, ShieldAlert, CheckCircle2, RefreshCw, FileSpreadsheet } from 'lucide-react';
import ExportExcelModal from '../components/ExportExcelModal';
import { API_BASE } from '../config';

export default function AnalisisView({ onRefresh }) {
  const [analysisData, setAnalysisData] = useState(null);
  const [recurringExpenses, setRecurringExpenses] = useState([]);
  const [accounts, setAccounts] = useState([]);

  // AI Deep Analysis
  const [deepAnalysis, setDeepAnalysis] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [showExcelExport, setShowExcelExport] = useState(false);

  // Form Recurring Expense
  const [showAddRecurringModal, setShowAddRecurringModal] = useState(false);
  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState('Servicios');
  const [frequency, setFrequency] = useState('monthly');
  const [amount, setAmount] = useState('');
  const [variableAmount, setVariableAmount] = useState(false);
  const [accountId, setAccountId] = useState('');


  const [loadError, setLoadError] = useState(null);

  const loadData = () => {
    setLoadError(null);
    fetch(`${API_BASE}/api/analysis`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data.error) throw new Error(data.error);
        setAnalysisData(data);
      })
      .catch(err => {
        console.error('Error al cargar análisis:', err);
        setLoadError(err.message);
      });

    fetch(`${API_BASE}/api/recurring`)
      .then(res => res.json())
      .then(data => setRecurringExpenses(Array.isArray(data) ? data : []))
      .catch(err => console.error('Error al cargar recurrentes:', err));

    fetch(`${API_BASE}/api/accounts`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAccounts(data);
          if (data.length > 0) setAccountId(data[0].id);
        }
      })
      .catch(err => console.error('Error al cargar cuentas:', err));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddRecurring = (e) => {
    e.preventDefault();
    if (!concept || amount === '') return alert('Concepto y monto son requeridos.');

    fetch('/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concept,
        category,
        frequency,
        amount: parseFloat(amount),
        variable_amount: variableAmount ? 1 : 0,
        account_id: accountId ? parseInt(accountId, 10) : null
      })
    })
      .then(res => res.json())
      .then(() => {
        setShowAddRecurringModal(false);
        setConcept('');
        setAmount('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al agregar gasto recurrente: ' + err.message));
  };
  const handleDeleteRecurring = (id) => {
    fetch(`/api/recurring/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => {
        loadData();
        if (onRefresh) onRefresh();
      });
  };

  const handleGenerateDeepAnalysis = () => {
    setLoadingAi(true);
    fetch(`${API_BASE}/api/analysis/deep`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setDeepAnalysis(data);
        setLoadingAi(false);
      })
      .catch(err => {
        console.error('Error al generar análisis IA:', err);
        setLoadingAi(false);
        alert('Ocurrió un error al generar el análisis estratégico con IA.');
      });
  };

  if (loadError) {
    return (
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
        <AlertCircle size={36} style={{ color: '#f43f5e', margin: '0 auto 1rem' }} />
        <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Error al cargar datos de análisis</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>{loadError}</p>
        <button onClick={loadData} className="nav-tab-btn active" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto' }}>
          <RefreshCw size={15} /> Reintentar
        </button>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 1rem', gap: '1rem' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Cargando datos de análisis...</p>
      </div>
    );
  }

  const {
    monthly_trends = [],
    categories_breakdown = [],
    savings_capacity = {},
    mom_comparison = {},
    forecast_30_days = {},
    current_metrics = {}
  } = analysisData;

  const maxTrendAmount = Math.max(1, ...monthly_trends.map(t => Math.max(t.income, t.expense)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={24} /> Análisis Financiero y Proyecciones
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Visualiza tendencias de ingresos vs gastos, distribución por categoría, evolución patrimonial y análisis estratégico IA.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setShowExcelExport(true)}
            className="nav-tab-btn"
            style={{
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
              padding: '0.75rem 1.25rem',
              fontWeight: '600',
              fontSize: '0.9rem',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}
          >
            <FileSpreadsheet size={18} /> Exportar a Excel (.xlsx)
          </button>

          <button
            onClick={handleGenerateDeepAnalysis}
            disabled={loadingAi}
            className="nav-tab-btn active"
            style={{
              background: 'linear-gradient(135deg, #a78bfa 0%, #3b82f6 100%)',
              border: 'none',
              color: 'white',
              padding: '0.75rem 1.25rem',
              fontWeight: '600',
              fontSize: '0.9rem',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 15px rgba(167, 139, 250, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: loadingAi ? 'wait' : 'pointer',
              opacity: loadingAi ? 0.7 : 1
            }}
          >
            {loadingAi ? <RefreshCw size={18} className="spin" /> : <Sparkles size={18} />}
            {loadingAi ? 'Generando Estrategia IA...' : ' Generar Análisis Estratégico IA'}
          </button>
        </div>
      </div>

      {/* AI Deep Analysis Result Section */}
      {deepAnalysis && (
        <div className="glass-card" style={{ border: '1px solid rgba(167, 139, 250, 0.4)', background: 'linear-gradient(180deg, rgba(167, 139, 250, 0.05) 0%, rgba(15, 23, 42, 0.8) 100%)' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
            <Sparkles size={22} style={{ color: '#a78bfa' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
              Informe Estratégico Personalizado (IA Gemini)
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* 1. Diagnóstico */}
            {deepAnalysis.diagnostico && (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ color: '#60a5fa', fontSize: '1rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  🩺 Diagnóstico Financiero
                </h4>
                <p style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: '1.5', marginBottom: '0.75rem' }}>
                  {deepAnalysis.diagnostico.resumen}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                  {deepAnalysis.diagnostico.puntos_fuertes?.length > 0 && (
                    <div style={{ background: 'rgba(52, 211, 153, 0.08)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#34d399', marginBottom: '0.35rem' }}>✅ Puntos Fuertes:</div>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.83rem', color: '#cbd5e1' }}>
                        {deepAnalysis.diagnostico.puntos_fuertes.map((pf, idx) => <li key={idx}>{pf}</li>)}
                      </ul>
                    </div>
                  )}

                  {deepAnalysis.diagnostico.puntos_mejora?.length > 0 && (
                    <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#f59e0b', marginBottom: '0.35rem' }}>🎯 Oportunidades de Mejora:</div>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.83rem', color: '#cbd5e1' }}>
                        {deepAnalysis.diagnostico.puntos_mejora.map((pm, idx) => <li key={idx}>{pm}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Grid 2 Columnas: Deudas e Inversión */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              
              {/* Estrategia Deudas */}
              {deepAnalysis.estrategia_deudas && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ color: '#f43f5e', fontSize: '0.98rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    🔥 Estrategia de Deudas: {deepAnalysis.estrategia_deudas.titulo}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.75rem' }}>
                    {deepAnalysis.estrategia_deudas.recomendacion}
                  </p>

                  {deepAnalysis.estrategia_deudas.orden_pago?.length > 0 && (
                    <div style={{ fontSize: '0.82rem', marginBottom: '0.5rem' }}>
                      <strong style={{ color: 'var(--text-muted)' }}>Orden sugerido de liquidación:</strong>
                      <ol style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.2rem', color: '#f8fafc' }}>
                        {deepAnalysis.estrategia_deudas.orden_pago.map((op, idx) => <li key={idx}>{op}</li>)}
                      </ol>
                    </div>
                  )}

                  {deepAnalysis.estrategia_deudas.ahorro_estimado && (
                    <div style={{ fontSize: '0.8rem', color: '#34d399', fontWeight: '600', marginTop: '0.5rem' }}>
                      💡 Ahorro Estimado: {deepAnalysis.estrategia_deudas.ahorro_estimado}
                    </div>
                  )}
                </div>
              )}

              {/* Estrategia Inversión */}
              {deepAnalysis.estrategia_inversion && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ color: '#34d399', fontSize: '0.98rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    💹 {deepAnalysis.estrategia_inversion.titulo || 'Estrategia de Inversión'}
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.75rem' }}>
                    {deepAnalysis.estrategia_inversion.recomendacion}
                  </p>

                  {deepAnalysis.estrategia_inversion.distribucion_sugerida?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>DISTRIBUCIÓN RECOMENDADA DE CAPITAL:</span>
                      {deepAnalysis.estrategia_inversion.distribucion_sugerida.map((dist, idx) => (
                        <div key={idx}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                            <span>{dist.instrumento}</span>
                            <span style={{ fontWeight: '700', color: '#34d399' }}>{dist.porcentaje}%</span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${dist.porcentaje}%`, height: '100%', background: '#34d399' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Plan de Acción 30-60-90 días */}
            {deepAnalysis.plan_accion && (
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ color: '#a78bfa', fontSize: '0.98rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  📆 Plan de Acción por Fases (30 - 60 - 90 Días)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                  
                  <div style={{ background: 'rgba(167, 139, 250, 0.08)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #a78bfa' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.82rem', color: '#a78bfa', marginBottom: '0.35rem' }}>PRÓXIMOS 30 DÍAS</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem', color: '#e2e8f0' }}>
                      {deepAnalysis.plan_accion.dias_30?.map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                  </div>

                  <div style={{ background: 'rgba(96, 165, 250, 0.08)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #60a5fa' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.82rem', color: '#60a5fa', marginBottom: '0.35rem' }}>A 60 DÍAS</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem', color: '#e2e8f0' }}>
                      {deepAnalysis.plan_accion.dias_60?.map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                  </div>

                  <div style={{ background: 'rgba(52, 211, 153, 0.08)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #34d399' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.82rem', color: '#34d399', marginBottom: '0.35rem' }}>A 90 DÍAS</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem', color: '#e2e8f0' }}>
                      {deepAnalysis.plan_accion.dias_90?.map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                  </div>

                </div>
              </div>
            )}

            {/* Libertad Financiera & Alertas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              
              {deepAnalysis.libertad_financiera && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ color: '#fbbf24', fontSize: '0.95rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    🎯 Ruta hacia Libertad Financiera
                  </h4>
                  <p style={{ fontSize: '0.83rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                    {deepAnalysis.libertad_financiera.analisis}
                  </p>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <strong>Ritmo:</strong> {deepAnalysis.libertad_financiera.ritmo_actual}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#34d399', marginTop: '0.25rem' }}>
                    <strong>Ajuste mensual sugerido:</strong> {deepAnalysis.libertad_financiera.ajuste_sugerido}
                  </div>
                </div>
              )}

              {deepAnalysis.alertas?.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ color: '#f8fafc', fontSize: '0.95rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    ⚠️ Alertas y Advertencias Detectadas
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {deepAnalysis.alertas.map((alt, idx) => (
                      <div key={idx} style={{
                        fontSize: '0.82rem',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        background: alt.tipo === 'danger' ? 'rgba(244, 63, 94, 0.15)' : alt.tipo === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: alt.tipo === 'danger' ? '#f43f5e' : alt.tipo === 'warning' ? '#f59e0b' : '#60a5fa',
                        border: `1px solid ${alt.tipo === 'danger' ? 'rgba(244, 63, 94, 0.3)' : alt.tipo === 'warning' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
                      }}>
                        {alt.mensaje}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* MoM Indicators & Savings Capacity Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        
        <div className="glass-card" style={{ borderLeft: '4px solid #34d399' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>CAPACIDAD DE AHORRO DEL MES</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#34d399', margin: '0.3rem 0' }}>
            {savings_capacity.percentage.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Sobrante retencion: ${savings_capacity.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ borderLeft: '4px solid #60a5fa' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>VARIACIÓN INGRESOS MES A MES</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: mom_comparison.income_change_pct >= 0 ? '#34d399' : '#f43f5e', margin: '0.3rem 0' }}>
            {mom_comparison.income_change_pct >= 0 ? '+' : ''}{mom_comparison.income_change_pct.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Comparado contra el mes anterior</div>
        </div>

        <div className="glass-card" style={{ borderLeft: '4px solid #f43f5e' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>VARIACIÓN GASTOS MES A MES</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '700', color: mom_comparison.expense_change_pct <= 0 ? '#34d399' : '#f43f5e', margin: '0.3rem 0' }}>
            {mom_comparison.expense_change_pct >= 0 ? '+' : ''}{mom_comparison.expense_change_pct.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Comparado contra el mes anterior</div>
        </div>

      </div>

      {/* Main Charts Row: Ingresos vs Gastos + Categorías */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        
        {/* Chart 1: Ingresos vs Gastos por Mes */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={18} style={{ color: '#60a5fa' }} /> Ingresos vs. Gastos (Últimos 6 Meses)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {monthly_trends.map(t => (
              <div key={t.month}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: '600', color: '#f8fafc' }}>{t.month_label}</span>
                  <span>Ingreso: <strong style={{ color: '#34d399' }}>${t.income.toLocaleString()}</strong> | Gasto: <strong style={{ color: '#f43f5e' }}>${t.expense.toLocaleString()}</strong></span>
                </div>
                
                {/* Income Bar */}
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', marginBottom: '3px' }}>
                  <div style={{ width: `${(t.income / maxTrendAmount) * 100}%`, height: '100%', background: '#34d399' }} />
                </div>
                
                {/* Expense Bar */}
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(t.expense / maxTrendAmount) * 100}%`, height: '100%', background: '#f43f5e' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 2: Gastos por Categoría */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PieChart size={18} style={{ color: '#a78bfa' }} /> Distribución de Gastos por Categoría
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {categories_breakdown.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No hay gastos en el mes actual.</div>
            ) : (
              categories_breakdown.map(c => (
                <div key={c.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span>{c.category}</span>
                    <span style={{ fontWeight: '600' }}>${c.total.toLocaleString('es-MX')} ({c.percentage.toFixed(1)}%)</span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${c.percentage}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6 0%, #a78bfa 100%)' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Patrimonial Breakdown: Liquidez, Inversiones, Deuda, Riqueza Neta */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Evolución y Desglose Patrimonial</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DINERO DISPONIBLE HOY</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#60a5fa' }}>
              ${current_metrics.disponible_hoy?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>VALOR INVERSIONES</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#34d399' }}>
              ${current_metrics.total_inversiones?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DEUDA TOTAL</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#f43f5e' }}>
              ${current_metrics.total_deuda?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glow)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RIQUEZA NETA REAL</span>
            <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#34d399' }}>
              ${current_metrics.riqueza_neta?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Proyección a 30 Días y Gastos Recurrentes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        
        {/* Proyección a 30 Días */}
        <div className="glass-card" style={{ borderLeft: '4px solid #a78bfa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={18} style={{ color: '#a78bfa' }} /> Predicción de Gastos a 30 Días
            </h3>
            <span style={{ fontSize: '1.2rem', fontWeight: '700', color: '#a78bfa' }}>
              ${forecast_30_days.projected_total?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Basado en tus gastos recurrentes activos, pagos mensuales de deudas y mensualidades de MSI.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
            {forecast_30_days.items?.map((item, index) => (
              <div key={index} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', border: '1px solid var(--border-subtle)' }}>
                <div>
                  <div style={{ fontWeight: '600' }}>{item.concept}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.type} {item.frequency ? `(${item.frequency})` : ''}</div>
                </div>
                <div style={{ fontWeight: '700', color: '#f43f5e' }}>
                  ${item.monthly_amount.toLocaleString('es-MX')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gestor de Gastos Recurrentes */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem' }}>Gestión de Gastos Recurrentes</h3>
            <button onClick={() => setShowAddRecurringModal(true)} className="nav-tab-btn active" style={{ padding: '0.5rem 0.85rem', fontSize: '0.82rem' }}>
              + Agregar Recurrente
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
            {recurringExpenses.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem' }}>No tienes gastos recurrentes configurados.</div>
            ) : (
              recurringExpenses.map(r => (
                <div key={r.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>{r.concept}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.category} · {r.frequency} {r.variable_amount ? '(Variable)' : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: '700', color: '#f43f5e', fontSize: '0.9rem' }}>${r.amount.toLocaleString('es-MX')}</span>
                    <button onClick={() => handleDeleteRecurring(r.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={15} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Modal Agregar Gasto Recurrente */}
      {showAddRecurringModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="glass-card" style={{ maxWidth: '440px', width: '100%' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1.25rem' }}>+ Agregar Gasto Recurrente</h3>

            <form onSubmit={handleAddRecurring} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Concepto:</label>
                <input type="text" value={concept} onChange={e => setConcept(e.target.value)} placeholder="Ej. Renta Casa, Netflix, Gimnasio" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Categoría:</label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}>
                  <option value="Servicios">Servicios</option>
                  <option value="Alimentación">Alimentación</option>
                  <option value="Transporte">Transporte</option>
                  <option value="Entretenimiento">Entretenimiento</option>
                  <option value="Salud">Salud</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Frecuencia:</label>
                  <select value={frequency} onChange={e => setFrequency(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="monthly">Mensual</option>
                    <option value="bimonthly">Bimestral</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Monto ($):</label>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" step="0.01" style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} required />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="varAmt" checked={variableAmount} onChange={e => setVariableAmount(e.target.checked)} />
                <label htmlFor="varAmt" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Monto variable permitido</label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowAddRecurringModal(false)} style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '0.65rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" className="nav-tab-btn active" style={{ padding: '0.65rem 1.25rem' }}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showExcelExport && (
        <ExportExcelModal onClose={() => setShowExcelExport(false)} />
      )}
    </div>
  );
}
