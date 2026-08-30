import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank, Activity,
  RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2, Info,
  ArrowUpRight, ArrowDownRight, Layers, Calendar, DollarSign,
  PieChart as PieIcon, Percent, Sparkles, ChevronRight
} from 'lucide-react';
import { API_BASE } from '../config';
import { formatMoney } from '../utils/formatters';

// Cohesive, limited 6-color palette (no rainbow confetti)
const PALETTE = {
  primary: '#3b82f6',     // Blue
  emerald: '#10b981',     // Green (Income / Positive / Liquid)
  rose: '#f43f5e',        // Red (Expense / Debt / Deficit)
  purple: '#8b5cf6',      // Purple (Net Worth / Inversiones)
  amber: '#f59e0b',       // Amber (MSI / Warning / Utilización)
  slate: '#64748b',       // Slate / Neutral / Otros
};

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'
];

/**
 * Custom Minimalist Currency Tooltip for Charts
 */
function ChartTooltip({ active, payload, label, hideValues }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: 'rgba(11, 15, 25, 0.95)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '10px',
      padding: '0.65rem 0.9rem',
      boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(10px)',
      minWidth: '140px'
    }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: '600', marginBottom: '0.35rem' }}>
        {label}
      </p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', fontSize: '0.8rem', marginTop: '0.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || p.stroke || p.fill }} />
            <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
          </div>
          <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>
            {hideValues ? '••••••' : `$${(parseFloat(p.value) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GraficasView({ hideValues = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState('12M'); // '3M' | '6M' | '12M' | 'YTD' | 'ALL'
  const [activeTraces, setActiveTraces] = useState({
    netWorth: true,
    liquid: true,
    debt: true
  });

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/charts/data`);
      if (!res.ok) throw new Error('Error al consultar datos');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error cargando análisis financiero:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter combined timeline based on selected period
  const filteredTimeline = useMemo(() => {
    if (!data?.patrimonioTimeline || data.patrimonioTimeline.length === 0) return [];
    const tl = data.patrimonioTimeline;
    const now = new Date();

    if (period === 'ALL') return tl;

    let cutoffDate;
    if (period === '3M') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    } else if (period === '6M') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    } else if (period === '12M') {
      cutoffDate = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
    } else if (period === 'YTD') {
      cutoffDate = new Date(now.getFullYear(), 0, 1);
    }

    const cutoffStr = cutoffDate ? cutoffDate.toISOString().split('T')[0] : '1970-01-01';
    const filtered = tl.filter(p => p.date >= cutoffStr);
    return filtered.length > 0 ? filtered : tl.slice(-10);
  }, [data?.patrimonioTimeline, period]);

  // Filter monthly flow based on selected period
  const filteredMonthlyFlow = useMemo(() => {
    if (!data?.monthlyFlow || data.monthlyFlow.length === 0) return [];
    if (period === '3M') return data.monthlyFlow.slice(-3);
    if (period === '6M') return data.monthlyFlow.slice(-6);
    if (period === '12M') return data.monthlyFlow.slice(-12);
    if (period === 'YTD') {
      const currentYear = new Date().getFullYear().toString();
      return data.monthlyFlow.filter(m => m.month && m.month.startsWith(currentYear));
    }
    return data.monthlyFlow;
  }, [data?.monthlyFlow, period]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6rem 1rem', gap: '1rem' }}>
        <div style={{ width: 44, height: 44, border: '3px solid rgba(59,130,246,0.2)', borderTopColor: PALETTE.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>Analizando finanzas y reconstruyendo métricas...</p>
      </div>
    );
  }

  const {
    summary = {},
    monthlyFlowSummary = {},
    expensesByCategory = [],
    debts = { cards: [], debtTimeline: [] },
    msi = { plans: [], projection: [] },
    investments = { list: [] },
    insights = []
  } = data || {};

  const isNetWorthPositive = (summary.net_worth || 0) >= 0;
  const isMonthNetPositive = (summary.this_month_net || 0) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', width: '100%', maxWidth: '1320px', margin: '0 auto' }}>

      {/* ─────────────────────────────────────────────────────────────
          1. HEADER & GLOBAL PERIOD SELECTOR
      ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Activity size={24} style={{ color: PALETTE.primary }} />
            Análisis Financiero
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginTop: '0.2rem' }}>
            Entiende cómo está evolucionando tu dinero, deuda y patrimonio.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Period Filter Buttons */}
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.3)',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)',
            gap: '2px'
          }}>
            {[
              { id: '3M', label: '3M' },
              { id: '6M', label: '6M' },
              { id: '12M', label: '12M' },
              { id: 'YTD', label: 'Este año' },
              { id: 'ALL', label: 'Todo' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{
                  background: period === p.id ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                  border: period === p.id ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                  color: period === p.id ? '#ffffff' : 'var(--text-secondary)',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '7px',
                  fontSize: '0.78rem',
                  fontWeight: period === p.id ? '600' : '500',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              padding: '0.45rem 0.8rem',
              borderRadius: '10px',
              fontSize: '0.82rem',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. FINANCIAL SUMMARY (5 KEY METRICS)
      ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem'
      }}>
        {/* Card 1: Patrimonio Neto */}
        <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${isNetWorthPositive ? PALETTE.purple : PALETTE.rose}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Patrimonio Neto
            </span>
            <Layers size={16} style={{ color: isNetWorthPositive ? PALETTE.purple : PALETTE.rose }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '700', color: isNetWorthPositive ? 'var(--text-primary)' : PALETTE.rose, letterSpacing: '-0.5px' }}>
            {formatMoney(summary.net_worth, hideValues)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>Activos menos pasivos</span>
          </div>
        </div>

        {/* Card 2: Liquidez Disponible */}
        <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${PALETTE.emerald}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Liquidez
            </span>
            <Wallet size={16} style={{ color: PALETTE.emerald }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            {formatMoney(summary.liquid_money, hideValues)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>Cuentas líquidas y débito</span>
          </div>
        </div>

        {/* Card 3: Deuda Total */}
        <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${PALETTE.rose}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Deuda Total
            </span>
            <CreditCard size={16} style={{ color: PALETTE.rose }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '700', color: summary.total_debt > 0 ? PALETTE.rose : 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            {formatMoney(summary.total_debt, hideValues)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>Tarjetas, préstamos y MSI</span>
          </div>
        </div>

        {/* Card 4: Inversiones */}
        <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${PALETTE.primary}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Inversiones
            </span>
            <PiggyBank size={16} style={{ color: PALETTE.primary }} />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            {formatMoney(summary.investment_value, hideValues)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>Rendimiento: {investments.totalReturnPct >= 0 ? '+' : ''}{investments.totalReturnPct}%</span>
          </div>
        </div>

        {/* Card 5: Flujo del Mes */}
        <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${isMonthNetPositive ? PALETTE.emerald : PALETTE.amber}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Flujo del Mes
            </span>
            {isMonthNetPositive ? <TrendingUp size={16} style={{ color: PALETTE.emerald }} /> : <TrendingDown size={16} style={{ color: PALETTE.amber }} />}
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '700', color: isMonthNetPositive ? PALETTE.emerald : PALETTE.amber, letterSpacing: '-0.5px' }}>
            {formatMoney(summary.this_month_net, hideValues)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>{isMonthNetPositive ? 'Superávit mensual' : 'Déficit mensual'}</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. AUTOMATIC FACTUAL INSIGHTS (HALLAZGOS REALES)
      ───────────────────────────────────────────────────────────── */}
      {insights && insights.length > 0 && (
        <div className="glass-card" style={{ padding: '1rem 1.25rem', background: 'rgba(15, 23, 42, 0.65)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Sparkles size={16} style={{ color: PALETTE.amber }} />
            <h3 style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Hallazgos y Diagnóstico Financiero
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {insights.map((item, idx) => {
              const borderCol = item.type === 'positive' ? PALETTE.emerald : item.type === 'warning' ? PALETTE.amber : item.type === 'danger' ? PALETTE.rose : PALETTE.primary;
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.6rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${borderCol}33`
                  }}
                >
                  <div style={{ marginTop: '2px', color: borderCol }}>
                    {item.type === 'positive' ? <CheckCircle2 size={15} /> : item.type === 'warning' ? <AlertTriangle size={15} /> : item.type === 'danger' ? <TrendingDown size={15} /> : <Info size={15} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-primary)' }}>{item.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem', lineHeight: '1.35' }}>{item.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. EVOLUCIÓN DEL PATRIMONIO (MAIN TIMELINE CHART)
      ───────────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              Evolución del Patrimonio
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Seguimiento histórico de tu riqueza neta, dinero disponible y nivel de deuda.
            </p>
          </div>

          {/* Trace Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTraces(prev => ({ ...prev, netWorth: !prev.netWorth }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                background: activeTraces.netWorth ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                border: `1px solid ${activeTraces.netWorth ? PALETTE.purple : 'var(--border-subtle)'}`,
                color: activeTraces.netWorth ? '#c084fc' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE.purple }} />
              Patrimonio Neto
            </button>

            <button
              onClick={() => setActiveTraces(prev => ({ ...prev, liquid: !prev.liquid }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                background: activeTraces.liquid ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                border: `1px solid ${activeTraces.liquid ? PALETTE.emerald : 'var(--border-subtle)'}`,
                color: activeTraces.liquid ? '#34d399' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE.emerald }} />
              Liquidez
            </button>

            <button
              onClick={() => setActiveTraces(prev => ({ ...prev, debt: !prev.debt }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                background: activeTraces.debt ? 'rgba(244, 63, 94, 0.2)' : 'transparent',
                border: `1px solid ${activeTraces.debt ? PALETTE.rose : 'var(--border-subtle)'}`,
                color: activeTraces.debt ? '#fb7185' : 'var(--text-muted)',
                cursor: 'pointer'
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE.rose }} />
              Deuda
            </button>
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
            No hay registros suficientes en este periodo para graficar el patrimonio.
          </div>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredTimeline} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.purple} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={PALETTE.purple} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.emerald} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={PALETTE.emerald} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.rose} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={PALETTE.rose} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  dy={6}
                />
                <YAxis
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={val => `$${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<ChartTooltip hideValues={hideValues} />} />
                {activeTraces.netWorth && (
                  <Area
                    type="monotone"
                    dataKey="net_worth"
                    name="Patrimonio Neto"
                    stroke={PALETTE.purple}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#netWorthGrad)"
                  />
                )}
                {activeTraces.liquid && (
                  <Area
                    type="monotone"
                    dataKey="available"
                    name="Liquidez"
                    stroke={PALETTE.emerald}
                    strokeWidth={1.8}
                    fillOpacity={1}
                    fill="url(#liquidGrad)"
                  />
                )}
                {activeTraces.debt && (
                  <Area
                    type="monotone"
                    dataKey="debt"
                    name="Deuda"
                    stroke={PALETTE.rose}
                    strokeWidth={1.8}
                    fillOpacity={1}
                    fill="url(#debtGrad)"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. TWO COLUMNS: INGRESOS VS GASTOS & GASTOS POR CATEGORÍA
      ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* Left Column: Ingresos vs Gastos */}
        <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Ingresos vs Gastos
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                ¿Estás generando o consumiendo dinero?
              </p>
            </div>
            <div style={{
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: '700',
              background: isMonthNetPositive ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
              color: isMonthNetPositive ? '#34d399' : '#fb7185',
              border: `1px solid ${isMonthNetPositive ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`
            }}>
              {isMonthNetPositive ? 'Generando dinero' : 'Consumiendo dinero'}
            </div>
          </div>

          {/* Mini summary badges */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem',
            marginBottom: '1rem',
            padding: '0.6rem',
            borderRadius: '8px',
            background: 'rgba(0,0,0,0.25)'
          }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Este mes (Neto)</div>
              <div style={{ fontWeight: '700', fontSize: '0.88rem', color: isMonthNetPositive ? PALETTE.emerald : PALETTE.rose }}>
                {formatMoney(monthlyFlowSummary.thisMonth?.net, hideValues, 0)}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Promedio 6M</div>
              <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                {formatMoney(monthlyFlowSummary.avg6Months?.net, hideValues, 0)}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Var. Gastos MoM</div>
              <div style={{ fontWeight: '700', fontSize: '0.88rem', color: (monthlyFlowSummary.expenseMomPct || 0) <= 0 ? PALETTE.emerald : PALETTE.rose }}>
                {(monthlyFlowSummary.expenseMomPct || 0) > 0 ? '+' : ''}{monthlyFlowSummary.expenseMomPct || 0}%
              </div>
            </div>
          </div>

          <div style={{ width: '100%', height: 240, flexGrow: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredMonthlyFlow} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={10} tickLine={false} dy={4} />
                <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip hideValues={hideValues} />} />
                <Bar dataKey="income" name="Ingresos" fill={PALETTE.emerald} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="expenses" name="Gastos" fill={PALETTE.rose} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Column: Gastos por Categoría */}
        <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Gastos por Categoría
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Principales destinos de tus recursos (Top 5 + Otros).
              </p>
            </div>
          </div>

          {expensesByCategory.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Sin gastos registrados en el periodo seleccionado.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.25rem' }}>
              {expensesByCategory.map((cat, idx) => {
                const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{cat.category}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>({cat.count} movs)</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>
                          {formatMoney(cat.total, hideValues, 0)}
                        </span>
                        <span style={{ color: color, fontWeight: '700', fontSize: '0.78rem', minWidth: '38px', textAlign: 'right' }}>
                          {cat.percentage}%
                        </span>
                      </div>
                    </div>
                    {/* Horizontal Progress Bar */}
                    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, Math.max(2, cat.percentage))}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          6. TWO COLUMNS: DEUDA Y TARJETAS & MESES SIN INTERESES (MSI)
      ───────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* Left: Deuda & Tarjetas de Crédito */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Tarjetas y Utilización de Crédito
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Capacidad utilizada sobre tus límites de crédito.
              </p>
            </div>
            <span style={{ color: PALETTE.rose, fontSize: '0.85rem', fontWeight: '700' }}>
              {formatMoney(debts.total_debt, hideValues)} total
            </span>
          </div>

          {(!debts.cards || debts.cards.length === 0) ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No tienes tarjetas de crédito registradas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {debts.cards.map((card, i) => {
                const util = card.utilization_pct || 0;
                const barColor = util > 75 ? PALETTE.rose : util > 40 ? PALETTE.amber : PALETTE.emerald;
                return (
                  <div key={card.id || i} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: '600', fontSize: '0.86rem', color: 'var(--text-primary)' }}>{card.name}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: barColor }}>{util}% usado</span>
                    </div>

                    <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.45rem' }}>
                      <div style={{ width: `${Math.min(100, Math.max(0, util))}%`, height: '100%', background: barColor, borderRadius: '3px' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      <span>Saldo: <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(card.balance, hideValues)}</strong></span>
                      <span>Disponible: <strong style={{ color: PALETTE.emerald }}>{formatMoney(card.available_credit, hideValues)}</strong></span>
                      <span>Límite: <strong style={{ color: 'var(--text-secondary)' }}>{formatMoney(card.credit_limit, hideValues)}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Meses Sin Intereses (MSI) */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Meses Sin Intereses (MSI)
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Compromisos mensuales y amortización proyectada.
              </p>
            </div>
            <span style={{ color: PALETTE.amber, fontSize: '0.85rem', fontWeight: '700' }}>
              {formatMoney(msi.total_msi_remaining, hideValues)}
            </span>
          </div>

          {/* MSI Top KPI pill */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.5rem',
            marginBottom: '1rem',
            padding: '0.6rem',
            borderRadius: '8px',
            background: 'rgba(0,0,0,0.25)'
          }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Total pendiente</div>
              <div style={{ fontWeight: '700', fontSize: '0.88rem', color: PALETTE.amber }}>
                {formatMoney(msi.total_msi_remaining, hideValues, 0)}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Pago mensual</div>
              <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                {formatMoney(msi.total_monthly_commitment, hideValues, 0)}/m
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Planes activos</div>
              <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                {msi.active_plans_count || 0}
              </div>
            </div>
          </div>

          {/* MSI Amortization Curve */}
          {msi.projection && msi.projection.length > 1 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Proyección de saldo MSI (próximos meses):
              </div>
              <div style={{ width: '100%', height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={msi.projection} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={9} tickLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip content={<ChartTooltip hideValues={hideValues} />} />
                    <Area type="monotone" dataKey="balance" name="Saldo MSI" stroke={PALETTE.amber} fill={PALETTE.amber} fillOpacity={0.15} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* MSI Plans List */}
          {(!msi.plans || msi.plans.length === 0) ? (
            <div style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              No hay planes de MSI activos actualmente.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
              {msi.plans.map(p => {
                const pct = p.installments_total > 0 ? ((p.installments_paid / p.installments_total) * 100).toFixed(0) : 0;
                return (
                  <div key={p.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.55rem 0.75rem', borderRadius: '7px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                      <span>{p.concept}</span>
                      <span style={{ color: PALETTE.amber }}>{formatMoney(p.remaining_balance, hideValues)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      <span>{p.installments_paid}/{p.installments_total} pagos ({pct}%)</span>
                      <span>{formatMoney(p.monthly_amount, hideValues)}/mes</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          7. INVERSIONES & RENDIMIENTOS
      ───────────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              Inversiones y Portafolio
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
              Comparativa de capital aportado vs valor de mercado documentado.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Aportado: <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(investments.totalInvested, hideValues)}</strong>
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Valor actual: <strong style={{ color: PALETTE.emerald }}>{formatMoney(investments.totalCurrentValue, hideValues)}</strong>
            </div>
            <div style={{
              padding: '0.25rem 0.55rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: '700',
              background: investments.totalReturn >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)',
              color: investments.totalReturn >= 0 ? '#34d399' : '#fb7185',
              border: `1px solid ${investments.totalReturn >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`
            }}>
              {investments.totalReturnPct >= 0 ? '+' : ''}{investments.totalReturnPct}%
            </div>
          </div>
        </div>

        {(!investments.list || investments.list.length === 0) ? (
          <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No tienes inversiones registradas en tu portafolio.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
            {investments.list.map(inv => {
              const gain = inv.accumulated_result !== undefined ? inv.accumulated_result : (inv.current_value - inv.contributed);
              const isGainPositive = gain >= 0;
              return (
                <div key={inv.id || inv.name} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{inv.name}</span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: '600',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      background: inv.is_liquid ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)',
                      color: inv.is_liquid ? '#34d399' : 'var(--text-muted)',
                      border: `1px solid ${inv.is_liquid ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.3)'}`
                    }}>
                      {inv.is_liquid ? 'LÍQUIDA' : 'NO LÍQUIDA'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.4rem' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Capital aportado</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
                        {formatMoney(inv.contributed || inv.invested, hideValues)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Valor actual</div>
                      <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                        {formatMoney(inv.current_value || inv.current, hideValues)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Ganancia / Pérdida:</span>
                    <span style={{ fontWeight: '700', color: isGainPositive ? PALETTE.emerald : PALETTE.rose }}>
                      {isGainPositive ? '+' : ''}{formatMoney(gain, hideValues)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
