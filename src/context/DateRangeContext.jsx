import React, { createContext, useContext, useState } from 'react';

const DateRangeContext = createContext(null);

function formatDateString(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getPresetDates(presetKey) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  if (presetKey === 'current_month') {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const label = start.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    return {
      startDate: formatDateString(start),
      endDate: formatDateString(end),
      preset: 'current_month',
      label: label.charAt(0).toUpperCase() + label.slice(1)
    };
  }

  if (presetKey === 'prev_month') {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const label = start.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    return {
      startDate: formatDateString(start),
      endDate: formatDateString(end),
      preset: 'prev_month',
      label: label.charAt(0).toUpperCase() + label.slice(1)
    };
  }

  if (presetKey === 'last_3m') {
    const start = new Date(year, month - 2, 1);
    const end = new Date(year, month + 1, 0);
    return {
      startDate: formatDateString(start),
      endDate: formatDateString(end),
      preset: 'last_3m',
      label: `${start.toLocaleDateString('es-MX', { month: 'short' })} — ${end.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}`
    };
  }

  if (presetKey === 'last_6m') {
    const start = new Date(year, month - 5, 1);
    const end = new Date(year, month + 1, 0);
    return {
      startDate: formatDateString(start),
      endDate: formatDateString(end),
      preset: 'last_6m',
      label: `${start.toLocaleDateString('es-MX', { month: 'short' })} — ${end.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}`
    };
  }

  if (presetKey === 'ytd') {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return {
      startDate: formatDateString(start),
      endDate: formatDateString(end),
      preset: 'ytd',
      label: `Año ${year}`
    };
  }

  if (presetKey === 'all') {
    return {
      startDate: '2020-01-01',
      endDate: '2030-12-31',
      preset: 'all',
      label: 'Todo el Historial'
    };
  }

  // Default: current month
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const label = start.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return {
    startDate: formatDateString(start),
    endDate: formatDateString(end),
    preset: 'current_month',
    label: label.charAt(0).toUpperCase() + label.slice(1)
  };
}

export function DateRangeProvider({ children }) {
  const [rangeState, setRangeState] = useState(() => {
    try {
      const saved = localStorage.getItem('mis_finanzas_date_range');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.startDate && parsed.endDate) {
          return parsed;
        }
      }
    } catch (_) {}
    return getPresetDates('current_month');
  });

  const setPreset = (presetKey) => {
    const next = getPresetDates(presetKey);
    setRangeState(next);
    try {
      localStorage.setItem('mis_finanzas_date_range', JSON.stringify(next));
    } catch (_) {}
  };

  const setCustomRange = (startStr, endStr) => {
    if (!startStr || !endStr) return;
    const startDateObj = new Date(startStr + 'T00:00:00');
    const endDateObj = new Date(endStr + 'T00:00:00');
    const label = `${startDateObj.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} — ${endDateObj.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    const next = {
      startDate: startStr,
      endDate: endStr,
      preset: 'custom',
      label
    };
    setRangeState(next);
    try {
      localStorage.setItem('mis_finanzas_date_range', JSON.stringify(next));
    } catch (_) {}
  };

  const queryParams = `startDate=${rangeState.startDate}&endDate=${rangeState.endDate}`;

  return (
    <DateRangeContext.Provider value={{
      ...rangeState,
      setPreset,
      setCustomRange,
      queryParams
    }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const context = useContext(DateRangeContext);
  if (!context) {
    return {
      ...getPresetDates('current_month'),
      setPreset: () => {},
      setCustomRange: () => {},
      queryParams: ''
    };
  }
  return context;
}
