'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { saveExecutive, setExecutiveActive, deleteExecutive } from '../lib/executives.mjs';

const empty = { name: '', whatsapp_number: '', active: true };

export default function ExecutivesPanel({ executives, onUpdated }) {
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function reset() { setEditing(null); setDraft(empty); }
  async function perform(action, message) {
    if (pending) return;
    setPending(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(message);
      await onUpdated();
    } catch (e) { setError(e.message || 'Could not update executives. Please try again.'); }
    finally { setPending(false); }
  }
  function save(event) {
    event.preventDefault();
    perform(async () => {
      await saveExecutive(supabase, draft, editing?.id || null);
      reset();
    }, editing ? 'Executive updated.' : 'Executive added.');
  }
  function toggle(executive) {
    perform(async () => {
      await setExecutiveActive(supabase, executive.id, !executive.active);
      if (editing?.id === executive.id) setDraft((current) => ({ ...current, active: !executive.active }));
    }, executive.active ? 'Executive deactivated. Existing assignments are preserved.' : 'Executive activated.');
  }
  function remove(executive) {
    perform(async () => {
      await deleteExecutive(supabase, executive.id);
      if (editing?.id === executive.id) reset();
      setDeleting(null);
    }, 'Executive deleted.');
  }

  return (
    <section className="management-panel panel-page space-y-4" aria-labelledby="executives-title">
      <div>
        <h1 id="executives-title" className="text-xl font-semibold">Sales executives</h1>
        <p className="text-sm text-slate-600">Manage the people receiving leads through WhatsApp. These records do not create login accounts.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      <form onSubmit={save} className="bg-white rounded-2xl p-4 space-y-3 border">
        <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : 'Add executive'}</h2>
        <fieldset disabled={pending} className="space-y-3">
          <label className="block text-sm">Full name
            <input className="inp mt-1" required maxLength={200} autoComplete="name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="block text-sm">WhatsApp number
            <input className="inp mt-1" type="tel" required maxLength={80} autoComplete="tel" placeholder="923001234567" aria-describedby="executive-phone-help" value={draft.whatsapp_number} onChange={(e) => setDraft({ ...draft, whatsapp_number: e.target.value })} />
          </label>
          <p id="executive-phone-help" className="text-xs text-slate-500">Include the country code. Pakistani numbers such as 0300 1234567 are converted automatically.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />Active — available for new assignments
          </label>
          <div className="flex gap-2">
            <button type="submit" className="btn bg-slate-900 text-white">{pending ? 'Saving…' : editing ? 'Save changes' : 'Add executive'}</button>
            {editing && <button type="button" className="btn bg-slate-100" onClick={reset}>Cancel editing</button>}
          </div>
        </fieldset>
      </form>
      <div className="flex justify-between items-center gap-2">
        <h2 className="font-semibold">All executives ({executives.length})</h2>
        <button disabled={pending} className="text-sm underline" onClick={() => perform(async () => {}, '')}>Refresh</button>
      </div>
      {!executives.length && <p className="text-sm text-slate-500">No executives yet. Add the first executive above.</p>}
      {executives.map((executive) => (
        <article key={executive.id} className="bg-white rounded-2xl border p-4 space-y-3">
          <div className="flex justify-between gap-2">
            <div className="min-w-0"><p className="font-medium break-words">{executive.name}</p><p className="text-sm text-slate-500 break-all">{executive.whatsapp_number}</p></div>
            <span className={`rounded-full px-2 py-1 text-xs self-start ${executive.active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>{executive.active ? 'Active' : 'Inactive'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={pending} className="btn bg-slate-100" onClick={() => {
              setEditing(executive); setDraft({ name: executive.name, whatsapp_number: executive.whatsapp_number, active: executive.active }); setDeleting(null); setError(''); setNotice('');
            }}>Edit</button>
            <button disabled={pending} className="btn bg-blue-50 text-blue-800" onClick={() => toggle(executive)}>{executive.active ? 'Deactivate' : 'Activate'}</button>
            <button disabled={pending} className="btn bg-red-50 text-red-700" onClick={() => { setDeleting(executive.id); setError(''); }}>Delete</button>
          </div>
          {deleting === executive.id && <div role="alert" className="rounded-xl bg-red-50 p-3 space-y-2">
            <p className="text-sm">Permanently delete {executive.name}? Executives with assigned leads cannot be deleted. Deactivate them to keep their assignments.</p>
            <div className="flex gap-2">
              <button disabled={pending} className="btn bg-red-700 text-white" onClick={() => remove(executive)}>Confirm deletion</button>
              <button disabled={pending} className="btn bg-white" onClick={() => setDeleting(null)}>Cancel</button>
            </div>
          </div>}
        </article>
      ))}
    </section>
  );
}
