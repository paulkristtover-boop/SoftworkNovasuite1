export function formatUsd(n: string | number | null | undefined, decimals = 4) {
  const v = parseFloat(String(n ?? 0));
  if (Number.isNaN(v)) return '$0';
  return `$${v.toFixed(decimals)}`;
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}
