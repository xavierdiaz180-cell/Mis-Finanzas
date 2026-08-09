import React, { useState, useEffect } from 'react';
import { FileSearch, Upload, AlertTriangle, CheckCircle2, X, FileText, Landmark, CreditCard, Sparkles } from 'lucide-react';
import { API_BASE } from '../config';

export default function DocumentScannerModal({ docType = 'payroll', onClose, onReconciled }) {
  const [file, setFile] = useState(null);
  const [referenceName, setReferenceName] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/accounts`)
      .then(res => res.json())
      .then(data => {
        setAccounts(data);
        if (data.length > 0) setTargetAccountId(data[0].id);
      });
  }, []);

  const handleScanDocument = (e) => {
    e.preventDefault();
    setIsScanning(true);
    setErrorMsg('');

    const formData = new FormData();
    if (file) formData.append('file', file);
    formData.append('doc_type', docType);
    formData.append('reference_name', referenceName || getDocTypeName(docType));
    formData.append('target_account_id', targetAccountId);

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

    fetch(`${API_BASE}/api/documents/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_id: scanResult.document_id,
        doc_type: docType,
        account_id: parseInt(targetAccountId, 10),
        extracted_data: scanResult.extractedData
      })
    })
      .then(res => res.json())
      .then(() => {
        if (onReconciled) onReconciled();
        onClose();
      })
      .catch(err => alert('Error al conciliar documento: ' + err.message));
  };

  function getDocTypeName(type) {
    switch (type) {
      case 'payroll': return 'Recibo de Nómina';
      case 'credit_card': return 'Estado de Cuenta Tarjeta';
      case 'receipt': return 'Recibo de Servicio';
      default: return 'Documento Financiero';
    }
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}>
      <div className="glass-card" style={{ maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles style={{ color: '#a78bfa' }} size={22} />
            <h3 style={{ fontSize: '1.2rem' }}>Escáner de Documentos Gemini</h3>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {!scanResult ? (
          <form onSubmit={handleScanDocument} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Subes tu <strong>{getDocTypeName(docType)}</strong> en imagen o PDF. Gemini interpretará los datos automáticamente (ingresos, préstamos de nómina, saldo, corte, pago mínimo y compras a MSI).
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Nombre / Referencia:</label>
              <input type="text" value={referenceName} onChange={e => setReferenceName(e.target.value)} placeholder={`Ej. ${getDocTypeName(docType)} Agosto`} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Cuenta Asociada:</label>
              <select value={targetAccountId} onChange={e => setTargetAccountId(e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Archivo Documento (PDF o Imagen):</label>
              <input type="file" onChange={e => setFile(e.target.files[0])} accept="image/*,.pdf" style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
            </div>

            {errorMsg && (
              <div style={{ color: '#f43f5e', fontSize: '0.85rem', background: 'rgba(244,63,94,0.1)', padding: '0.5rem', borderRadius: '4px' }}>
                {errorMsg}
              </div>
            )}

            <button type="submit" className="nav-tab-btn active" disabled={isScanning} style={{ width: '100%', justifyContent: 'center', padding: '0.75rem', marginTop: '0.5rem' }}>
              {isScanning ? 'Escaneando con IA Gemini...' : 'Escanear e Interpretar Documento'}
            </button>
          </form>
        ) : (
          <div>
            <h4 style={{ fontSize: '1.05rem', color: '#34d399', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CheckCircle2 size={18} /> Datos Extraídos por Gemini
            </h4>

            {/* Discrepancy Alert */}
            {scanResult.discrepancy && (
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fbbf24', padding: '0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                <div>
                  <strong>¡Alerta de Discrepancia Encontrada!</strong>
                  <div>{scanResult.discrepancyDetails}</div>
                  <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Confirma si deseas actualizar el sistema con la información del nuevo documento.
                  </div>
                </div>
              </div>
            )}

            {/* Extracted Data Display */}
            <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
              {Object.entries(scanResult.extractedData).map(([key, val]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}:</span>
                  <span style={{ fontWeight: '600', color: '#f8fafc' }}>
                    {typeof val === 'number' ? `$${val.toLocaleString('es-MX')}` : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setScanResult(null)} style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '0.65rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                Re-escanear
              </button>
              <button onClick={handleConfirmReconcile} className="nav-tab-btn active" style={{ padding: '0.65rem 1.25rem' }}>
                Confirmar y Conciliar Automáticamente
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
