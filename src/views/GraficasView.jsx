import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, LabelList
} from 'recharts';
import { TrendingUp, TrendingDown, PiggyBank, Wallet, RefreshCw, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { API_BASE } from '../config';
import { formatMoney } from '../utils/formatters';

const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#a3e635',
  '#e879f9', '#fb923c', '#34d399', '#60a5fa', '#fbbf24'
];

const RIESGO_COLOR = { low: '#10b981', medium: '#f59e0b', high: '#f43f5e' };

function CustomTooltipPesos({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(139,92,246,0.4)',
      borderRadius: '10px',
      padding: '0.75rem 1rem',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
    }}>
      <p style={{ color: '#a78bfa', fontWeight: '600', marginBottom: '0.4rem', fontSize: '0.85rem' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#f8fafc' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          <span style={{ fontWeight: '700' }}>${(parseFloat(p.value) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
        </div>
      ))}
    </div>
  );
}

function CustomTooltipPie({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0];
  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(139,92,246,0.4)',
      borderRadius: '10px',
      padding: '0.75rem 1rem',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
    }}>
      <p style={{ color: d.payload.fill, fontWeight: '700', marginBottom: '0.2rem', fontSize: '0.88rem' }}>{d.name}</p>
      <p style={{ color: '#f8fafc', fontSize: '0.9rem' }}>${(parseFloat(d.value) || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{d.payload.count} transacciones</p>
    </div>
  );
}

