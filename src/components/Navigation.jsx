import React from 'react';
import { 
  LayoutDashboard, 
  Wallet, 
  TrendingDown, 
  TrendingUp, 
  PiggyBank, 
  CreditCard, 
  Bot, 
  BarChart3, 
  Settings,
  Database,
  Eye,
  EyeOff
} from 'lucide-react';

export const TABS = [
  { id: 'inicio', label: 'Inicio', icon: LayoutDashboard },
  { id: 'cartera', label: 'Cartera', icon: Wallet },
  { id: 'gastos', label: 'Gastos', icon: TrendingDown },
  { id: 'ingresos', label: 'Ingresos', icon: TrendingUp },
  { id: 'inversiones', label: 'Inversiones', icon: PiggyBank },
  { id: 'deudas', label: 'Deudas', icon: CreditCard },
  { id: 'coach', label: 'Coach Financiero', icon: Bot },
  { id: 'analisis', label: 'Análisis', icon: BarChart3 },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
];

export default function Navigation({ activeTab, setActiveTab, apiStatus, hideValues, onToggleHideValues }) {
  return (
    <header className="glass-header">
      <div className="nav-container">
        <div className="logo-brand">
          <Wallet className="w-7 h-7 text-blue-400" style={{ color: '#60a5fa' }} />
          <span>Mis Finanzas</span>
        </div>

        <nav className="nav-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`nav-tab-btn ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onToggleHideValues}
            className="nav-tab-btn"
            title={hideValues ? 'Mostrar montos' : 'Ocultar montos por privacidad'}
            style={{
              background: hideValues ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              border: hideValues ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)',
              color: hideValues ? '#f87171' : '#60a5fa',
              padding: '0.45rem 0.85rem',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.82rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {hideValues ? <EyeOff size={16} /> : <Eye size={16} />}
            <span>{hideValues ? 'Oculto' : 'Visible'}</span>
          </button>

          <div className="badge badge-success">
            <Database size={13} />
            <span>{apiStatus === 'online' ? 'DB Conectada' : 'Conectando...'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
