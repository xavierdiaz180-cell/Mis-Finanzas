import React, { useState, useEffect } from 'react';
import {
  Wallet, PiggyBank, CreditCard, ShieldCheck, Sparkles, Calendar,
  TrendingUp, TrendingDown, AlertCircle, ArrowUpRight, CheckCircle2,
  RefreshCw, Layers, ArrowRight, Activity, DollarSign
} from 'lucide-react';
import { formatMoney } from '../utils/formatters';
import { API_BASE } from '../config';
import { useDateRange } from '../context/DateRangeContext';

export default function InicioView({ summary: initialSummary, onNavigate, onRefresh, hideValues = false }) {
  const { queryParams, label, startDate, endDate } = useDateRange();
  const [localSummary, setLocalSummary] = useState(initialSummary || null);
  const [loadingMetrics, setLoadingMetrics] = useState(!initialSummary);

  const fetchLiveSummary = () => {
    setLoadingMetrics(true);
    fetch(`${API_BASE}/api/summary?${queryParams}`)
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
  }, [queryParams]);

  useEffect(() => {
    if (initialSummary) {
      setLocalSummary(initialSummary);
    }
  }, [initialSummary]);

  const summary = localSummary || initialSummary || {};
  const periodData = summary.period || {
    start_date: startDate,
    end_date: endDate,
    saldo_inicial: 0,
    saldo_final: 0,
    income: 0,
    expenses: 0,
    transfers: 0,
    card_payments: 0,
    net_flow: 0,
    tx_count: 0
  };

  // Real Present State
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

  const isPeriodNetPositive = periodData.net_flow >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ─────────────────────────────────────────────────────────────
          1. PERIOD ACTIVITY BANNER (DURANTE EL PERIODO)
      ───────────────────────────────────────────────────────────── */}
      <div className="glass-card" style={{ padding: '1.25rem', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%)', borderLeft: '4px solid #3b82f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={18} style={{ color: '#60a5fa' }} />
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                Actividad del Periodo: {label}
              </h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
              {periodData.start_date} al {periodData.end_date} • {periodData.tx_count || 0} movimientos registrados
            </p>
          </div>

          <div style={{
            padding: '0.3rem 0.75rem',
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontWeight: '700',
            background: isPeriodNetPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
            color: isPeriodNetPositive ? '#34d399' : '#fb7185',
            border: `1px solid ${isPeriodNetPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
          }}>
            Flujo Neto: {isPeriodNetPositive ? '+' : ''}{formatMoney(periodData.net_flow, hideValues)}
          </div>
        </div>

        {/* 5 Period Flow Metric Pills */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.75rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Saldo Inicial</span>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '0.15rem' }}>
              {formatMoney(periodData.saldo_inicial, hideValues)}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Al inicio del {periodData.start_date}</span>
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.75rem 0.9rem', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <span style={{ fontSize: '0.72rem', color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ingresos del Periodo</span>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#34d399', marginTop: '0.15rem' }}>
              {formatMoney(periodData.income, hideValues)}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Entradas netas</span>
          </div>

          <div style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '0.75rem 0.9rem', borderRadius: '10px', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
            <span style={{ fontSize: '0.72rem', color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gastos del Periodo</span>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#f43f5e', marginTop: '0.15rem' }}>
              {formatMoney(periodData.expenses, hideValues)}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Egresos y consumos</span>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '0.75rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Saldo Final Estimado</span>
            <div style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--text-primary)', marginTop: '0.15rem' }}>
              {formatMoney(periodData.saldo_final, hideValues)}
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Al cierre del periodo</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. ESTADO FINANCIERO ACTUAL (HOY)
      ───────────────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem' }}>
          Estado Financiero Actual (Cuentas, Inversiones y Deudas)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.15rem' }}>
          
          {/* DINERO EN CUENTAS */}
          <div className="glass-card" style={{ borderLeft: '4px solid #38bdf8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                DINERO EN CUENTAS
              </span>
              <span className="badge badge-info"><Wallet size={12} /> Cuentas Líquidas</span>
            </div>
            <div style={{ fontSize: '1.9rem', fontWeight: '700', color: '#f8fafc', margin: '0.35rem 0' }}>
              {formatMoney(liquid_money, hideValues)}
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Nómina, Débito, Efectivo y Cajas disponibles hoy.
            </p>
          </div>

          {/* INVERSIONES */}
          <div className="glass-card" style={{ borderLeft: '4px solid #a855f7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                INVERSIONES
              </span>
              <span className="badge badge-info"><PiggyBank size={12} /> Portafolio</span>
            </div>
            <div style={{ fontSize: '1.9rem', fontWeight: '700', color: '#a855f7', margin: '0.35rem 0' }}>
              {formatMoney(investment_value, hideValues)}
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Valor actual total de activos de inversión.
            </p>
          </div>

          {/* DEUDA TOTAL */}
          <div className="glass-card" style={{ borderLeft: '4px solid #f43f5e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                DEUDA TOTAL
              </span>
              <span className="badge" style={{ background: 'rgba(244,63,94,0.15)', color: '#fca5a5' }}>
                <CreditCard size={12} /> Pasivos
              </span>
            </div>
            <div style={{ fontSize: '1.9rem', fontWeight: '700', color: '#f43f5e', margin: '0.35rem 0' }}>
              {formatMoney(total_debt, hideValues)}
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Tarjetas de crédito, préstamos y saldo MSI pendiente.
            </p>
          </div>

          {/* PATRIMONIO NETO */}
          <div className="glass-card" style={{ borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                PATRIMONIO NETO
              </span>
              <span className="badge badge-success"><Layers size={12} /> Riqueza Neta</span>
            </div>
            <div style={{ fontSize: '1.9rem', fontWeight: '700', color: net_worth >= 0 ? '#10b981' : '#f43f5e', margin: '0.35rem 0' }}>
              {formatMoney(net_worth, hideValues)}
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Activos totales menos pasivos totales.
            </p>
          </div>

        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. PRESUPUESTOS (ALIMENTACIÓN 24H & SERVICIOS MENSUAL)
      ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.15rem' }}>
        {/* Presupuesto Diario de Alimentación */}
        <div className="glass-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Presupuesto Alimentación (24h)
              </span>
              <h4 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>
                {presupuesto_diario.base_amount ? formatMoney(presupuesto_diario.base_amount, hideValues) : '$150.00'}/día
              </h4>
            </div>
            <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}>
              {presupuesto_diario.available_today >= 0 ? 'Disponible Hoy' : 'Excedido'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0.5rem 0' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Disponible para hoy:</span>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: (presupuesto_diario.available_today || 0) >= 0 ? '#34d399' : '#f43f5e' }}>
              {formatMoney(presupuesto_diario.available_today || 0, hideValues)}
            </span>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Gastado hoy: <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(presupuesto_diario.actual_spent_today || 0, hideValues)}</strong>
          </div>
        </div>

        {/* Presupuesto Mensual de Servicios */}
        <div className="glass-card" style={{ borderLeft: '4px solid #6366f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Presupuesto Servicios (Mensual)
              </span>
              <h4 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>
                {formatMoney(presupuesto_servicios.budget_amount || 1500, hideValues)}/mes
              </h4>
            </div>
            <span className="badge" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
              Servicios
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0.5rem 0' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Disponible este mes:</span>
            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: (presupuesto_servicios.available_month || 0) >= 0 ? '#34d399' : '#f43f5e' }}>
              {formatMoney(presupuesto_servicios.available_month || 0, hideValues)}
            </span>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Gastado en servicios: <strong style={{ color: 'var(--text-primary)' }}>{formatMoney(presupuesto_servicios.actual_spent || 0, hideValues)}</strong>
          </div>
        </div>
      </div>

    </div>
  );
}
