export { waNumber } from './phone.mjs';
export const ago = (t) => {
  const m = Math.floor((Date.now() - new Date(t)) / 6e4);
  return m < 1 ? 'now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago';
};
