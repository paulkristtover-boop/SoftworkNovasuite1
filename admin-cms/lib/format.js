export function formatUsd(n, decimals = 4) {
  const v = parseFloat(String(n ?? 0));
  if (Number.isNaN(v)) return '$0';
  return `$${v.toFixed(decimals)}`;
}
export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}
