import React, { useState, useEffect } from 'react';
import Navigation from './components/Navigation';
import InicioView from './views/InicioView';
import CarteraView from './views/CarteraView';
import GastosView from './views/GastosView';
import IngresosView from './views/IngresosView';
import InversionesView from './views/InversionesView';
import DeudasView from './views/DeudasView';
import CoachView from './views/CoachView';
import AnalisisView from './views/AnalisisView';
import AjustesView from './views/AjustesView';
import GraficasView from './views/GraficasView';
import LoginPage from './components/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Database, Server, ShieldCheck } from 'lucide-react';
import { API_BASE } from './config';
import './styles/theme.css';

function MainApp() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('inicio');
  const [apiStatus, setApiStatus] = useState('loading');
  const [summaryData, setSummaryData] = useState(null);
  const [hideValues, setHideValues] = useState(() => {
    return localStorage.getItem('mis_finanzas_privacy') === 'true';
  });

  const toggleHideValues = () => {
    setHideValues(prev => {
      const next = !prev;
      localStorage.setItem('mis_finanzas_privacy', String(next));
      return next;
    });
  };

  const fetchSummary = () => {
    fetch(`${API_BASE}/api/summary`)
      .then(res => res.json())
      .then(data => setSummaryData(data))
      .catch(err => console.error('Error fetching summary:', err));
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    fetch(`${API_BASE}/api/health`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'online') {
          setApiStatus('online');
        } else {
          setApiStatus('error');
        }
      })
      .catch(() => setApiStatus('error'));

    fetchSummary();
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#020617',
        color: '#94a3b8',
        fontSize: '1rem'
      }}>
        Verificando sesión segura...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="app-container">
      <Navigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        apiStatus={apiStatus} 
        hideValues={hideValues}
        onToggleHideValues={toggleHideValues}
      />

      {/* Phase Status Banner */}
      <div className="phase-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span className="badge badge-success">Mis Finanzas V2</span>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Mis Finanzas V2 — Control Privado y Seguro</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Acceso protegido con autenticación JWT y encriptación bcrypt de contraseñas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span className="badge badge-info">
            <ShieldCheck size={14} /> Sesión Activa
          </span>
          <span className="badge badge-success">
            <Database size={14} /> PostgreSQL ACID
          </span>
        </div>
      </div>

      {/* Main View Container */}
      <main>
        {activeTab === 'inicio' && (
          <InicioView summary={summaryData} onNavigate={setActiveTab} hideValues={hideValues} />
        )}

        {activeTab === 'cartera' && (
          <CarteraView onRefresh={fetchSummary} hideValues={hideValues} />
        )}

        {activeTab === 'gastos' && (
          <GastosView onRefresh={fetchSummary} hideValues={hideValues} />
        )}

        {activeTab === 'ingresos' && (
          <IngresosView onRefresh={fetchSummary} hideValues={hideValues} />
        )}

        {activeTab === 'inversiones' && (
          <InversionesView onRefresh={fetchSummary} hideValues={hideValues} />
        )}

        {activeTab === 'deudas' && (
          <DeudasView onRefresh={fetchSummary} hideValues={hideValues} />
        )}

        {activeTab === 'coach' && (
          <CoachView onRefresh={fetchSummary} hideValues={hideValues} />
        )}

        {activeTab === 'analisis' && (
          <AnalisisView onRefresh={fetchSummary} hideValues={hideValues} />
        )}

        {activeTab === 'graficas' && (
          <GraficasView hideValues={hideValues} />
        )}

        {activeTab === 'ajustes' && (
          <AjustesView onRefresh={fetchSummary} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
