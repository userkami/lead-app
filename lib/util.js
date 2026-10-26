// Normalises "p:+92 300-1234567", "0300 1234567", "3001234567" -> "923001234567" (wa.me format)
export function waNumber(raw) {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '92' + d.slice(1);
  else if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d;
}
export const ago = (t) => {
  const m = Math.floor((Date.now() - new Date(t)) / 6e4);
  return m < 1 ? 'now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago';
};
