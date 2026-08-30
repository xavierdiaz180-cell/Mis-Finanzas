import React, { useState } from 'react';
import { Calendar, ChevronDown, Check, X, SlidersHorizontal } from 'lucide-react';
import { useDateRange } from '../context/DateRangeContext';

export default function DateRangeSelector() {
  const { startDate, endDate, preset, label, setPreset, setCustomRange } = useDateRange();
  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  const presets = [
    { key: 'current_month', label: 'Este mes' },
    { key: 'prev_month', label: 'Mes anterior' },
    { key: 'last_3m', label: '3 Meses' },
    { key: 'last_6m', label: '6 Meses' },
    { key: 'ytd', label: 'Este año' },
    { key: 'all', label: 'Todo' }
  ];

  const handleApplyCustom = (e) => {
    e.preventDefault();
    if (customStart && customEnd) {
      if (customStart > customEnd) {
        alert('La fecha inicial no puede ser posterior a la fecha final.');
        return;
      }
      setCustomRange(customStart, customEnd);
      setIsOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          color: '#93c5fd',
          padding: '0.45rem 0.85rem',
          borderRadius: '10px',
          fontSize: '0.82rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap'
        }}
      >
        <Calendar size={15} style={{ color: '#60a5fa' }} />
        <span>{label}</span>
        <ChevronDown size={14} style={{ opacity: 0.7, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Dropdown / Modal Box */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999
            }}
          />

          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              zIndex: 1000,
              width: '320px',
              maxWidth: '92vw',
              background: 'rgba(11, 15, 25, 0.96)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '1rem',
              boxShadow: '0 12px 36px rgba(0,0,0,0.65)',
              backdropFilter: 'blur(16px)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                <SlidersHorizontal size={14} style={{ color: '#60a5fa' }} />
                <span>Seleccionar Periodo</span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Presets Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', marginBottom: '1rem' }}>
              {presets.map(p => {
                const isActive = preset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setPreset(p.key);
                      setIsOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '8px',
                      background: isActive ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${isActive ? 'rgba(59, 130, 246, 0.5)' : 'rgba(255, 255, 255, 0.06)'}`,
                      color: isActive ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '0.78rem',
                      fontWeight: isActive ? '700' : '500',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>{p.label}</span>
                    {isActive && <Check size={13} style={{ color: '#60a5fa' }} />}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Form */}
            <form onSubmit={handleApplyCustom} style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Rango Personalizado
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Desde</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#121a2b',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '0.35rem 0.45rem',
                      color: '#f8fafc',
                      fontSize: '0.76rem'
                    }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Hasta</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#121a2b',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '0.35rem 0.45rem',
                      color: '#f8fafc',
                      fontSize: '0.76rem'
                    }}
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '0.45rem',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  border: 'none',
                  color: 'white',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Aplicar Rango
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
