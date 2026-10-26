'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { waNumber, ago } from '../lib/util';
import UsersPanel from './UsersPanel';
import ExecutivesPanel from './ExecutivesPanel';

const STATUSES = ['UNASSIGNED', 'ASSIGNED', 'CONTACTED', 'CLOSED', 'LOST', 'ALL'];
const chip = { CREATED: 'bg-amber-100 text-amber-800', ASSIGNED: 'bg-blue-100 text-blue-800', CONTACTED: 'bg-violet-100 text-violet-800', CLOSED: 'bg-green-100 text-green-800', LOST: 'bg-slate-200 text-slate-700' };

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: s } = supabase.auth.onAuthStateChange((_e, x) => setSession(x));
    return () => s.subscription.unsubscribe();
  }, []);
  if (session === undefined) return null;
  return session ? <Leads /> : <Login />;
}

function Login() {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState('');
  const go = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
  };
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={go} className="w-full max-w-sm space-y-3 bg-white p-6 rounded-2xl shadow">
        <h1 className="text-xl font-semibold">Lead Manager</h1>
        <input className="inp" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="inp" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full bg-slate-900 text-white">Sign in</button>
      </form>
    </main>
  );
}

function Leads() {
  const [leads, setLeads] = useState([]), [execs, setExecs] = useState([]), [me, setMe] = useState(null);
  const [st, setSt] = useState('UNASSIGNED'), [q, setQ] = useState(''), [city, setCity] = useState(''), [open, setOpen] = useState(null);
  const [view, setView] = useState('leads'), [loadError, setLoadError] = useState('');
  useEffect(() => { if (me?.role !== 'admin') setView('leads'); }, [me?.role]);

  const load = async () => {
    const [l, e, p] = await Promise.all([
      supabase.from('meta_leads').select('*').order('created_time', { ascending: false }).limit(1000),
      supabase.from('sales_executives').select('*').order('name'),
      supabase.from('profiles').select('full_name,role').maybeSingle(),
    ]);
    const error = l.error || e.error || p.error;
    setLoadError(error ? error.message : '');
    if (l.error || e.error || p.error) return;
    setLeads(l.data || []); setExecs(e.data || []); setMe(p.data);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel('leads').on('postgres_changes', { event: '*', schema: 'public', table: 'meta_leads' }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const exName = useMemo(() => Object.fromEntries(execs.map((x) => [x.id, x.name])), [execs]);
  const dup = useMemo(() => { const m = {}; leads.forEach((l) => { const k = waNumber(l.whatsapp_number); m[k] = (m[k] || 0) + 1; }); return m; }, [leads]);
  const cities = useMemo(() => [...new Set(leads.map((l) => l.city).filter(Boolean))].sort(), [leads]);
  const shown = leads.filter((l) =>
    (st === 'ALL' || (st === 'UNASSIGNED' ? !l.assigned_to : l.assigned_to && l.lead_status === st)) &&
    (!city || l.city === city) &&
    (!q || ((l.full_name || '') + (l.whatsapp_number || '')).toLowerCase().includes(q.toLowerCase())));
  const unassigned = leads.filter((l) => !l.assigned_to).length;
  const today = leads.filter((l) => new Date(l.created_time).toDateString() === new Date().toDateString()).length;

  return (
    <main className="max-w-2xl mx-auto pb-24">
      <header className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur p-3 space-y-2 border-b">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 text-sm">
            <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-medium">{unassigned} unassigned</span>
            <span className="rounded-lg bg-slate-200 px-2.5 py-1">{today} today</span>
          </div>
          <button className="text-sm text-slate-500" onClick={() => supabase.auth.signOut()}>
            {me?.role ? me.role + ' · ' : ''}Sign out
          </button>
        </div>
        {me?.role === 'admin' && <nav className="flex gap-2 overflow-x-auto whitespace-nowrap [&>button]:shrink-0" aria-label="Dashboard">
          <button aria-pressed={view === 'leads'} onClick={() => setView('leads')} className={`btn ${view === 'leads' ? 'bg-slate-900 text-white' : 'bg-white border'}`}>Leads</button>
          <button aria-pressed={view === 'users'} onClick={() => setView('users')} className={`btn ${view === 'users' ? 'bg-slate-900 text-white' : 'bg-white border'}`}>Manage users</button>
          <button aria-pressed={view === 'executives'} onClick={() => setView('executives')} className={`btn ${view === 'executives' ? 'bg-slate-900 text-white' : 'bg-white border'}`}>Sales executives</button>
        </nav>}
        {view === 'leads' && <>
        <input className="inp" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setSt(s)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${st === s ? 'bg-slate-900 text-white' : 'bg-white border'}`}>{s[0] + s.slice(1).toLowerCase()}</button>
          ))}
        </div>
        <select className="inp" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">All cities</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        </>}
      </header>

      {loadError && <p role="alert" className="m-3 rounded-xl bg-red-50 p-3 text-red-700">{loadError}</p>}
      {view === 'users' && me?.role === 'admin' ? <UsersPanel onUpdated={load} /> : view === 'executives' && me?.role === 'admin' ? <ExecutivesPanel executives={execs} onUpdated={load} /> : <>
      <div className="p-3 space-y-2">
        {shown.map((l) => (
          <button key={l.id} onClick={() => setOpen(l)} className="w-full text-left bg-white rounded-2xl p-4 shadow-sm active:bg-slate-100">
            <div className="flex justify-between gap-2">
              <span className="font-semibold">{l.full_name || 'No name'}</span>
              <span className="text-xs text-slate-500">{ago(l.created_time)}</span>
            </div>
            <div className="text-sm text-slate-600 mt-0.5">{l.city || '—'} · {l.property_type_interest || '—'}</div>
            <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 ${chip[l.lead_status] || chip.CREATED}`}>{l.assigned_to ? `${l.lead_status} · ${exName[l.assigned_to] || ''}` : 'UNASSIGNED'}</span>
              {l.priority && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5">{l.priority}</span>}
              {dup[waNumber(l.whatsapp_number)] > 1 && <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5">Duplicate</span>}
            </div>
          </button>
        ))}
        {!shown.length && <p className="text-center text-slate-500 py-12">No leads here.</p>}
      </div>

      {open && <Sheet lead={open} execs={execs} exName={exName} dup={dup} reload={load} onClose={() => setOpen(null)} />}
      </>}
    </main>
  );
}

function Sheet({ lead, execs, exName, dup, reload, onClose }) {
  const [notes, setNotes] = useState(lead.notes || '');
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const [nextOwner, setNextOwner] = useState(''), [confirmUnassign, setConfirmUnassign] = useState(false);
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
    <div className="fixed inset-0 z-20 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => { if (!pending) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="lead-title" className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 id="lead-title" className="text-lg font-semibold">{lead.full_name}</h2>
          <p className="text-sm text-slate-600">{lead.city} · {lead.property_type_interest}</p>
          <p className="text-sm text-slate-600">+{num} {dup[num] > 1 && <b className="text-orange-600">(appears {dup[num]}×)</b>}</p>
          <p className="text-xs text-slate-400 mt-1">{lead.campaign_name} · {lead.platform}</p>
          <div className="flex gap-2 mt-3">
            <a className="btn bg-slate-100" href={`tel:+${num}`}>Call</a>
            <a className="btn bg-green-100 text-green-800" href={`https://wa.me/${num}`}>WhatsApp lead</a>
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
