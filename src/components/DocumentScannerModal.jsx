import React, { useState, useEffect } from 'react';
import { FileSearch, Upload, AlertTriangle, CheckCircle2, X, FileText, Landmark, CreditCard, Sparkles, RefreshCw, Eye, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { API_BASE } from '../config';

export default function DocumentScannerModal({ docType = 'payroll', onClose, onReconciled }) {
  const [selectedType, setSelectedType] = useState(docType);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [referenceName, setReferenceName] = useState('');
  const [targetId, setTargetId] = useState('new');
  const [accounts, setAccounts] = useState([]);
  const [debts, setDebts] = useState([]);

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/accounts`).then(r => r.json()),
      fetch(`${API_BASE}/api/debts`).then(r => r.json())
    ]).then(([accData, debtData]) => {
      const validAccs = Array.isArray(accData) ? accData : [];
      const validDebts = Array.isArray(debtData) ? debtData : [];
      setAccounts(validAccs);
      setDebts(validDebts);

      if (selectedType === 'credit_card' && validDebts.length > 0) {
        setTargetId(`debt-${validDebts[0].id}`);
      } else if (validAccs.length > 0) {
        setTargetId(`acc-${validAccs[0].id}`);
      } else {
        setTargetId('new');
      }
    }).catch(err => console.error('Error al cargar cuentas/deudas en escáner:', err));
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setFilePreview(reader.result);
        reader.readAsDataURL(selectedFile);
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleScanDocument = (e) => {
    e.preventDefault();
    setIsScanning(true);
    setErrorMsg('');

    let account_id = null;
    if (targetId.startsWith('acc-')) {
      account_id = parseInt(targetId.replace('acc-', ''), 10);
    }

    const formData = new FormData();
    if (file) formData.append('file', file);
    formData.append('doc_type', selectedType);
    formData.append('reference_name', referenceName || getDocTypeName(selectedType));
    if (account_id) formData.append('target_account_id', account_id);

    fetch(`${API_BASE}/api/documents/scan`, {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        setIsScanning(false);
        setScanResult(data);
      })
      .catch(err => {
        setIsScanning(false);
        setErrorMsg('Error al escanear documento: ' + err.message);
      });
  };

  const handleConfirmReconcile = () => {
    if (!scanResult) return;

    let account_id = null;
    let debt_id = null;

    if (targetId.startsWith('acc-')) {
      account_id = parseInt(targetId.replace('acc-', ''), 10);
    } else if (targetId.startsWith('debt-')) {
      debt_id = parseInt(targetId.replace('debt-', ''), 10);
    }

    fetch(`${API_BASE}/api/documents/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_id: scanResult.document_id,
        doc_type: selectedType,
        account_id,
        debt_id,
        extracted_data: scanResult.extractedData
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        if (onReconciled) onReconciled();
        onClose();
      })
      .catch(err => alert('Error al conciliar documento: ' + err.message));
  };

  function getDocTypeName(type) {
    switch (type) {
      case 'credit_card': return 'Estado de Cuenta Tarjeta';
      case 'payroll': return 'Recibo de Nómina';
      case 'receipt': return 'Recibo de Servicio';
      default: return 'Documento Financiero';
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 9, 20, 0.82)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div className="glass-card" style={{
        maxWidth: '580px',
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(139, 92, 246, 0.15)',
        borderRadius: '20px',
        padding: '1.75rem'
      }}>
        
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)', padding: '0.5rem', borderRadius: '12px', display: 'flex', boxShadow: '0 0 15px rgba(139, 92, 246, 0.4)' }}>
              <Sparkles size={20} style={{ color: 'white' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', letterSpacing: '-0.01em' }}>Escáner de Documentos IA</h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Procesamiento inteligente con Gemini Vision</span>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', borderRadius: '50%', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Document Type Selector Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => setSelectedType('credit_card')}
            style={{
              flex: 1,
              padding: '0.6rem 0.5rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
              background: selectedType === 'credit_card' ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' : 'transparent',
              color: selectedType === 'credit_card' ? 'white' : 'var(--text-secondary)',
              boxShadow: selectedType === 'credit_card' ? '0 0 12px rgba(59, 130, 246, 0.4)' : 'none'
            }}
          >
            <CreditCard size={15} /> Estado de Cuenta
          </button>

          <button
            type="button"
            onClick={() => setSelectedType('payroll')}
            style={{
              flex: 1,
              padding: '0.6rem 0.5rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
              background: selectedType === 'payroll' ? 'linear-gradient(135deg, #10b981 0%, #047857 100%)' : 'transparent',
              color: selectedType === 'payroll' ? 'white' : 'var(--text-secondary)',
              boxShadow: selectedType === 'payroll' ? '0 0 12px rgba(16, 185, 129, 0.4)' : 'none'
            }}
          >
            <Landmark size={15} /> Recibo Nómina
          </button>

          <button
            type="button"
            onClick={() => setSelectedType('receipt')}
            style={{
              flex: 1,
              padding: '0.6rem 0.5rem',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
              background: selectedType === 'receipt' ? 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' : 'transparent',
              color: selectedType === 'receipt' ? 'white' : 'var(--text-secondary)',
              boxShadow: selectedType === 'receipt' ? '0 0 12px rgba(139, 92, 246, 0.4)' : 'none'
            }}
          >
            <FileText size={15} /> Recibo / Ticket
          </button>
        </div>

        {/* SCANNING ACTIVE ANIMATION OVERLAY */}
        {isScanning ? (
          <div style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
            borderRadius: '16px',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            animation: 'pulseGlow 3s infinite'
          }}>
            {/* Holographic Scan Container */}
            <div style={{
              position: 'relative',
              width: '90px',
              height: '110px',
              borderRadius: '12px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '2px solid rgba(139, 92, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.5rem',
              overflow: 'hidden',
              boxShadow: '0 0 25px rgba(139, 92, 246, 0.3)'
            }}>
              <FileText size={42} style={{ color: '#a78bfa', opacity: 0.8 }} />
              
              {/* Laser Scan Line */}
              <div style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: '4px',
                background: 'linear-gradient(90deg, rgba(59,130,246,0) 0%, #60a5fa 50%, rgba(59,130,246,0) 100%)',
                boxShadow: '0 0 12px #60a5fa, 0 0 20px #3b82f6',
                animation: 'scanLaser 2s infinite ease-in-out'
              }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Sparkles className="spin-slow" size={18} style={{ color: '#a78bfa' }} />
              <h4 style={{ fontSize: '1.1rem', color: '#f8fafc', fontWeight: '600' }}>
                Escaneando con Gemini IA...
              </h4>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '380px', lineHeight: '1.4' }}>
              Extrayendo automáticamente saldos, fechas de corte, pagos mínimos y compras a meses sin intereses.
            </p>

            {/* Glowing Progress Indicator */}
            <div style={{
              width: '100%',
              maxWidth: '280px',
              height: '6px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '999px',
              marginTop: '1.5rem',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{
                width: '60%',
                height: '100%',
                background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)',
                borderRadius: '999px',
                animation: 'pulse 1.5s infinite ease-in-out'
              }} />
            </div>
          </div>
        ) : !scanResult ? (
          /* UPLOAD FORM */
          <form onSubmit={handleScanDocument} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            
            <div style={{
              background: 'rgba(59, 130, 246, 0.06)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              padding: '0.85rem 1rem',
              borderRadius: '12px',
              fontSize: '0.84rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem'
            }}>
              <Zap size={20} style={{ color: '#60a5fa', flexShrink: 0 }} />
              <span>
                Subes tu <strong>{getDocTypeName(selectedType)}</strong> en imagen o PDF. Gemini interpretará los saldos y fechas al instante.
              </span>
            </div>

            {/* Account / Debt Selector */}
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '500', display: 'block', marginBottom: '0.35rem' }}>
                Tarjeta / Cuenta a Actualizar:
              </label>
              <select 
                value={targetId} 
                onChange={e => setTargetId(e.target.value)} 
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  background: '#0f172a',
                  border: '1px solid var(--border-subtle)',
                  color: 'white',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              >
                <option value="new">➕ Crear Nueva Tarjeta de Crédito</option>
                {debts.length > 0 && (
                  <optgroup label="Tarjetas en Deudas">
                    {debts.map(d => (
                      <option key={`debt-${d.id}`} value={`debt-${d.id}`}>💳 {d.name} (Deuda)</option>
                    ))}
                  </optgroup>
                )}
                {accounts.length > 0 && (
                  <optgroup label="Cuentas Registradas">
                    {accounts.map(acc => (
                      <option key={`acc-${acc.id}`} value={`acc-${acc.id}`}>🏦 {acc.name} ({acc.type})</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Custom Drag & Drop File Box */}
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '500', display: 'block', marginBottom: '0.35rem' }}>
                Documento a Escanear (PDF o Imagen):
              </label>

              {!file ? (
                <label style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                  padding: '1.75rem 1rem',
                  borderRadius: '14px',
                  border: '2px dashed rgba(139, 92, 246, 0.4)',
                  background: 'rgba(15, 23, 42, 0.5)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}>
                  <div style={{ background: 'rgba(139, 92, 246, 0.15)', padding: '0.65rem', borderRadius: '50%', color: '#a78bfa' }}>
                    <Upload size={22} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#f8fafc', display: 'block' }}>
                      Toca para seleccionar tu archivo
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Formatos soportados: PNG, JPG, JPEG, PDF
                    </span>
                  </div>
                  <input 
                    type="file" 
                    onChange={handleFileChange} 
                    accept="image/*,.pdf" 
                    style={{ display: 'none' }} 
                  />
                </label>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(139, 92, 246, 0.4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                    {filePreview ? (
                      <img src={filePreview} alt="Preview" style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-subtle)' }} />
                    ) : (
                      <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '0.5rem', borderRadius: '8px', color: '#60a5fa' }}>
                        <FileText size={24} />
                      </div>
                    )}
                    <div style={{ overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: '600', color: '#f8fafc', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>

                  <button 
                    type="button" 
                    onClick={() => { setFile(null); setFilePreview(null); }} 
                    style={{
                      background: 'rgba(244, 63, 94, 0.15)',
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                      color: '#f43f5e',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    ✕ Cambiar
                  </button>
                </div>
              )}
            </div>

            {/* Optional Reference Name */}
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '500', display: 'block', marginBottom: '0.35rem' }}>
                Referencia (Opcional):
              </label>
              <input 
                type="text" 
                value={referenceName} 
                onChange={e => setReferenceName(e.target.value)} 
                placeholder={`Ej. ${getDocTypeName(selectedType)} de este mes`} 
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  borderRadius: '10px',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border-subtle)',
                  color: 'white',
                  fontSize: '0.88rem'
                }} 
              />
            </div>

            {errorMsg && (
              <div style={{ color: '#f43f5e', fontSize: '0.85rem', background: 'rgba(244,63,94,0.1)', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid rgba(244,63,94,0.3)' }}>
                {errorMsg}
              </div>
            )}

            <button 
              type="submit" 
              className="nav-tab-btn active" 
              style={{
                width: '100%',
                justify: 'center',
                padding: '0.85rem',
                marginTop: '0.5rem',
                fontSize: '0.95rem',
                fontWeight: '600',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
                boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)'
              }}
            >
              <Sparkles size={18} /> Escanear e Interpretar Documento (Gemini IA)
            </button>
          </form>
        ) : (
          /* SCAN RESULTS DISPLAY */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: scanResult.geminiError ? '#fbbf24' : '#34d399' }}>
              {scanResult.geminiError ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
              <h4 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                {scanResult.geminiError ? 'Datos de Demostración (Revisar Clave)' : '¡Información Extraída con Éxito! ✓'}
              </h4>
            </div>

            {scanResult.geminiError && (
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fbbf24', padding: '0.85rem', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <strong>⚠️ Nota sobre Gemini IA:</strong>
                <div style={{ marginTop: '0.3rem', fontSize: '0.8rem' }}>{scanResult.geminiError}</div>
              </div>
            )}

            {scanResult.discrepancy && (
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fbbf24', padding: '0.85rem', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <div>
                  <strong>¡Alerta de Discrepancia Encontrada!</strong>
                  <div>{scanResult.discrepancyDetails}</div>
                </div>
              </div>
            )}

            {/* Extracted Data Cards */}
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', padding: '1rem', borderRadius: '14px', marginBottom: '1.25rem' }}>
              {Object.entries(scanResult.extractedData).map(([key, val]) => {
                const labelMap = {
                  total_balance: 'Saldo Total Pendiente',
                  minimum_payment: 'Pago Mínimo',
                  no_interest_payment: 'Pago para No Generar Intereses',
                  cutoff_date: 'Fecha de Corte',
                  due_date: 'Fecha Límite de Pago',
                  interest_rate: 'Tasa de Interés (%)',
                  available_credit: 'Crédito Disponible',
                  deposit_amount: 'Monto Depositado',
                  payroll_loans_deduction: 'Descuento de Préstamos',
                  employer: 'Empresa / Empleador',
                  date: 'Fecha',
                  vendor: 'Proveedor / Emisor',
                  concept: 'Concepto',
                  amount: 'Monto Total',
                  frequency: 'Frecuencia'
                };
                const label = labelMap[key] || key.replace(/_/g, ' ');
                return (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {label}:
                    </span>
                    <span style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.9rem' }}>
                      {typeof val === 'number' && !key.includes('rate') ? `$${val.toLocaleString('es-MX')}` : typeof val === 'number' && key.includes('rate') ? `${val}%` : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button 
                type="button"
                onClick={() => setScanResult(null)} 
                style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '0.75rem 1.1rem', borderRadius: '10px', cursor: 'pointer', fontWeight: '500' }}
              >
                <RefreshCw size={16} style={{ display: 'inline', marginRight: '0.3rem' }} /> Escanear Otro
              </button>
              <button 
                type="button"
                onClick={handleConfirmReconcile} 
                className="nav-tab-btn active" 
                style={{ padding: '0.75rem 1.25rem', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)', boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)' }}
              >
                <ShieldCheck size={18} /> Confirmar y Conciliar Automáticamente
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
