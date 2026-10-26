export { waNumber } from './phone.mjs';
export const PAKISTAN_TIMEZONE = 'Asia/Karachi';

export function pakistanDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PAKISTAN_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

export function shiftDateKey(key, days) {
  const date = new Date(`${key}T12:00:00+05:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateRangeForPreset(preset, today = pakistanDateKey()) {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') { const day = shiftDateKey(today, -1); return { from: day, to: day }; }
  if (preset === 'last7') return { from: shiftDateKey(today, -6), to: today };
  return { from: '', to: '' };
}
export const ago = (t) => {
  const m = Math.floor((Date.now() - new Date(t)) / 6e4);
  return m < 1 ? 'now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago';
};
