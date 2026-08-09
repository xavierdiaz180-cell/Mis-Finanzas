import React, { useState, useEffect } from 'react';
import { Wallet, Plus, CreditCard, Banknote, Landmark, ArrowUpRight, ArrowDownRight, History, X, Trash2, Edit3, Check, Sparkles } from 'lucide-react';
import DocumentScannerModal from '../components/DocumentScannerModal';
import { API_BASE } from '../config';


export default function CarteraView({ onRefresh }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountDetails, setAccountDetails] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDocScanner, setShowDocScanner] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBalance, setEditBalance] = useState('');

  // Form state for adding account
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState('bank');
  const [newAccBalance, setNewAccBalance] = useState('');
  const [newAccCreditLimit, setNewAccCreditLimit] = useState('');
  const [newAccInterestRate, setNewAccInterestRate] = useState('');
  const [newAccDueDate, setNewAccDueDate] = useState('');
  const [newAccCutoffDate, setNewAccCutoffDate] = useState('');


  const loadAccounts = () => {
    fetch(`${API_BASE}/api/accounts`)
      .then(res => res.json())
      .then(data => setAccounts(data))
      .catch(err => console.error('Error al cargar cuentas:', err));
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const openAccountDetails = (id) => {
    fetch(`${API_BASE}/api/accounts/${id}`)
      .then(res => res.json())
      .then(data => {
        setSelectedAccount(data.account);
        setAccountDetails(data);
        setEditMode(false);
        setEditName(data.account.name);
        setEditBalance(data.account.balance);
      })
      .catch(err => console.error('Error al cargar detalle de cuenta:', err));
  };

  const handleDeleteAccount = (id) => {
    if (!window.confirm('¿Eliminar esta cuenta y todas sus transacciones? Esta acción no se puede deshacer.')) return;
    fetch(`${API_BASE}/api/accounts/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => {
        setSelectedAccount(null);
        setAccountDetails(null);
        loadAccounts();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al eliminar: ' + err.message));
  };

  const handleEditAccount = (id) => {
    fetch(`${API_BASE}/api/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, balance: parseFloat(editBalance) })
    })
      .then(res => res.json())
      .then(() => {
        setEditMode(false);
        openAccountDetails(id);
        loadAccounts();
        if (onRefresh) onRefresh();
      })
      .catch(err => alert('Error al editar: ' + err.message));
  };

  const handleAddAccount = (e) => {
    e.preventDefault();
    if (!newAccName) return alert('Por favor ingresa un nombre para la cuenta.');

    fetch(`${API_BASE}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newAccName,
        type: newAccType,
        balance: parseFloat(newAccBalance || 0),
        credit_limit: parseFloat(newAccCreditLimit || 0),
        interest_rate: parseFloat(newAccInterestRate || 0),
        due_date: newAccDueDate || null,
        cutoff_date: newAccCutoffDate || null
      })
    })

      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setShowAddModal(false);
        setNewAccName('');
        setNewAccBalance('');
        setNewAccCreditLimit('');
        setNewAccInterestRate('');
        setNewAccDueDate('');
        setNewAccCutoffDate('');
        loadAccounts();
        if (onRefresh) onRefresh();
      })

      .catch(err => alert('Error al agregar cuenta: ' + err.message));
  };

  const getAccountIcon = (type) => {
    switch (type) {
      case 'payroll': return <Landmark size={24} style={{ color: '#60a5fa' }} />;
      case 'bank': return <Landmark size={24} style={{ color: '#34d399' }} />;
      case 'cash': return <Banknote size={24} style={{ color: '#fbbf24' }} />;
      case 'credit_card': return <CreditCard size={24} style={{ color: '#a78bfa' }} />;
      case 'loan': return <CreditCard size={24} style={{ color: '#f43f5e' }} />;
      default: return <Wallet size={24} style={{ color: '#60a5fa' }} />;
    }
  };

  const getAccountTypeName = (type) => {
    switch (type) {
      case 'payroll': return 'Cuenta de Nómina';
      case 'bank': return 'Cuenta Bancaria / Débito';
      case 'cash': return 'Efectivo';
      case 'credit_card': return 'Tarjeta de Crédito';
      case 'loan': return 'Préstamo';
      default: return type;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Header & Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Cartera de Cuentas</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Gestiona tus cuentas bancarias, nómina, efectivo, tarjetas y préstamos. (Las inversiones tienen su pantalla dedicada).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setShowDocScanner(true)}
            className="nav-tab-btn"
            style={{ background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', color: '#a78bfa', padding: '0.75rem 1.25rem' }}
          >
            <Sparkles size={18} /> Escanear Estado de Cuenta (IA Gemini)
          </button>

          <button 
            onClick={() => setShowAddModal(true)}
            className="nav-tab-btn active"
            style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', padding: '0.75rem 1.25rem' }}
          >
            <Plus size={18} /> Agregar Cuenta
          </button>
        </div>
      </div>

      {showDocScanner && (
        <DocumentScannerModal 
          docType="credit_card" 
          onClose={() => setShowDocScanner(false)} 
          onReconciled={() => { loadAccounts(); if (onRefresh) onRefresh(); }} 
        />
      )}


      {/* Account Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {accounts.map(acc => (
          <div 
            key={acc.id} 
            className="glass-card"
            style={{ cursor: 'pointer', position: 'relative' }}
            onClick={() => openAccountDetails(acc.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {getAccountIcon(acc.type)}
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>{acc.name}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {getAccountTypeName(acc.type)}
                  </span>
                </div>
              </div>
            </div>

            {acc.type === 'credit_card' ? (
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Crédito Disponible:</span>
                <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#a78bfa' }}>
                  ${(acc.available_credit || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Límite total: ${acc.credit_limit.toLocaleString('es-MX')} | Deuda Total: ${(acc.total_debt || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </div>
                {acc.msi_pending > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '0.3rem', background: 'rgba(251, 191, 36, 0.08)', padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px dashed rgba(251, 191, 36, 0.3)' }}>
                    Revolvente: ${(acc.balance || 0).toLocaleString('es-MX')} + MSI: ${acc.msi_pending.toLocaleString('es-MX')}
                  </div>
                )}
              </div>
            ) : (

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Saldo Actual:</span>
                <div style={{ fontSize: '1.6rem', fontWeight: '700', color: '#60a5fa' }}>
                  ${acc.balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Account Details Drawer Modal */}
      {selectedAccount && accountDetails && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="glass-card" style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {getAccountIcon(selectedAccount.type)}
                <div>
                  <h3 style={{ fontSize: '1.3rem' }}>{selectedAccount.name}</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{getAccountTypeName(selectedAccount.type)}</span>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedAccount(null); setAccountDetails(null); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Header with Edit/Delete buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {getAccountIcon(selectedAccount.type)}
                <div>
                  {editMode ? (
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '4px 8px', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: '600', width: '180px' }}
                    />
                  ) : (
                    <h3 style={{ fontSize: '1.3rem' }}>{selectedAccount.name}</h3>
                  )}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{getAccountTypeName(selectedAccount.type)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {editMode ? (
                  <>
                    <button onClick={() => handleEditAccount(selectedAccount.id)}
                      style={{ background: '#10b981', border: 'none', borderRadius: '6px', padding: '6px 12px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                      <Check size={14} /> Guardar
                    </button>
                    <button onClick={() => setEditMode(false)}
                      style={{ background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '6px 10px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditMode(true)}
                      title="Editar cuenta"
                      style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', padding: '6px 10px', color: '#60a5fa', cursor: 'pointer' }}>
                      <Edit3 size={15} />
                    </button>
                    <button onClick={() => handleDeleteAccount(selectedAccount.id)}
                      title="Eliminar cuenta"
                      style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: '6px', padding: '6px 10px', color: '#f43f5e', cursor: 'pointer' }}>
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setSelectedAccount(null); setAccountDetails(null); setEditMode(false); }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Edit Balance when in edit mode */}
            {editMode && selectedAccount.type !== 'credit_card' && (
              <div style={{ marginBottom: '1rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '1rem' }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Saldo actual (corregir a tu saldo real):</label>
                <input
                  type="number"
                  value={editBalance}
                  onChange={e => setEditBalance(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: '600', width: '100%' }}
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ingresos del Mes</span>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#34d399' }}>
                  +${accountDetails.month_income.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div style={{ background: 'rgba(244, 63, 94, 0.08)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Gastos del Mes</span>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#f43f5e' }}>
                  -${accountDetails.month_expense.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Last Movement */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Último Movimiento</h4>
              {accountDetails.last_transaction ? (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '600' }}>{accountDetails.last_transaction.concept}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{accountDetails.last_transaction.date} · {accountDetails.last_transaction.category}</div>
                  </div>
                  <div style={{ fontWeight: '700', color: accountDetails.last_transaction.type === 'expense' ? '#f43f5e' : '#34d399' }}>
                    {accountDetails.last_transaction.type === 'expense' ? '-' : '+'}${accountDetails.last_transaction.amount.toLocaleString('es-MX')}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin movimientos registrados en esta cuenta.</div>
              )}
            </div>

            {/* Transaction History */}
            <div>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <History size={16} /> Historial de Transacciones
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                {accountDetails.history.map(tx => (
                  <div key={tx.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>{tx.concept}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tx.date} · {tx.category}</div>
                    </div>
                    <div style={{ fontWeight: '700', color: tx.type === 'expense' ? '#f43f5e' : '#34d399' }}>
                      {tx.type === 'expense' ? '-' : '+'}${tx.amount.toLocaleString('es-MX')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="glass-card" style={{ maxWidth: '480px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem' }}>+ Agregar Nueva Cuenta</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Nombre Personalizado:
                </label>
                <input 
                  type="text" 
                  value={newAccName} 
                  onChange={e => setNewAccName(e.target.value)}
                  placeholder="Ej. Banorte Nómina, Efectivo Cartera, BBVA Platinum"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  Tipo de Cuenta:
                </label>
                <select 
                  value={newAccType} 
                  onChange={e => setNewAccType(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white' }}
                >
                  <option value="bank">Cuenta Bancaria / Débito</option>
                  <option value="payroll">Cuenta de Nómina</option>
                  <option value="cash">Efectivo</option>
                  <option value="credit_card">Tarjeta de Crédito</option>
                  <option value="loan">Préstamo / Crédito Personal</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                  {newAccType === 'credit_card' ? 'Saldo Deudor Actual ($):' : 'Saldo Inicial ($):'}
                </label>
                <input 
                  type="number" 
                  value={newAccBalance} 
                  onChange={e => setNewAccBalance(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }}
                />
              </div>

              {newAccType === 'credit_card' && (
                <>
                  <div>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                      Límite de Crédito Total ($):
                    </label>
                    <input 
                      type="number" 
                      value={newAccCreditLimit} 
                      onChange={e => setNewAccCreditLimit(e.target.value)}
                      placeholder="25000.00"
                      step="0.01"
                      style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Fecha de Corte:</label>
                      <input type="date" value={newAccCutoffDate} onChange={e => setNewAccCutoffDate(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Fecha Límite de Pago:</label>
                      <input type="date" value={newAccDueDate} onChange={e => setNewAccDueDate(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>Tasa de Interés / CAT Anual (%):</label>
                    <input type="number" value={newAccInterestRate} onChange={e => setNewAccInterestRate(e.target.value)} placeholder="68.5" step="0.01" style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', color: 'white' }} />
                  </div>
                </>
              )}


              <button 
                type="submit"
                className="nav-tab-btn active"
                style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem', padding: '0.75rem' }}
              >
                Guardar Cuenta
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
