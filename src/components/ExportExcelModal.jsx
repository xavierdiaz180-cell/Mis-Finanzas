import React, { useState, useEffect } from 'react';
import { X, Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { API_BASE } from '../config';

export default function ExportExcelModal({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [allTransactions, setAllTransactions] = useState([]);
  const [accountsMap, setAccountsMap] = useState({});
  const [categoriesList, setCategoriesList] = useState([]);
  const [monthsList, setMonthsList] = useState([]);

  // Selected Filters
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [selectedAccount, setSelectedAccount] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedType, setSelectedType] = useState('expense');

  useEffect(() => {
    setLoading(true);

    Promise.all([
      fetch(`${API_BASE}/api/transactions?type=all`).then(r => r.json()),
      fetch(`${API_BASE}/api/accounts`).then(r => r.json()),
      fetch(`${API_BASE}/api/categories`).then(r => r.json())
    ])
    .then(([txs, accs, cats]) => {
      setAllTransactions(txs || []);
      setCategoriesList(cats || []);

      const accMap = {};
      (accs || []).forEach(a => { accMap[a.id] = a.name; });
      setAccountsMap(accMap);

      // Extract unique YYYY-MM months from transactions
      const monthsSet = new Set();
      (txs || []).forEach(t => {
        if (t.date && t.date.length >= 7) {
          monthsSet.add(t.date.substring(0, 7));
        }
      });
      const sortedMonths = Array.from(monthsSet).sort().reverse();
      setMonthsList(sortedMonths);

      setLoading(false);
    })
    .catch(err => {
      console.error('Error cargando datos para exportación Excel:', err);
      setLoading(false);
    });
  }, []);

  const handleExport = () => {
    let filtered = allTransactions;

    if (selectedType !== 'all') {
      filtered = filtered.filter(t => t.type === selectedType);
    }
    if (selectedMonth !== 'ALL') {
      filtered = filtered.filter(t => t.date && t.date.startsWith(selectedMonth));
    }
    if (selectedAccount !== 'ALL') {
      const selectedAccName = (accountsMap[selectedAccount] || '').toLowerCase();
      filtered = filtered.filter(t => {
        const matchesId = String(t.account_id) === String(selectedAccount);
        const matchesName = selectedAccName && t.account_name && t.account_name.toLowerCase() === selectedAccName;
        const matchesConcept = selectedAccName && t.concept && t.concept.toLowerCase().includes(selectedAccName);
        return matchesId || matchesName || matchesConcept;
      });
    }
    if (selectedCategory !== 'ALL') {
      filtered = filtered.filter(t => t.category === selectedCategory);
    }

    if (filtered.length === 0) {
      return alert('No hay registros que coincidan con los filtros seleccionados.');
    }

    // Sheet 1: Detalle Completo de Gastos
    const detailData = filtered.map(t => ({
      'ID': t.id,
      'Fecha': t.date,
      'Mes': t.date ? t.date.substring(0, 7) : '',
      'Tipo de Movimiento': t.type === 'expense' ? 'Gasto' : t.type === 'income' ? 'Ingreso' : 'Pago',
      'Concepto': t.concept || '',
      'Categoría': t.category || 'Otros',
      'Tarjeta / Cuenta': t.account_name || accountsMap[t.account_id] || 'N/A',
      'Monto ($ MXN)': parseFloat(t.amount || 0),
      'Método de Registro': t.source === 'voice' ? 'Dictado de Voz' : t.source === 'document' ? 'Escáner Estado Cuenta' : 'Manual',
      'Notas': t.notes || ''
    }));

    const wsDetail = XLSX.utils.json_to_sheet(detailData);
    wsDetail['!cols'] = [
      { wch: 8 },
      { wch: 12 },
      { wch: 10 },
      { wch: 18 },
      { wch: 30 },
      { wch: 18 },
      { wch: 22 },
      { wch: 15 },
      { wch: 22 },
      { wch: 25 }
    ];

    // Sheet 2: Resumen por Mes
    const monthGroups = {};
    filtered.forEach(t => {
      const monthKey = t.date ? t.date.substring(0, 7) : 'Sin fecha';
      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = { count: 0, total: 0 };
      }
      monthGroups[monthKey].count += 1;
      monthGroups[monthKey].total += parseFloat(t.amount || 0);
    });

    const monthSummaryData = Object.keys(monthGroups).sort().reverse().map(m => ({
      'Mes (Año-Mes)': m,
      'Total ($ MXN)': monthGroups[m].total,
      'Cantidad de Movimientos': monthGroups[m].count,
      'Promedio por Movimiento ($)': parseFloat((monthGroups[m].total / monthGroups[m].count).toFixed(2))
    }));
    const wsMonth = XLSX.utils.json_to_sheet(monthSummaryData);
    wsMonth['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 25 }, { wch: 25 }];

    // Sheet 3: Resumen por Tarjeta / Cuenta
    const cardGroups = {};
    filtered.forEach(t => {
      const cardName = t.account_name || accountsMap[t.account_id] || 'Sin Tarjeta';
      if (!cardGroups[cardName]) {
        cardGroups[cardName] = { count: 0, total: 0 };
      }
      cardGroups[cardName].count += 1;
      cardGroups[cardName].total += parseFloat(t.amount || 0);
    });

    const totalFilterSum = filtered.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const cardSummaryData = Object.keys(cardGroups).map(card => ({
      'Tarjeta / Cuenta': card,
      'Total ($ MXN)': cardGroups[card].total,
      'Porcentaje del Total (%)': parseFloat(((cardGroups[card].total / (totalFilterSum || 1)) * 100).toFixed(2)),
      'Cantidad de Movimientos': cardGroups[card].count
    }));
    const wsCard = XLSX.utils.json_to_sheet(cardSummaryData);
    wsCard['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 25 }, { wch: 25 }];

    // Sheet 4: Resumen por Categoría
    const catGroups = {};
    filtered.forEach(t => {
      const catName = t.category || 'Otros';
      if (!catGroups[catName]) {
        catGroups[catName] = { count: 0, total: 0 };
      }
      catGroups[catName].count += 1;
      catGroups[catName].total += parseFloat(t.amount || 0);
    });

    const catSummaryData = Object.keys(catGroups).map(cat => ({
      'Categoría': cat,
      'Total ($ MXN)': catGroups[cat].total,
      'Porcentaje del Total (%)': parseFloat(((catGroups[cat].total / (totalFilterSum || 1)) * 100).toFixed(2)),
      'Cantidad de Movimientos': catGroups[cat].count
    }));
    const wsCat = XLSX.utils.json_to_sheet(catSummaryData);
    wsCat['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 25 }, { wch: 25 }];

    // Create Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle de Gastos');
    XLSX.utils.book_append_sheet(wb, wsMonth, 'Resumen por Mes');
    XLSX.utils.book_append_sheet(wb, wsCard, 'Resumen por Tarjeta');
    XLSX.utils.book_append_sheet(wb, wsCat, 'Resumen por Categoría');

    const monthTag = selectedMonth === 'ALL' ? 'Todos_los_Meses' : selectedMonth;
    const filename = `Mis_Finanzas_Reporte_${monthTag}.xlsx`;

    XLSX.writeFile(wb, filename);

    if (onClose) onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 9999, padding: '1rem'
    }}>
      <div className="glass-card" style={{ maxWidth: '540px', width: '100%' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileSpreadsheet size={24} /> Exportar Reporte a Excel (.xlsx)
            </h3>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Genera hojas filtradas por Mes, Tarjeta/Cuenta y Tipo de Gasto.
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando datos para el archivo Excel...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* Filter 1: Tipo de Movimiento */}
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: '600' }}>
                Tipo de Registros:
              </label>
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white', fontSize: '0.9rem' }}
              >
                <option value="expense">Solo Gastos</option>
                <option value="income">Solo Ingresos</option>
                <option value="all">Todos los Movimientos (Gastos e Ingresos)</option>
              </select>
            </div>

            {/* Filter 2: Mes */}
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: '600' }}>
                Filtrar por Mes:
              </label>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white', fontSize: '0.9rem' }}
              >
                <option value="ALL">📅 Todos los Meses Registrados</option>
                {monthsList.map(m => (
                  <option key={m} value={m}>
                    {new Date(m + '-01T00:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })} ({m})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 3: Tarjeta / Cuenta */}
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: '600' }}>
                Filtrar por Tarjeta / Cuenta:
              </label>
              <select
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white', fontSize: '0.9rem' }}
              >
                <option value="ALL">💳 Todas las Tarjetas y Cuentas</option>
                {Object.keys(accountsMap).map(id => (
                  <option key={id} value={id}>{accountsMap[id]}</option>
                ))}
              </select>
            </div>

            {/* Filter 4: Categoría */}
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', fontWeight: '600' }}>
                Filtrar por Categoría / Tipo de Gasto:
              </label>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-sm)', background: '#121a2b', border: '1px solid var(--border-subtle)', color: 'white', fontSize: '0.9rem' }}
              >
                <option value="ALL">🏷️ Todas las Categorías</option>
                {categoriesList.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Excel Features Callout */}
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              💡 <strong>El archivo Excel generado incluirá 4 pestañas de trabajo:</strong>
              <ul style={{ margin: '0.35rem 0 0 1.1rem', padding: 0 }}>
                <li><strong>Detalle de Gastos:</strong> Todos tus movimientos celda por celda.</li>
                <li><strong>Resumen por Mes:</strong> Totales y promedios mensuales.</li>
                <li><strong>Resumen por Tarjeta:</strong> Gastos acumulados y % por cada tarjeta (Nu, BBVA, DiDi, Mercado Libre, etc.).</li>
                <li><strong>Resumen por Categoría:</strong> Desglose por tipo de gasto (Alimentación, Servicios, etc.).</li>
              </ul>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExport}
              className="nav-tab-btn active"
              style={{
                width: '100%',
                justify: 'center',
                padding: '0.8rem',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                fontSize: '0.95rem',
                fontWeight: '700',
                marginTop: '0.5rem'
              }}
            >
              <Download size={18} /> Descargar Archivo Excel (.xlsx)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
