import React, { useState, useEffect } from 'react';
import { Mic, Search, Filter, Calendar, Tag, Wallet, AlertTriangle, CheckCircle2, Sparkles, FileText, Trash2 } from 'lucide-react';

import DocumentScannerModal from '../components/DocumentScannerModal';
import { API_BASE } from '../config';

export default function GastosView({ onRefresh }) {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showDocScanner, setShowDocScanner] = useState(false);

  // Filters
  const [filterConcept, setFilterConcept] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Quick Voice / Dictation Simulator state
  const [dictationText, setDictationText] = useState('');
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [pendingExpense, setPendingExpense] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [isListening, setIsListening] = useState(false);

  const toggleMicListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Tu navegador celular o versión actual no soporta reconocimiento de voz nativo por el micrófono. Puedes escribir directamente en el cuadro de texto.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-MX';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');
        setDictationText(transcript);
      };

      recognition.onerror = (event) => {
        console.error('Error de micrófono:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          alert('Permiso de micrófono no concedido. Ve a los Ajustes de tu navegador o celular y concede permiso de micrófono a esta página web.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Error iniciando reconocimiento de voz:', err);
      setIsListening(false);
    }
  };

  const loadData = () => {
    const params = new URLSearchParams({ type: 'expense' });
    if (filterConcept) params.append('concept', filterConcept);
    if (filterCategory) params.append('category', filterCategory);
    if (filterAccount) params.append('account_id', filterAccount);
    if (filterStartDate) params.append('start_date', filterStartDate);
    if (filterEndDate) params.append('end_date', filterEndDate);

    fetch(`${API_BASE}/api/transactions?${params.toString()}`)
      .then(res => res.json())
      .then(data => setExpenses(data))
      .catch(err => console.error('Error al cargar gastos:', err));
  };

  const handleDeleteExpense = (id, concept, amount) => {
    if (!window.confirm(`¿Eliminar el gasto "${concept}" por $${amount.toLocaleString('es-MX')}?\n\nEl monto de este gasto se devolverá automáticamente a los saldos de tu cuenta o tarjeta.`)) return;

    fetch(`${API_BASE}/api/transactions/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al eliminar gasto: ' + err.message));
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/categories`)
      .then(res => res.json())
      .then(data => setCategories(data));

    fetch(`${API_BASE}/api/accounts`)
      .then(res => res.json())
      .then(data => setAccounts(data));
  }, []);

  useEffect(() => {
    loadData();
  }, [filterConcept, filterCategory, filterAccount, filterStartDate, filterEndDate]);

  // Calls backend Gemini AI API /api/voice/process
  const handleSimulateVoice = () => {
    if (!dictationText.trim()) return;

    setIsProcessingVoice(true);
    fetch(`${API_BASE}/api/voice/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dictation_text: dictationText })
    })
      .then(res => res.json())
      .then(parsed => {
        setIsProcessingVoice(false);
        setPendingExpense(parsed);
        validatePendingExpense(parsed);
      })
      .catch(err => {
        setIsProcessingVoice(false);
        alert('Error al procesar dictado por voz: ' + err.message);
      });
  };

  const validatePendingExpense = (exp) => {
    if (!exp.amount || exp.amount <= 0) {
      setValidationError('Falta el monto del gasto.');
      return false;
    }
    if (!exp.account_id) {
      setValidationError('Falta seleccionar la cuenta o tarjeta.');
      return false;
    }
    if (!exp.category) {
      setValidationError('Falta la categoría.');
      return false;
    }
    if (!exp.concept) {
      setValidationError('Falta el concepto.');
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleConfirmAndSaveExpense = () => {
    if (!pendingExpense) return;
    if (!validatePendingExpense(pendingExpense)) return;

    const todayLocal = new Date().toLocaleDateString('sv-SE');
    const finalExpense = {
      ...pendingExpense,
      date: pendingExpense.date || todayLocal,
      type: 'expense',
      source: 'voice'
    };

    fetch(`${API_BASE}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalExpense)
    })
      .then(res => res.json())
      .then(() => {
        setPendingExpense(null);
        setDictationText('');
        loadData();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al guardar gasto: ' + err.message));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Voice Dictation Header Banner (Acción Principal: Registrar por voz) */}
      <div className="glass-card" style={{ borderLeft: '4px solid #3b82f6', background: 'linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(30,58,138,0.2) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <Mic size={24} style={{ color: '#60a5fa' }} />
          <h2 style={{ fontSize: '1.25rem' }}>Captura por Voz (Acción Principal)</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1rem' }}>
          Dicta tu gasto libremente, por ejemplo: <em>"Gasté 350 pesos en gasolina con BBVA Nómina"</em>.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={toggleMicListening}
            className={`nav-tab-btn ${isListening ? 'active' : ''}`}
            style={{
              padding: '0.75rem 1.25rem',
              background: isListening ? '#ef4444' : 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: '600',
              boxShadow: isListening ? '0 0 15px rgba(239, 68, 68, 0.6)' : 'none',
              animation: isListening ? 'pulse 1.5s infinite' : 'none'
            }}
          >
            <Mic size={18} style={{ color: isListening ? 'white' : '#f87171' }} />
            {isListening ? '🔴 Escuchando... (Habla ahora)' : '🎤 Dictar por Micrófono'}
          </button>

          <input 
            type="text" 
            value={dictationText}
            onChange={e => setDictationText(e.target.value)}
            placeholder='Ej: "Gasté 350 pesos en gasolina con BBVA Nómina"'
            style={{ flex: 1, minWidth: '240px', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', color: 'white' }}
          />

          <button 
            onClick={handleSimulateVoice}
            className="nav-tab-btn active"
            disabled={isProcessingVoice || !dictationText.trim()}
            style={{ padding: '0.75rem 1.25rem' }}
          >
            <Sparkles size={16} /> {isProcessingVoice ? 'Procesando con IA...' : 'Procesar con Gemini IA'}
          </button>

          <button 
            onClick={() => setShowDocScanner(true)}
            className="nav-tab-btn"
            style={{ background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#a78bfa', padding: '0.75rem 1.25rem' }}
          >
            <FileText size={16} /> Escanear Recibo / Ticket (Gemini)
          </button>
        </div>

        {showDocScanner && (
          <DocumentScannerModal 
            docType="receipt" 
            onClose={() => setShowDocScanner(false)} 
            onReconciled={() => { loadData(); if (onRefresh) onRefresh(); }} 
          />
        )}

        {/* Validation & Prompting Modal/Bar before Auto-Save */}
        {pendingExpense && (
          <div style={{ marginTop: '1.25rem', background: 'rgba(18, 26, 43, 0.95)', border: '1px solid var(--border-glow)', padding: '1.25rem', borderRadius: 'var(--radius-sm)' }}>
            <h3 style={{ fontSize: '1.05rem', color: '#60a5fa', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={18} /> Confirmar Gasto antes de Guardar
            </h3>

            {validationError && (
              <div style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={16} /> {validationError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Monto ($):</label>
                <input 
                  type="number" 
                  value={pendingExpense.amount}
                  onChange={e => {
                    const updated = { ...pendingExpense, amount: parseFloat(e.target.value) || '' };
                    setPendingExpense(updated);
                    validatePendingExpense(updated);
                  }}
                  style={{ width: '100%', padding: '0.5rem', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Concepto:</label>
                <input 
                  type="text" 
                  value={pendingExpense.concept}
                  onChange={e => {
                    const updated = { ...pendingExpense, concept: e.target.value };
                    setPendingExpense(updated);
                    validatePendingExpense(updated);
                  }}
                  style={{ width: '100%', padding: '0.5rem', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Categoría:</label>
                <select 
                  value={pendingExpense.category}
                  onChange={e => {
                    const updated = { ...pendingExpense, category: e.target.value };
                    setPendingExpense(updated);
                    validatePendingExpense(updated);
                  }}
                  style={{ width: '100%', padding: '0.5rem', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white', borderRadius: '4px' }}
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cuenta / Tarjeta:</label>
                <select 
                  value={pendingExpense.account_id}
                  onChange={e => {
                    const updated = { ...pendingExpense, account_id: parseInt(e.target.value, 10) };
                    setPendingExpense(updated);
                    validatePendingExpense(updated);
                  }}
                  style={{ width: '100%', padding: '0.5rem', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white', borderRadius: '4px' }}
                >
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setPendingExpense(null)} style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button 
                onClick={handleConfirmAndSaveExpense} 
                className="nav-tab-btn active"
                disabled={!!validationError}
                style={{ opacity: validationError ? 0.5 : 1 }}
              >
                Confirmar y Guardar Automáticamente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} /> Filtros de Historial de Gastos
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <input 
            type="text" 
            placeholder="Buscar por concepto..." 
            value={filterConcept}
            onChange={e => setFilterConcept(e.target.value)}
            style={{ padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }}
          />

          <select 
            value={filterCategory} 
            onChange={e => setFilterCategory(e.target.value)}
            style={{ padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}
          >
            <option value="">Todas las Categorías</option>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>

          <select 
            value={filterAccount} 
            onChange={e => setFilterAccount(e.target.value)}
            style={{ padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}
          >
            <option value="">Todas las Cuentas</option>
            {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
          </select>

          <input 
            type="date" 
            value={filterStartDate} 
            onChange={e => setFilterStartDate(e.target.value)}
            style={{ padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}
          />
        </div>
      </div>

      {/* Expenses History List */}
      <div className="glass-card">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Historial de Gastos Registrados</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {expenses.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
              No se encontraron gastos con los filtros aplicados.
            </div>
          ) : (
            expenses.map(exp => (
              <div 
                key={exp.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem 1.1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: '600' }}>{exp.concept}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', marginTop: '0.2rem' }}>
                    <span>{exp.date}</span>
                    <span>• {exp.category}</span>
                    <span>• {exp.account_name || 'Cuenta'}</span>
                    <span>• Origen: {exp.source}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f43f5e' }}>
                    -${exp.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </div>

                  <button 
                    onClick={() => handleDeleteExpense(exp.id, exp.concept, exp.amount)}
                    title="Eliminar gasto y restaurar saldos"
                    style={{ background: 'rgba(244, 63, 94, 0.12)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', borderRadius: '6px', padding: '0.45rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: '600' }}
                  >
                    <Trash2 size={15} /> Eliminar
                  </button>
                </div>
              </div>
            ))

          )}
        </div>
      </div>

    </div>
  );
}
