'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('sage');
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === 'graphite' ? 'graphite' : 'sage');
    sync();
    const onStorage = (event) => {
      if (event.key !== 'lead-manager-theme' && event.key !== null) return;
      const next = event.newValue === 'graphite' ? 'graphite' : 'sage';
      document.documentElement.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'graphite' ? '#12212b' : '#f7f8ef');
      sync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const dark = theme === 'graphite';
  function toggle() {
    const next = dark ? 'sage' : 'graphite';
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'graphite' ? '#12212b' : '#f7f8ef');
    setTheme(next);
    try { localStorage.setItem('lead-manager-theme', next); } catch { /* The switch still works when storage is unavailable. */ }
  }
  return <button type="button" role="switch" aria-checked={dark} aria-label="Graphite & Amber theme" title={dark ? 'Switch to Sage & Sand' : 'Switch to Graphite & Amber'} className="theme-toggle" onClick={toggle}>
    <span className="theme-name" aria-hidden="true">{dark ? 'Graphite & Amber' : 'Sage & Sand'}</span>
    <span className="theme-track" aria-hidden="true"><span className="theme-thumb"><Icon name={dark ? 'moon' : 'sun'} size={15}/></span></span>
  </button>;
}
