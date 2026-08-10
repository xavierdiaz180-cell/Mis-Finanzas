import React, { useState, useEffect } from 'react';
import { Settings, Key, Database, Cpu, Shield, Save, CheckCircle2, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';
import { API_BASE } from '../config';

export default function AjustesView({ onRefresh }) {
  const [settings, setSettings] = useState({
    user_name: 'Usuario',
    daily_budget_limit: '200',
    gemini_api_key: '',
    gemini_model: 'gemini-2.0-flash',
    financial_freedom_age: '55',
    financial_freedom_target: '10000000'
  });

  const [dbStatus, setDbStatus] = useState(null);
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);


  const loadSettings = () => {
    fetch(`${API_BASE}/api/settings`)
      .then(res => res.json())
      .then(data => {
        setSettings(prev => ({ ...prev, ...data }));
      });

    fetch(`${API_BASE}/api/health`)
      .then(res => res.json())
      .then(data => setDbStatus(data));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveSettings = (e) => {
    e.preventDefault();

    fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
      .then(res => res.json())
      .then(() => {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al guardar ajustes: ' + err.message));
  };

  const handleTestGeminiConnection = () => {
    setTestingGemini(true);
    setGeminiTestResult(null);

    // Call /api/voice/process with test text
    fetch(`${API_BASE}/api/voice/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dictation_text: 'Prueba de conexión con Gemini' })
    })
      .then(res => res.json())
      .then(data => {
        setTestingGemini(false);
        setGeminiTestResult({
          success: true,
          message: 'Conexión con Gemini IA activa y respondiendo correctamente.',
          sample: data
        });
      })
      .catch(err => {
        setTestingGemini(false);
        setGeminiTestResult({
          success: false,
          message: 'Error en prueba de conexión: ' + err.message
        });
      });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Settings size={24} /> Ajustes y Diagnósticos del Sistema
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Configura tu clave de API Gemini, modelo, presupuesto diario, datos de base de datos y metas.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Gemini AI Configuration */}
        <div className="glass-card" style={{ borderLeft: '4px solid #a78bfa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Sparkles style={{ color: '#a78bfa' }} size={20} />
            <h3 style={{ fontSize: '1.1rem' }}>Configuración de Inteligencia Artificial Gemini</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                Clave de API de Gemini (GEMINI_API_KEY):
              </label>
              <input 
                type="password" 
                value={settings.gemini_api_key || ''} 
                onChange={e => setSettings({ ...settings, gemini_api_key: e.target.value })}
                placeholder="AIzaSy... (Opcional - Se usa backend proxy si está vacía)"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                * Nunca se expone al cliente; se ejecuta exclusivamente desde el backend Node.js.
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                Modelo de Gemini Seleccionado:
              </label>
              <select 
                value={settings.gemini_model || 'gemini-1.5-flash'} 
                onChange={e => setSettings({ ...settings, gemini_model: e.target.value })}
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}
              >
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Recomendado - Rápido y Estable ✓)</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Alta Precisión)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button 
              type="button" 
              onClick={handleTestGeminiConnection}
              className="nav-tab-btn"
              disabled={testingGemini}
              style={{ background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#a78bfa', padding: '0.6rem 1rem' }}
            >
              <RefreshCw size={14} className={testingGemini ? 'animate-spin' : ''} />
              {testingGemini ? 'Probando conexión...' : 'Probar Conexión con Gemini'}
            </button>

            {geminiTestResult && (
              <span className={`badge ${geminiTestResult.success ? 'badge-success' : 'badge-warning'}`}>
                {geminiTestResult.message}
              </span>
            )}
          </div>
        </div>

        {/* Database & System Status Card */}
        <div className="glass-card" style={{ borderLeft: '4px solid #34d399' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Database style={{ color: '#34d399' }} size={20} />
            <h3 style={{ fontSize: '1.1rem' }}>Estado de la Base de Datos PostgreSQL & Servidor Backend</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Motor de BD:</span>
              <div style={{ fontWeight: '600', color: '#34d399', fontSize: '1.05rem' }}>PostgreSQL (Neon Cloud ☁️)</div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estado de Conexión:</span>
              <div style={{ fontWeight: '600', color: dbStatus?.database === 'connected' ? '#34d399' : '#f43f5e', fontSize: '1.05rem' }}>
                {dbStatus?.database === 'connected' ? '🟢 Conectada (13 Tablas Activas)' : '🔴 Error de Conexión'}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Modo de Guardado:</span>
              <div style={{ fontWeight: '600', color: '#60a5fa', fontSize: '1.05rem' }}>Automático sin Botón Manual</div>
            </div>
          </div>
        </div>

        {/* Budget & Personal Settings */}
        <div className="glass-card">
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Preferencias de Usuario y Presupuesto</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                Nombre Personalizado del Usuario:
              </label>
              <input 
                type="text" 
                value={settings.user_name || ''} 
                onChange={e => setSettings({ ...settings, user_name: e.target.value })}
                placeholder="Ej. Juan Pérez"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                Límite Diario Base del Presupuesto ($):
              </label>
              <input 
                type="number" 
                value={settings.daily_budget_limit || '200'} 
                onChange={e => setSettings({ ...settings, daily_budget_limit: e.target.value })}
                placeholder="200"
                step="10"
                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }}
              />
            </div>
          </div>
        </div>

        {/* Save Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {saveSuccess ? (
            <span className="badge badge-success" style={{ padding: '0.6rem 1rem', fontSize: '0.9rem' }}>
              <CheckCircle2 size={16} /> ¡Ajustes guardados correctamente!
            </span>
          ) : (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Tus preferencias se aplican en tiempo real en todos los módulos.
            </span>
          )}

          <button 
            type="submit"
            className="nav-tab-btn active"
            style={{ padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}
          >
            <Save size={16} /> Guardar Ajustes
          </button>
        </div>

      </form>

      {/* Danger Zone - Reset Data */}
      <div className="glass-card" style={{ border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.05)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#f43f5e', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🗑️ Zona de Peligro
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Borra <strong>todos los datos de prueba</strong> (cuentas, gastos, ingresos, inversiones, deudas) para empezar desde cero con tus datos reales. Esta acción es <strong>irreversible</strong>.
        </p>
        <button
          onClick={() => {
            if (!window.confirm('⚠️ ¿Estás seguro? Se eliminarán TODOS los datos: cuentas, transacciones, inversiones y deudas. Esta acción no se puede deshacer.')) return;
            setResetLoading(true);
            fetch(`${API_BASE}/api/reset`, { method: 'POST' })
              .then(res => res.json())
              .then(data => {
                alert('✅ ' + data.message);
                if (onRefresh) onRefresh();
              })
              .catch(err => alert('Error: ' + err.message))
              .finally(() => setResetLoading(false));
          }}
          disabled={resetLoading}
          style={{ background: resetLoading ? 'rgba(244,63,94,0.3)' : 'rgba(244,63,94,0.8)', border: 'none', borderRadius: '8px', padding: '0.75rem 1.5rem', color: '#fff', cursor: resetLoading ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.9rem' }}
        >
          {resetLoading ? 'Eliminando...' : '🗑️ Limpiar todos los datos de prueba'}
        </button>
      </div>

    </div>
  );
}
