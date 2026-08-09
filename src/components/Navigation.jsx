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
  Database
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

export default function Navigation({ activeTab, setActiveTab, apiStatus }) {
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

        <div className="badge badge-success">
          <Database size={13} />
          <span>{apiStatus === 'online' ? 'DB Conectada' : 'Conectando...'}</span>
        </div>
      </div>
    </header>
  );
}
