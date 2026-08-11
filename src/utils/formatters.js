export function formatMoney(amount, hideValues = false, decimals = 2) {
  if (hideValues) return '••••••';
  if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
  const num = parseFloat(amount);
  const formatted = num.toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  return num < 0 ? `-$${Math.abs(num).toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}` : `$${formatted}`;
}
