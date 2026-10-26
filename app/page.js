'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { waNumber, ago, pakistanDateKey, dateRangeForPreset } from '../lib/util';
import UsersPanel from './UsersPanel';
import ExecutivesPanel from './ExecutivesPanel';
import Icon from './Icon';

const STATUSES = ['UNASSIGNED', 'ASSIGNED', 'CONTACTED', 'CLOSED', 'LOST', 'ALL'];
const chip = { CREATED: 'bg-amber-100 text-amber-800', ASSIGNED: 'bg-blue-100 text-blue-800', CONTACTED: 'bg-violet-100 text-violet-800', CLOSED: 'bg-green-100 text-green-800', LOST: 'bg-slate-200 text-slate-700' };

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: s } = supabase.auth.onAuthStateChange((_e, x) => setSession(x));
    return () => s.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <main className="app-loading"><span className="brand-mark"><Icon name="spark" size={28}/></span><p>Opening your workspace…</p></main>;
  return session ? <Leads /> : <Login />;
}

function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState('');
  const [pending, setPending] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    setPending(true); setErr('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) setErr(error.message);
    } catch { setErr('Could not sign in. Check your connection and try again.'); }
    finally { setPending(false); }
  };
  return (
    <main className="login-screen">
      <div className="login-brand"><span className="brand-mark"><Icon name="spark" size={28}/></span><span>Lead Manager<span className="eyebrow">YOUR SALES WORKSPACE</span></span></div>
      <div className="login-intro"><span className="eyebrow">EVERY CONNECTION COUNTS</span><h1>Your next opportunity<br/>starts here<span>.</span></h1><p>A focused space for your leads, your team,<br/>and everything that comes next.</p></div>
      <form onSubmit={go} className="login-card">
        <h2>Welcome back</h2><p>Sign in to your workspace.</p>
        <label>Email address<input className="inp" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input className="inp" type="password" autoComplete="current-password" placeholder="Enter your password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {err && <p role="alert" className="form-error">{err}</p>}
        <button disabled={pending} className="btn primary login-submit">{pending ? 'Signing in…' : 'Sign in'}<Icon name="arrow"/></button>
        <span className="login-footnote">Access for authorized team members</span>
      </form>
      <p className="login-footer">Built for meaningful connections.</p>
    </main>
  );
}

