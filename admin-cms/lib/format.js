export function money(n) {
  const v = Number(n) || 0;
  return `${v.toFixed(2)} USDT`;
}

export function shortId(id) {
  if (!id) return '—';
  return String(id).slice(0, 8);
}

export function dt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}
