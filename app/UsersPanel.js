'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const empty = { full_name: '', email: '', role: 'manager', password: '' };

export default function UsersPanel({ onUpdated }) {
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function api(method = 'GET', body) {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) throw new Error('Sign in again to manage users.');
    const result = await fetch('/api/users', {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await result.json();
    if (!result.ok) throw new Error(payload.error || 'User operation failed.');
    return payload;
  }
  async function load() {
    setLoading(true);
    try { setUsers((await api()).users); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  function reset() { setEditing(null); setDraft(empty); }
  async function save(event) {
    event.preventDefault();
    setError(''); setNotice(''); setPending(true);
    try {
      await api(editing ? 'PATCH' : 'POST', { ...draft, ...(editing ? { id: editing.id } : {}) });
      setNotice(editing ? 'User updated.' : 'User created. They can sign in with the password you set.');
      reset(); await load(); await onUpdated();
    } catch (e) { setError(e.message); }
    finally { setPending(false); }
  }
  async function remove(user) {
    setError(''); setNotice(''); setPending(true);
    try {
      await api('DELETE', { id: user.id });
      if (editing?.id === user.id) reset();
      setDeleting(null); setNotice('User deleted. Existing leads are preserved.'); await load();
    } catch (e) { setError(e.message); }
    finally { setPending(false); }
  }
  const set = (field) => (event) => setDraft({ ...draft, [field]: event.target.value });

  return (
    <section className="management-panel panel-page space-y-4" aria-labelledby="users-title">
      <div>
        <h1 id="users-title" className="text-xl font-semibold">Manage users</h1>
        <p className="text-sm text-slate-600">Admin and manager login accounts. Both roles can assign, reassign, and unassign leads.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      <form onSubmit={save} className="bg-white rounded-2xl p-4 space-y-3 border">
        <h2 className="font-semibold">{editing ? `Edit ${editing.full_name}` : 'Add user'}</h2>
        <fieldset disabled={pending} className="space-y-3">
          <label className="block text-sm">Full name
            <input className="inp mt-1" required maxLength={200} autoComplete="off" value={draft.full_name} onChange={set('full_name')} />
          </label>
          <label className="block text-sm">Email
            <input className="inp mt-1" type="email" required maxLength={254} autoComplete="off" value={draft.email} onChange={set('email')} />
          </label>
          <label className="block text-sm">Role
            <select className="inp mt-1" value={draft.role} onChange={set('role')} disabled={editing?.is_self}>
              <option value="manager">Manager</option><option value="admin">Admin</option>
            </select>
          </label>
          <label className="block text-sm">{editing ? 'New password (leave blank to keep current)' : 'Password'}
            <input className="inp mt-1" type="password" autoComplete="new-password" minLength={12} maxLength={128} required={!editing} value={draft.password} onChange={set('password')} />
          </label>
          <p className="text-xs text-slate-500">Use at least 12 characters. Share login details privately with the user.</p>
          <div className="flex gap-2">
            <button className="btn bg-slate-900 text-white" type="submit">{pending ? 'Saving…' : editing ? 'Save changes' : 'Create user'}</button>
            {editing && <button className="btn bg-slate-100" type="button" onClick={reset}>Cancel editing</button>}
          </div>
        </fieldset>
      </form>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Staff accounts</h2>
        <button className="text-sm underline" disabled={pending || loading} onClick={() => { setError(''); load(); }}>Refresh</button>
      </div>
      {loading ? <p role="status">Loading users…</p> : !users.length ? <p>No staff accounts found.</p> : users.map((user) => (
        <article key={user.id} className="bg-white rounded-2xl p-4 border space-y-2">
          <div className="flex justify-between gap-2">
            <div className="min-w-0"><p className="font-medium break-words">{user.full_name || 'Unnamed user'}{user.is_self && ' (you)'}</p><p className="text-sm text-slate-500 break-all">{user.email}</p></div>
            <span className="text-sm capitalize">{user.role}</span>
          </div>
          <div className="flex gap-2">
            <button disabled={pending} className="btn bg-slate-100" onClick={() => { setEditing(user); setDraft({ full_name: user.full_name || '', email: user.email, role: user.role, password: '' }); setDeleting(null); setError(''); setNotice(''); }}>Edit</button>
            {!user.is_self && <button disabled={pending} className="btn bg-red-50 text-red-700" onClick={() => setDeleting(user.id)}>Delete</button>}
          </div>
          {deleting === user.id && <div className="rounded-xl bg-red-50 p-3 space-y-2" role="alert">
            <p className="text-sm">Delete {user.full_name || user.email}? Their login will be removed permanently. Existing leads and executive assignments will be preserved.</p>
            <div className="flex gap-2">
              <button disabled={pending} className="btn bg-red-700 text-white" onClick={() => remove(user)}>{pending ? 'Deleting…' : 'Confirm deletion'}</button>
              <button disabled={pending} className="btn bg-white" onClick={() => setDeleting(null)}>Cancel</button>
            </div>
          </div>}
        </article>
      ))}
    </section>
  );
}