function Leads() {
  const [leads, setLeads] = useState([]), [execs, setExecs] = useState([]), [me, setMe] = useState(null);
  const [st, setSt] = useState('UNASSIGNED'), [q, setQ] = useState(''), [city, setCity] = useState(''), [open, setOpen] = useState(null);
  const [view, setView] = useState('leads'), [loadError, setLoadError] = useState('');
  const [datePreset, setDatePreset] = useState('all'), [customFrom, setCustomFrom] = useState(''), [customTo, setCustomTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false), [loading, setLoading] = useState(true);
  useEffect(() => { if (me?.role !== 'admin') setView('leads'); }, [me?.role]);

  const load = async () => {
    const allLeads = [];
    let offset = 0;
    let leadError = null;
    do {
      const page = await supabase.from('meta_leads').select('*').order('created_time', { ascending: false }).range(offset, offset + 999);
      if (page.error) { leadError = page.error; break; }
      allLeads.push(...(page.data || []));
      if ((page.data || []).length < 1000) break;
      offset += 1000;
    } while (true);
    const [e, p] = await Promise.all([
      supabase.from('sales_executives').select('*').order('name'),
      supabase.from('profiles').select('full_name,role').maybeSingle(),
    ]);
    const error = leadError || e.error || p.error;
    setLoadError(error ? error.message : '');
    setLoading(false);
    if (leadError || e.error || p.error) return;
    setLeads(allLeads); setExecs(e.data || []); setMe(p.data);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel('leads').on('postgres_changes', { event: '*', schema: 'public', table: 'meta_leads' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const exName = useMemo(() => Object.fromEntries(execs.map((x) => [x.id, x.name])), [execs]);
  const dup = useMemo(() => { const m = {}; leads.forEach((l) => { const k = waNumber(l.whatsapp_number); m[k] = (m[k] || 0) + 1; }); return m; }, [leads]);
  const cities = useMemo(() => [...new Set(leads.map((l) => l.city).filter(Boolean))].sort(), [leads]);
  const dateRange = datePreset === 'custom' ? { from: customFrom, to: customTo } : dateRangeForPreset(datePreset);
  const inDateRange = (lead) => {
    if (!dateRange.from && !dateRange.to) return true;
    const key = pakistanDateKey(lead.created_time);
    return (!dateRange.from || key >= dateRange.from) && (!dateRange.to || key <= dateRange.to);
  };
  const shown = leads.filter((l) =>
    inDateRange(l) &&
    (st === 'ALL' || (st === 'UNASSIGNED' ? !l.assigned_to : l.assigned_to && l.lead_status === st)) &&
    (!city || l.city === city) &&
    (!q || ((l.full_name || '') + (l.whatsapp_number || '')).toLowerCase().includes(q.toLowerCase())));
  const unassigned = leads.filter((l) => !l.assigned_to).length;
  const today = leads.filter((l) => pakistanDateKey(l.created_time) === pakistanDateKey()).length;
  const yesterday = leads.filter((l) => pakistanDateKey(l.created_time) === dateRangeForPreset('yesterday').from).length;
  const last7 = leads.filter((l) => { const key = pakistanDateKey(l.created_time); const range = dateRangeForPreset('last7'); return key >= range.from && key <= range.to; }).length;
  const applyPreset = (preset) => { setDatePreset(preset); if (preset !== 'custom') { setCustomFrom(''); setCustomTo(''); } };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup"><span className="brand-mark"><Icon name="spark"/></span><div>Lead Manager<span className="eyebrow">MOBILE CRM · {me?.role || 'Team'}</span></div></div>
        <button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => supabase.auth.signOut()}><Icon name="logout"/></button>
      </header>
      {view === 'leads' && <section className="dashboard-top">
        <div className="welcome-row"><div><p className="eyebrow">YOUR PIPELINE, IN FOCUS</p><h1>Dashboard<span className="accent">.</span></h1></div><span className="profile-avatar">{(me?.full_name || 'LM').slice(0, 2).toUpperCase()}</span></div>
        <div className="overview-card"><div><span className="overview-greeting">Welcome Back</span><div className="overview-name">{me?.full_name || 'Team member'}</div><div className="overview-number"><Icon name="users" size={18}/><span>{unassigned} unassigned {unassigned === 1 ? 'lead is' : 'leads are'} ready for follow-up</span></div></div><button className="overview-link" onClick={() => { setSt('UNASSIGNED'); applyPreset('all'); setQ(''); setCity(''); }}>View<Icon name="arrow" size={18}/></button></div>
        <div className="date-stats" aria-label="Lead date filters">
          {[['today', 'Today', today], ['yesterday', 'Yesterday', yesterday], ['last7', 'Last 7 days', last7]].map(([preset, label, count]) => <button key={preset} aria-pressed={datePreset === preset} className={`stat-card ${datePreset === preset ? 'selected' : ''}`} onClick={() => applyPreset(preset)}><span>{label}<Icon name="arrow" size={14}/></span><strong>{count}</strong><small>leads received</small></button>)}
        </div>
        <div className="search-row"><label className="search-box"><Icon name="search"/><input aria-label="Search leads" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)}/>{q && <button aria-label="Clear search" onClick={() => setQ('')}><Icon name="close" size={16}/></button>}</label><button aria-expanded={filtersOpen} aria-controls="advanced-filters" aria-label="City and date filters" className={`icon-button filter-toggle ${filtersOpen || city || datePreset === 'custom' ? 'selected' : ''}`} onClick={() => setFiltersOpen(!filtersOpen)}><Icon name="filter"/></button></div>
        <div className="status-tabs" aria-label="Lead status">
          {STATUSES.map((s) => (
            <button key={s} aria-pressed={st === s} onClick={() => setSt(s)} className={st === s ? 'selected' : ''}>{s[0] + s.slice(1).toLowerCase()}</button>
          ))}
        </div>
        {filtersOpen && <div id="advanced-filters" className="advanced-filters"><div className="filter-heading"><span><Icon name="filter" size={16}/>Refine your leads</span><button onClick={() => { setCity(''); applyPreset('all'); }}>Reset filters</button></div><label className="field-label">City<select className="inp" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">All cities</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select></label>
        <div className="date-inputs">
          <label className="field-label">From
            <input className="inp mt-1" type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setDatePreset('custom'); }} />
          </label>
          <label className="field-label">To
            <input className="inp mt-1" type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setDatePreset('custom'); }} />
          </label>
        </div><p className="timezone-note">Dates use Pakistan time · UTC+5</p></div>}
        <div className="results-heading"><h2>{st === 'ALL' ? 'All leads' : st[0] + st.slice(1).toLowerCase() + ' leads'}<span>{shown.length}</span></h2>{(datePreset !== 'all' || city) && <button className="clear-filter" onClick={() => { applyPreset('all'); setCity(''); }}>Clear filters<Icon name="close" size={13}/></button>}</div>
      </section>}

      {loadError && <p role="alert" className="m-3 rounded-xl bg-red-50 p-3 text-red-700">{loadError}</p>}
      {view === 'users' && me?.role === 'admin' ? <UsersPanel onUpdated={load} /> : view === 'executives' && me?.role === 'admin' ? <ExecutivesPanel executives={execs} onUpdated={load} /> : <>
      <div className="lead-list">
        {loading && <div className="empty-state" role="status"><Icon name="refresh" size={28}/><h3>Getting your leads ready</h3><p>Your workspace is loading.</p></div>}
        {shown.map((l) => (
          <button key={l.id} onClick={() => setOpen(l)} className="lead-card">
            <div className="lead-card-top"><span className={`lead-avatar tone-${(l.full_name || '').length % 4}`}>{(l.full_name || '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('')}</span><div className="lead-identity"><h3>{l.full_name || 'No name'}</h3><span><Icon name="location" size={12}/>{l.city || 'Location unavailable'}</span></div><span className="lead-time">{ago(l.created_time)}</span></div>
            <div className="lead-interest"><Icon name="briefcase" size={14}/><span>{l.property_type_interest || 'Property interest not specified'}</span></div>
            <div className="lead-card-bottom"><div className="lead-badges"><span className={`status-pill status-${l.assigned_to ? (l.lead_status || 'ASSIGNED').toLowerCase() : 'unassigned'}`}>{l.assigned_to ? (l.lead_status || 'ASSIGNED').toLowerCase() : 'Unassigned'}</span>{l.priority && <span className="status-pill status-lost">{l.priority}</span>}{dup[waNumber(l.whatsapp_number)] > 1 && <span className="status-pill status-unassigned">Duplicate</span>}</div><span className="lead-open"><Icon name="chevron" size={16}/></span></div>
            {l.assigned_to && <p className="lead-owner">Assigned to {exName[l.assigned_to] || 'executive'}</p>}
          </button>
        ))}
        {!loading && !shown.length && <div className="empty-state"><Icon name="search" size={30}/><h3>A little room for opportunity</h3><p>No leads match these filters.</p><button className="btn secondary" onClick={() => { setSt('ALL'); setCity(''); setQ(''); applyPreset('all'); }}>Show all leads</button></div>}
      </div>

      {open && <Sheet lead={open} execs={execs} exName={exName} dup={dup} reload={load} onClose={() => setOpen(null)} />}
      </>}
      <nav className="bottom-nav" aria-label="Main navigation"><button aria-current={view === 'leads' ? 'page' : undefined} onClick={() => setView('leads')}><Icon name="grid"/><span>Leads</span></button>{me?.role === 'admin' && <><button aria-current={view === 'executives' ? 'page' : undefined} onClick={() => setView('executives')}><Icon name="briefcase"/><span>Executives</span></button><button aria-current={view === 'users' ? 'page' : undefined} onClick={() => setView('users')}><Icon name="users"/><span>Team</span></button></>}<button onClick={load} aria-label="Refresh workspace"><Icon name="refresh"/><span>Refresh</span></button></nav>
    </main>
  );
}