export default function GraficasView({ hideValues = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('inversiones');

  const loadData = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/charts/data`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { console.error('Error cargando gráficas:', err); setLoading(false); });
  };

  useEffect(() => { loadData(); }, []);

  const sectionBtns = [
    { id: 'inversiones', label: 'Inversiones', icon: PiggyBank, color: '#10b981' },
    { id: 'gastos', label: 'Gastos', icon: TrendingDown, color: '#f43f5e' },
    { id: 'flujo', label: 'Ingresos vs Gastos', icon: Activity, color: '#6366f1' },
    { id: 'balance', label: 'Saldo Disponible', icon: Wallet, color: '#60a5fa' },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem', gap: '1rem' }}>
        <div style={{ width: 48, height: 48, border: '4px solid rgba(139,92,246,0.3)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Cargando datos de gráficas...</p>
      </div>
    );
  }

  const { investmentTimeline = [], investmentSummary = {}, expensesByCategory = [], monthlyFlow = [], balanceTimeline = [] } = data || {};

  // Format month labels
  const monthlyFlowFormatted = monthlyFlow.map(m => ({
    ...m,
    label: m.month ? new Date(m.month + '-01').toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }) : m.month,
    income: parseFloat(m.income) || 0,
    expenses: parseFloat(m.expenses) || 0,
    net: parseFloat(m.net) || 0
  }));

  const balanceFormatted = balanceTimeline.map(d => ({
    ...d,
    label: d.date ? new Date(d.date + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : d.date,
    balance: parseFloat(d.balance) || 0,
    income: parseFloat(d.income) || 0,
    expenses: parseFloat(d.expenses) || 0
  }));

  const pieData = expensesByCategory.slice(0, 12).map((cat, i) => ({
    name: cat.category || 'Sin categoría',
    value: parseFloat(cat.total) || 0,
    count: cat.count || 0,
    fill: CHART_COLORS[i % CHART_COLORS.length]
  }));

  const isPositiveReturn = (investmentSummary.totalReturn || 0) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={26} /> Gráficas Financieras
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Visualización cronológica de tus inversiones, gastos, ingresos y saldo disponible.
          </p>
        </div>
        <button
          onClick={loadData}
          className="nav-tab-btn"
          style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa', padding: '0.6rem 1rem' }}
        >
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '14px', border: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
        {sectionBtns.map(btn => {
          const Icon = btn.icon;
          const isActive = activeSection === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => setActiveSection(btn.id)}
              style={{
                flex: 1,
                minWidth: '120px',
                padding: '0.6rem 0.75rem',
                borderRadius: '10px',
                border: 'none',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                transition: 'all 0.2s',
                background: isActive ? `${btn.color}22` : 'transparent',
                color: isActive ? btn.color : 'var(--text-secondary)',
                borderBottom: isActive ? `2px solid ${btn.color}` : '2px solid transparent',
                boxShadow: isActive ? `0 0 14px ${btn.color}33` : 'none'
              }}
            >
              <Icon size={15} />
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* INVERSIONES SECTION */}
      {activeSection === 'inversiones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* ROI Summary Banner */}
          <div className="glass-card" style={{
            borderLeft: `4px solid ${isPositiveReturn ? '#10b981' : '#f43f5e'}`,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1.25rem',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute', top: 0, right: 0, padding: '0.5rem 1rem',
              background: isPositiveReturn ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
              borderBottomLeftRadius: '12px',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              color: isPositiveReturn ? '#10b981' : '#f43f5e',
              fontSize: '0.82rem', fontWeight: '700'
            }}>
              {isPositiveReturn ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              Rendimiento Total: {isPositiveReturn ? '+' : ''}{investmentSummary.totalReturnPct}%
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CAPITAL INVERTIDO</span>
              <div style={{ fontSize: '1.7rem', fontWeight: '700' }}>{formatMoney(investmentSummary.totalInvested, hideValues)}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>VALOR ACTUAL PORTAFOLIO</span>
              <div style={{ fontSize: '1.7rem', fontWeight: '700', color: '#34d399' }}>{formatMoney(investmentSummary.totalCurrentValue, hideValues)}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>GANANCIA / PÉRDIDA</span>
              <div style={{ fontSize: '1.7rem', fontWeight: '700', color: isPositiveReturn ? '#34d399' : '#f43f5e' }}>
                {isPositiveReturn ? '+' : ''}{formatMoney(investmentSummary.totalReturn, hideValues)}
              </div>
            </div>
          </div>

          {investmentTimeline.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <PiggyBank size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
              <p>No tienes inversiones registradas aún.</p>
            </div>
          ) : (
            <>
              {/* Bar chart: Invested vs Current Value per investment */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem', color: '#f8fafc' }}>
                  📊 Capital Invertido vs Valor Actual por Inversión
                </h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={investmentTimeline} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltipPesos />} />
                    <Legend wrapperStyle={{ paddingTop: '16px', color: '#94a3b8', fontSize: '0.82rem' }} />
                    <Bar dataKey="invested" name="Capital Invertido" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="current" name="Valor Actual" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Rendimiento % per investment */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1.25rem', color: '#f8fafc' }}>
                  📈 Rendimiento (%) por Inversión
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={investmentTimeline} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Rendimiento']}
                      contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '10px', color: '#f8fafc' }}
                    />
                    <Bar dataKey="returnPct" name="Rendimiento %" radius={[6, 6, 0, 0]}>
                      {investmentTimeline.map((entry, i) => (
                        <Cell key={i} fill={entry.returnPct >= 0 ? '#10b981' : '#f43f5e'} />
                      ))}
                      <LabelList dataKey="returnPct" position="top" formatter={v => `${v > 0 ? '+' : ''}${v}%`} style={{ fill: '#f8fafc', fontSize: 11, fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Cards per investment */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
                {investmentTimeline.map((inv, i) => (
                  <div key={i} className="glass-card" style={{
                    borderLeft: `4px solid ${inv.returnPct >= 0 ? '#10b981' : '#f43f5e'}`,
                    padding: '1rem 1.25rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{inv.name}</span>
                      <span style={{
                        background: `${RIESGO_COLOR[inv.riskLevel] || '#6366f1'}22`,
                        color: RIESGO_COLOR[inv.riskLevel] || '#6366f1',
                        fontSize: '0.72rem', fontWeight: '600', padding: '0.2rem 0.5rem', borderRadius: '6px'
                      }}>
                        {inv.riskLevel === 'low' ? 'Bajo' : inv.riskLevel === 'high' ? 'Alto' : 'Medio'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', fontSize: '0.82rem' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>INVERTIDO</div>
                        <div style={{ fontWeight: '600' }}>{formatMoney(inv.invested, hideValues)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>VALOR ACTUAL</div>
                        <div style={{ fontWeight: '600', color: '#34d399' }}>{formatMoney(inv.current, hideValues)}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>GANANCIA/PÉRDIDA</div>
                        <div style={{ fontWeight: '700', color: inv.gainLoss >= 0 ? '#34d399' : '#f43f5e' }}>
                          {inv.gainLoss >= 0 ? '+' : ''}{formatMoney(inv.gainLoss, hideValues)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>RENDIMIENTO</div>
                        <div style={{ fontWeight: '700', fontSize: '1.05rem', color: inv.returnPct >= 0 ? '#10b981' : '#f43f5e' }}>
                          {inv.returnPct >= 0 ? '+' : ''}{inv.returnPct}%
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      Última actualización: {inv.lastUpdate}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* GASTOS SECTION */}
      {activeSection === 'gastos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {pieData.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <TrendingDown size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
              <p>No hay gastos registrados en los últimos 12 meses.</p>
            </div>
          ) : (
            <>
              {/* Pie chart + legend */}
              <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>🥧 Gastos por Categoría (Últimos 12 meses)</h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={130}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltipPie />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Category breakdown legend */}
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '320px', overflowY: 'auto' }}>
                    {pieData.map((cat, i) => {
                      const totalExpenses = pieData.reduce((s, c) => s + c.value, 0);
                      const pct = totalExpenses > 0 ? ((cat.value / totalExpenses) * 100).toFixed(1) : 0;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.65rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.fill, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: '0.82rem', color: '#e2e8f0', fontWeight: '500' }}>{cat.name}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{pct}%</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: '700', color: cat.fill }}>${(cat.value).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem', borderRadius: '10px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.25)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '600' }}>TOTAL GASTADO (12 MESES)</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f43f5e' }}>
                      ${pieData.reduce((s, c) => s + c.value, 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bar chart: top categories */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>📊 Gastos por Categoría (Barras)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pieData.slice(0, 10)} margin={{ top: 10, right: 20, left: 10, bottom: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-40} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltipPesos />} />
                    <Bar dataKey="value" name="Total Gastado" radius={[6, 6, 0, 0]}>
                      {pieData.slice(0, 10).map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* FLUJO MENSUAL SECTION */}
      {activeSection === 'flujo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {monthlyFlowFormatted.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Activity size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
              <p>No hay transacciones registradas en los últimos 12 meses.</p>
            </div>
          ) : (
            <>
              {/* Stacked bar: income vs expenses per month */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>📅 Ingresos vs Gastos Mensuales (Últimos 12 meses)</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={monthlyFlowFormatted} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltipPesos />} />
                    <Legend wrapperStyle={{ paddingTop: '10px', color: '#94a3b8', fontSize: '0.82rem' }} />
                    <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expenses" name="Gastos" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Net monthly line chart */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>📈 Flujo Neto Mensual (Ingresos − Gastos)</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={monthlyFlowFormatted} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                    <defs>
                      <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltipPesos />} />
                    <Area type="monotone" dataKey="net" name="Flujo Neto" stroke="#6366f1" fill="url(#netGrad)" strokeWidth={2.5} dot={{ fill: '#6366f1', r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {/* BALANCE SECTION */}
      {activeSection === 'balance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {balanceFormatted.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Wallet size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
              <p>No hay transacciones en los últimos 90 días.</p>
            </div>
          ) : (
            <>
              {/* Balance timeline area */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>💰 Evolución del Saldo Disponible (Últimos 90 días)</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={balanceFormatted} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                    <defs>
                      <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} interval={Math.max(0, Math.floor(balanceFormatted.length / 10) - 1)} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltipPesos />} />
                    <Area type="monotone" dataKey="balance" name="Saldo Acumulado" stroke="#60a5fa" fill="url(#balGrad)" strokeWidth={2.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Daily income vs expenses */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '1rem' }}>📊 Ingresos y Gastos Diarios</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={balanceFormatted} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} interval={Math.max(0, Math.floor(balanceFormatted.length / 10) - 1)} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltipPesos />} />
                    <Legend wrapperStyle={{ paddingTop: '10px', color: '#94a3b8', fontSize: '0.82rem' }} />
                    <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Gastos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
