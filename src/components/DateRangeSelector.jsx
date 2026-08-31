import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, Check, X, SlidersHorizontal, ArrowRight, Clock } from 'lucide-react';
import { useDateRange } from '../context/DateRangeContext';

export default function DateRangeSelector() {
  const { startDate, endDate, preset, label, setPreset, setCustomRange } = useDateRange();
  const [isOpen, setIsOpen] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);
  const [errorMessage, setErrorMessage] = useState('');

  const presets = [
    { key: 'current_month', label: 'Este mes' },
    { key: 'prev_month', label: 'Mes anterior' },
    { key: 'last_3m', label: 'Últimos 3 Meses' },
    { key: 'last_6m', label: 'Últimos 6 Meses' },
    { key: 'ytd', label: 'Año en curso' },
    { key: 'all', label: 'Todo el Historial' }
  ];

  const handleToggle = () => {
    if (!isOpen) {
      setCustomStart(startDate);
      setCustomEnd(endDate);
      setErrorMessage('');
    }
    setIsOpen(!isOpen);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleApplyCustom = (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!customStart || !customEnd) {
      setErrorMessage('Por favor selecciona ambas fechas.');
      return;
    }
    if (customStart > customEnd) {
      setErrorMessage('La fecha inicial no puede ser posterior a la fecha final.');
      return;
    }
    setCustomRange(customStart, customEnd);
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        title="Cambiar periodo o rango de fechas"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
          background: isOpen ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.12)',
          border: `1px solid ${isOpen ? 'rgba(59, 130, 246, 0.65)' : 'rgba(59, 130, 246, 0.38)'}`,
          color: '#93c5fd',
          padding: '0.48rem 0.95rem',
          borderRadius: '10px',
          fontSize: '0.85rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          whiteSpace: 'nowrap',
          boxShadow: isOpen ? '0 0 16px rgba(59, 130, 246, 0.35)' : 'none'
        }}
      >
        <Calendar size={16} style={{ color: '#60a5fa' }} />
        <span>{label}</span>
        <ChevronDown 
          size={14} 
          style={{ 
            opacity: 0.85, 
            transform: isOpen ? 'rotate(180deg)' : 'none', 
            transition: 'transform 0.2s ease' 
          }} 
        />
      </button>

      {/* Modal Dialog rendered directly into document.body with createPortal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          {/* Blur Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(2, 6, 23, 0.82)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              zIndex: 999998
            }}
          />

          {/* Centered Modal Card */}
          <div
            style={{
              position: 'relative',
              zIndex: 999999,
              width: '100%',
              maxWidth: '430px',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'linear-gradient(145deg, #0e1526 0%, #080d18 100%)',
              border: '1px solid rgba(59, 130, 246, 0.45)',
              borderRadius: '18px',
              padding: '1.4rem',
              boxShadow: '0 25px 65px rgba(0, 0, 0, 0.85), 0 0 35px rgba(59, 130, 246, 0.25)',
              animation: 'fadeIn 0.18s ease-out'
            }}
          >
            {/* Modal Header */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '1.15rem', 
              paddingBottom: '0.85rem', 
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid rgba(59, 130, 246, 0.35)'
                }}>
                  <SlidersHorizontal size={18} style={{ color: '#60a5fa' }} />
                </div>
                <div>
                  <span style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', display: 'block' }}>
                    Seleccionar Periodo
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                    Rango activo: <strong style={{ color: '#60a5fa' }}>{startDate}</strong> al <strong style={{ color: '#60a5fa' }}>{endDate}</strong>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar modal"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.08)', 
                  border: '1px solid rgba(255, 255, 255, 0.14)', 
                  borderRadius: '9px',
                  color: '#94a3b8', 
                  cursor: 'pointer', 
                  padding: '7px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.15s'
                }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Quick Presets Grid */}
            <div style={{ marginBottom: '1.2rem' }}>
              <div style={{ 
                fontSize: '0.74rem', 
                fontWeight: '700', 
                color: '#94a3b8', 
                textTransform: 'uppercase', 
                letterSpacing: '0.06em',
                marginBottom: '0.6rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}>
                <Clock size={13} style={{ color: '#60a5fa' }} />
                <span>Atajos Rápidos</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                {presets.map(p => {
                  const isActive = preset === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => { setPreset(p.key); setIsOpen(false); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '10px',
                        background: isActive 
                          ? 'linear-gradient(135deg, rgba(59,130,246,0.45) 0%, rgba(37,99,235,0.35) 100%)' 
                          : 'rgba(255, 255, 255, 0.06)',
                        border: `1px solid ${isActive ? 'rgba(59, 130, 246, 0.7)' : 'rgba(255, 255, 255, 0.12)'}`,
                        color: isActive ? '#ffffff' : '#e2e8f0',
                        fontSize: '0.84rem',
                        fontWeight: isActive ? '700' : '600',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{p.label}</span>
                      {isActive && <Check size={15} style={{ color: '#60a5fa', strokeWidth: 3, flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Date Form Box */}
            <form 
              onSubmit={handleApplyCustom} 
              style={{ 
                background: 'rgba(0, 0, 0, 0.5)', 
                padding: '1.1rem', 
                borderRadius: '14px', 
                border: '1px solid rgba(255, 255, 255, 0.1)' 
              }}
            >
              <div style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem'
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Rango Personalizado
                </span>
                {preset === 'custom' && (
                  <span style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: '700' }}>● Activo</span>
                )}
              </div>

              {errorMessage && (
                <div style={{
                  background: 'rgba(244, 63, 94, 0.18)', 
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  color: '#fca5a5', 
                  borderRadius: '8px', 
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.78rem', 
                  marginBottom: '0.75rem'
                }}>
                  ⚠️ {errorMessage}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: '600' }}>
                    Fecha Inicial:
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={e => { setCustomStart(e.target.value); setErrorMessage(''); }}
                    style={{
                      width: '100%', 
                      background: '#090d16',
                      border: '1px solid rgba(59, 130, 246, 0.4)', 
                      borderRadius: '8px',
                      padding: '0.55rem 0.65rem', 
                      color: '#f8fafc', 
                      fontSize: '0.85rem',
                      colorScheme: 'dark', 
                      outline: 'none', 
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: '600' }}>
                    Fecha Final:
                  </label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={e => { setCustomEnd(e.target.value); setErrorMessage(''); }}
                    style={{
                      width: '100%', 
                      background: '#090d16',
                      border: '1px solid rgba(59, 130, 246, 0.4)', 
                      borderRadius: '8px',
                      padding: '0.55rem 0.65rem', 
                      color: '#f8fafc', 
                      fontSize: '0.85rem',
                      colorScheme: 'dark', 
                      outline: 'none', 
                      boxSizing: 'border-box'
                    }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    padding: '0.65rem 1rem',
                    borderRadius: '9px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#cbd5e1',
                    fontSize: '0.84rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '0.65rem 1rem',
                    borderRadius: '9px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none',
                    color: 'white',
                    fontSize: '0.86rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.45rem',
                    boxShadow: '0 4px 16px rgba(37, 99, 235, 0.45)'
                  }}
                >
                  <span>Aplicar Rango</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