function Sheet({ lead, execs, exName, dup, reload, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector('button')?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  const [notes, setNotes] = useState(lead.notes || '');
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const [nextOwner, setNextOwner] = useState(''), [confirmUnassign, setConfirmUnassign] = useState(false);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !pending) { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const controls = [...(dialogRef.current?.querySelectorAll('button, a[href], input, textarea, select') || [])].filter((el) => !el.matches(':disabled') && el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, onClose]);
  const activeExecs = execs.filter((ex) => ex.active);
  const num = waNumber(lead.whatsapp_number);
  const msg = `New lead: ${lead.full_name} | +${num} | ${lead.city || '-'} | Interested in: ${lead.property_type_interest || '-'}`;
  const send = (ex) => { location.href = `https://wa.me/${waNumber(ex.whatsapp_number)}?text=${encodeURIComponent(msg)}`; };
  const assign = async (ex, whatsapp = false) => {
    if (pending) return;
    if (ex === undefined) { setError('Choose an active executive before reassigning.'); return; }
    if (notes !== (lead.notes || '')) { setError('Save your notes before changing assignment.'); return; }
    setPending(true); setError('');
    try {
      const result = await supabase.rpc('change_lead_assignment', {
        p_id: lead.id, p_exec: ex?.id || null,
        p_expected_exec: lead.assigned_to || null, p_expected_at: lead.assigned_at || null,
      });
      if (result.error) throw result.error;
      await reload(); onClose();
      if (whatsapp && ex) send(ex);
    } catch (e) { setError(e.message || 'Assignment could not be changed.'); }
    finally { setPending(false); }
  };
  const save = async (s) => {
    if (pending) return;
    setPending(true); setError('');
    try {
      const result = await supabase.rpc('update_lead', { p_id: lead.id, p_status: s, p_notes: notes });
      if (result.error) throw result.error;
      await reload(); onClose();
    } catch (e) { setError(e.message || 'Lead could not be saved.'); }
    finally { setPending(false); }
  };
  const owner = execs.find((x) => x.id === lead.assigned_to);

  return (
    <div className="sheet-backdrop" onClick={() => { if (!pending) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="lead-title" className="lead-sheet management-panel space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle"/><div className="sheet-topline"><span className="eyebrow">LEAD DETAILS</span><button disabled={pending} className="icon-button" aria-label="Close lead details" onClick={onClose}><Icon name="close"/></button></div>
        <div>
          <h2 id="lead-title" className="text-lg font-semibold">{lead.full_name}</h2>
          <p className="text-sm text-slate-600">{lead.city} · {lead.property_type_interest}</p>
          <p className="text-sm text-slate-600">+{num} {dup[num] > 1 && <b className="text-orange-600">(appears {dup[num]}×)</b>}</p>
          <p className="text-xs text-slate-400 mt-1">{lead.campaign_name} · {lead.platform}</p>
          <div className="flex gap-2 mt-3">
            <a className="btn secondary" href={`tel:+${num}`}><Icon name="phone" size={16}/>Call</a>
            <a className="btn primary" href={`https://wa.me/${num}`}><Icon name="chat" size={16}/>WhatsApp</a>
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <fieldset disabled={pending} className="space-y-4">
        {!lead.assigned_to ? (
          <div>
            <p className="text-sm font-medium mb-2">Assign via WhatsApp</p>
            <div className="space-y-2">
              {activeExecs.map((ex) => <button key={ex.id} onClick={() => assign(ex, true)} className="btn w-full bg-green-600 text-white text-left">{ex.name}</button>)}
              {!activeExecs.length && <p className="text-sm text-slate-500">No active executives. Add some in the sales_executives table.</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Assigned to <b>{exName[lead.assigned_to] || 'Unknown executive'}</b>{owner && !owner.active && ' (inactive)'} {ago(lead.assigned_at)}</p>
            {owner && <button onClick={() => send(owner)} className="btn w-full bg-green-600 text-white">Resend to {owner.name}</button>}
            <div className="rounded-xl border p-3 space-y-2">
              <label className="block text-sm font-medium" htmlFor="next-owner">Reassign lead</label>
              <select id="next-owner" className="inp" value={nextOwner} onChange={(e) => setNextOwner(e.target.value)}>
                <option value="">Choose another executive</option>
                {activeExecs.filter((ex) => ex.id !== lead.assigned_to).map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>
              <p className="text-xs text-slate-500">Resets status to Assigned and keeps saved notes. You can send the lead via WhatsApp afterward.</p>
              <button disabled={!nextOwner || pending} className="btn bg-blue-100 text-blue-800" onClick={() => assign(activeExecs.find((ex) => ex.id === nextOwner))}>Reassign</button>
              <button className="btn text-red-700" onClick={() => setConfirmUnassign(true)}>Unassign lead</button>
              {confirmUnassign && <div className="rounded-xl bg-amber-50 p-3 space-y-2">
                <p className="text-sm">Return this lead to Unassigned? Status becomes Created; saved notes are kept.</p>
                <button className="btn bg-amber-200" onClick={() => assign(null)}>Confirm unassign</button>
                <button className="btn" onClick={() => setConfirmUnassign(false)}>Cancel</button>
              </div>}
            </div>
            <textarea className="inp" rows={3} placeholder="Follow-up notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button className="btn bg-slate-100" onClick={() => save(lead.lead_status || 'ASSIGNED')}>Save notes</button>
            <div className="grid grid-cols-3 gap-2">
              {['CONTACTED', 'CLOSED', 'LOST'].map((s) => <button key={s} onClick={() => save(s)} className={`btn ${chip[s]}`}>{s[0] + s.slice(1).toLowerCase()}</button>)}
            </div>
          </div>
        )}
        {!lead.assigned_to && <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="unassigned-notes">Follow-up notes</label>
          <textarea id="unassigned-notes" className="inp" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn bg-slate-100" onClick={() => save(lead.lead_status || 'CREATED')}>Save notes</button>
        </div>}
        {pending && <p role="status" className="text-sm text-slate-500">Saving…</p>}
        <button className="btn w-full bg-slate-100" onClick={onClose}>Close</button>
        </fieldset>
      </div>
    </div>
  );
}
