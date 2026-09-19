export function formatUsd(n, decimals = 4) {
  const v = parseFloat(String(n ?? 0));
  if (!Number.isFinite(v)) return '$0';
  return `$${v.toFixed(decimals)}`;
}

export function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString();
  } catch {
    return '—';
  }
}
