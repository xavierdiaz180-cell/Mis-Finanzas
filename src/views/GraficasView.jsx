import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, CreditCard, PiggyBank, Activity,
  RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2, Info,
  ArrowUpRight, ArrowDownRight, Layers, Calendar, DollarSign,
  PieChart as PieIcon, Percent, Sparkles, ChevronRight, SlidersHorizontal
} from 'lucide-react';
import { API_BASE } from '../config';
import { useDateRange } from '../context/DateRangeContext';
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
  const { startDate, endDate, preset, label, setPreset, queryParams } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTraces, setActiveTraces] = useState({
    netWorth: true,
    liquid: true,
    debt: true
  });

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/charts/data?${queryParams}`);
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
  }, [queryParams]);

  const filteredTimeline = useMemo(() => {
    return data?.patrimonioTimeline || [];
  }, [data?.patrimonioTimeline]);

  const filteredMonthlyFlow = useMemo(() => {
    return data?.monthlyFlow || [];
  }, [data?.monthlyFlow]);

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

  const period = summary.period || {
    start_date: startDate,
    end_date: endDate,
    income: 0,
    expenses: 0,
    net_flow: 0,
    saldo_inicial: 0,
    saldo_final: 0,
    tx_count: 0
  };

  const isNetWorthPositive = (summary.net_worth || 0) >= 0;
  const isPeriodNetPositive = (period.net_flow || 0) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', width: '100%', maxWidth: '1320px', margin: '0 auto' }}>

      {/* ─────────────────────────────────────────────────────────────
          1. HEADER & PERIOD SELECTOR BAR
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
            Centro de Análisis Financiero
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginTop: '0.2rem' }}>
            Periodo Activo: <strong style={{ color: '#93c5fd' }}>{label}</strong> ({period.start_date} al {period.end_date})
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
              { id: 'current_month', label: 'Este mes' },
              { id: 'prev_month', label: 'Mes anterior' },
              { id: 'last_3m', label: '3 Meses' },
              { id: 'last_6m', label: '6 Meses' },
              { id: 'ytd', label: 'Este año' },
              { id: 'all', label: 'Todo' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                style={{
                  background: preset === p.id ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                  border: preset === p.id ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                  color: preset === p.id ? '#ffffff' : 'var(--text-secondary)',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '7px',
                  fontSize: '0.78rem',
                  fontWeight: preset === p.id ? '600' : '500',
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
          2. PERIOD FLOW CARDS (REACTS DYNAMICALLY TO SELECTED RANGE)
      ───────────────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.65rem' }}>
          Actividad Financiera en el Periodo ({label})
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem'
        }}>
          {/* Ingresos en Periodo */}
          <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${PALETTE.emerald}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
              <span style={{ color: '#6ee7b7', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Ingresos en Periodo
              </span>
              <TrendingUp size={16} style={{ color: PALETTE.emerald }} />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: '700', color: '#34d399', letterSpacing: '-0.5px' }}>
              {formatMoney(period.income, hideValues)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Entradas en el rango
            </div>
          </div>

          {/* Gastos en Periodo */}
          <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${PALETTE.rose}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
              <span style={{ color: '#fca5a5', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Gastos en Periodo
              </span>
              <TrendingDown size={16} style={{ color: PALETTE.rose }} />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: '700', color: '#f43f5e', letterSpacing: '-0.5px' }}>
              {formatMoney(period.expenses, hideValues)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Egresos y consumos
            </div>
          </div>

          {/* Flujo Neto en Periodo */}
          <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${isPeriodNetPositive ? PALETTE.emerald : PALETTE.amber}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
              <span style={{ color: isPeriodNetPositive ? '#6ee7b7' : '#fcd34d', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Flujo Neto Periodo
              </span>
              {isPeriodNetPositive ? <TrendingUp size={16} style={{ color: PALETTE.emerald }} /> : <TrendingDown size={16} style={{ color: PALETTE.amber }} />}
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: '700', color: isPeriodNetPositive ? '#34d399' : '#fbbf24', letterSpacing: '-0.5px' }}>
              {isPeriodNetPositive ? '+' : ''}{formatMoney(period.net_flow, hideValues)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              {isPeriodNetPositive ? 'Superávit en el periodo' : 'Déficit en el periodo'}
            </div>
          </div>

          {/* Liquidez Actual Hoy */}
          <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${PALETTE.primary}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Liquidez Hoy
              </span>
              <Wallet size={16} style={{ color: PALETTE.primary }} />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
              {formatMoney(summary.liquid_money, hideValues)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Cuentas líquidas hoy
            </div>
          </div>

          {/* Patrimonio Neto Hoy */}
          <div className="glass-card" style={{ padding: '1.15rem 1.25rem', borderLeft: `3px solid ${isNetWorthPositive ? PALETTE.purple : PALETTE.rose}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Patrimonio Neto
              </span>
              <Layers size={16} style={{ color: PALETTE.purple }} />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: '700', color: isNetWorthPositive ? '#a855f7' : PALETTE.rose, letterSpacing: '-0.5px' }}>
              {formatMoney(summary.net_worth, hideValues)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Activos menos deuda
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. AUTOMATIC FACTUAL INSIGHTS
      ───────────────────────────────────────────────────────────── */}
      {insights && insights.length > 0 && (
        <div className="glass-card" style={{ padding: '1rem 1.25rem', background: 'rgba(15, 23, 42, 0.65)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Sparkles size={16} style={{ color: PALETTE.amber }} />
            <h3 style={{ fontSize: '0.92rem', fontWeight: '700', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Diagnóstico Financiero ({label})
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
              Evolución del Patrimonio en el Periodo
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Seguimiento cronológico de riqueza neta, disponible y deuda en {label}.
            </p>
          </div>

          {/* Trace Toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTraces(prev => ({ ...prev, netWorth: !prev.netWorth }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '8px',
                background: activeTraces.netWorth ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeTraces.netWorth ? PALETTE.purple : 'var(--border-subtle)'}`,
                color: activeTraces.netWorth ? '#c084fc' : 'var(--text-muted)',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE.purple }} />
              <span>Patrimonio Neto</span>
            </button>

            <button
              onClick={() => setActiveTraces(prev => ({ ...prev, liquid: !prev.liquid }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '8px',
                background: activeTraces.liquid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeTraces.liquid ? PALETTE.emerald : 'var(--border-subtle)'}`,
                color: activeTraces.liquid ? '#34d399' : 'var(--text-muted)',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE.emerald }} />
              <span>Disponible</span>
            </button>

            <button
              onClick={() => setActiveTraces(prev => ({ ...prev, debt: !prev.debt }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '8px',
                background: activeTraces.debt ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${activeTraces.debt ? PALETTE.rose : 'var(--border-subtle)'}`,
                color: activeTraces.debt ? '#fb7185' : 'var(--text-muted)',
                fontSize: '0.75rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE.rose }} />
              <span>Deuda</span>
            </button>
          </div>
        </div>

        <div style={{ width: '100%', height: 320 }}>
          {filteredTimeline.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              No hay movimientos registrados en el periodo seleccionado.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredTimeline} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.purple} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={PALETTE.purple} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorLiquid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.emerald} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={PALETTE.emerald} stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PALETTE.rose} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={PALETTE.rose} stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickFormatter={(val) => hideValues ? '•••' : `$${(val / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip hideValues={hideValues} />} />

                {activeTraces.netWorth && (
                  <Area type="monotone" dataKey="net_worth" name="Patrimonio Neto" stroke={PALETTE.purple} strokeWidth={2.5} fillOpacity={1} fill="url(#colorNetWorth)" />
                )}
                {activeTraces.liquid && (
                  <Area type="monotone" dataKey="available" name="Dinero Disponible" stroke={PALETTE.emerald} strokeWidth={2} fillOpacity={1} fill="url(#colorLiquid)" />
                )}
                {activeTraces.debt && (
                  <Area type="monotone" dataKey="debt" name="Deuda Total" stroke={PALETTE.rose} strokeWidth={2} fillOpacity={1} fill="url(#colorDebt)" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. MONTHLY CASH FLOW COMPARISON (INGRESOS VS GASTOS)
      ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Flujo de Efectivo en el Periodo
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Comparativa de ingresos y gastos mensuales en {label}.
              </p>
            </div>
          </div>

          <div style={{ width: '100%', height: 260 }}>
            {filteredMonthlyFlow.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No hay movimientos registrados para este periodo.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredMonthlyFlow} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(val) => hideValues ? '•••' : `$${(val / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip hideValues={hideValues} />} />
                  <Bar dataKey="income" name="Ingresos" fill={PALETTE.emerald} radius={[4, 4, 0, 0]} maxBarSize={30} />
                  <Bar dataKey="expenses" name="Gastos" fill={PALETTE.rose} radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            6. EXPENSES BY CATEGORY (TOP 5 + OTROS)
        ───────────────────────────────────────────────────────────── */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Gastos por Categoría
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Distribución en {label}.
              </p>
            </div>
            <span className="badge badge-info" style={{ fontSize: '0.74rem' }}>
              {expensesByCategory.length} categorías
            </span>
          </div>

          {expensesByCategory.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No hay gastos en el periodo seleccionado.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto' }}>
              {expensesByCategory.map((cat, i) => {
                const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                        {cat.category}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{cat.percentage}%</span>
                        <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                          {formatMoney(cat.total, hideValues)}
                        </span>
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, cat.percentage)}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          7. DEBT, CREDIT UTILIZATION & MSI
      ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        
        {/* Tarjetas y Utilización de Crédito */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Utilización de Tarjetas de Crédito
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Monitoreo de saldo respecto a tu límite crediticio.
              </p>
            </div>
          </div>

          {(!debts.cards || debts.cards.length === 0) ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No tienes tarjetas de crédito registradas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {debts.cards.map((card, i) => {
                const util = card.utilization_pct || 0;
                const utilColor = util > 70 ? PALETTE.rose : util > 40 ? PALETTE.amber : PALETTE.emerald;
                return (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{card.name}</span>
                      <span style={{ fontWeight: '700', color: utilColor }}>{util}% utilizado</span>
                    </div>
                    <div style={{ width: '100%', height: '7px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.4rem' }}>
                      <div style={{ width: `${util}%`, height: '100%', background: utilColor, borderRadius: '4px' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      <span>Saldo: <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(card.balance, hideValues)}</strong></span>
                      <span>Límite: {formatMoney(card.credit_limit, hideValues)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Proyección de Amortización MSI */}
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                Proyección Meses Sin Intereses (MSI)
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                Evolución de saldo pendiente de tus {msi.active_plans_count || 0} compras activas.
              </p>
            </div>
            <span className="badge badge-warning" style={{ fontSize: '0.74rem' }}>
              {formatMoney(msi.total_monthly_commitment || 0, hideValues)}/mes
            </span>
          </div>

          {(!msi.projection || msi.projection.length <= 1) ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No tienes compras a meses sin intereses pendientes.
            </div>
          ) : (
            <div style={{ width: '100%', height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={msi.projection} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(val) => hideValues ? '•••' : `$${(val / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTooltip hideValues={hideValues} />} />
                  <Line type="monotone" dataKey="balance" name="Saldo MSI Restante" stroke={PALETTE.amber} strokeWidth={2.5} dot={{ r: 3, fill: PALETTE.amber }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
