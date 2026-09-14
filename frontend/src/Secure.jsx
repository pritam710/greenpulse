import { useCallback, useEffect, useRef, useState } from 'react';
import { api, hasToken, readPhoto, setToken } from './api';
import './security.css';
import { Auth, useAuth } from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const userId = user?.id;
  const refresh = useCallback(async () => {
    if (userId) try { setUser(await api('/auth/me')); } catch (e) { setError(e.message); }
  }, [userId]);
  useEffect(() => {
    const expired = () => { setUser(null); setError('Session expired. Please sign in again.'); };
    window.addEventListener('greenpulse-session-expired', expired);
    let active = true;
    if (hasToken()) api('/auth/me').then(account => { if (active) setUser(account); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; window.removeEventListener('greenpulse-session-expired', expired); };
  }, []);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setToken(''); setUser(null); setError('');
    } catch (e) { setError(`${e.message} Sign-out was not confirmed; retry before leaving this device.`); }
  }
  return <Auth.Provider value={{ user, setUser, refresh }}>
    <div className="account-bar">{user ? <><span>{user.name} · {user.role === 'Driver' ? 'Field worker' : user.role}</span><button onClick={logout}>Sign out</button></> : <span>Secure reporting · Sign in when you submit or track a report</span>}{error && <p role="alert">{error}</p>}</div>
    {children}
  </Auth.Provider>;
}

export function Access({ role, children, close }) {
  const { user, setUser } = useAuth();
  const [register, setRegister] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const panel = useRef(null), previousFocus = useRef(null);
  useEffect(() => {
    if (!close || user) return;
    previousFocus.current = document.activeElement;
    panel.current?.querySelector('input, button, [href]')?.focus();
    return () => previousFocus.current?.focus?.();
  }, [close, user]);
  function dialogKeys(event) {
    if (!close) return;
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    const fields = new FormData(event.currentTarget);
    const body = { email: fields.get('email'), password: fields.get('password') };
    try {
      if (register) {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ ...body, name: fields.get('name'), consent_accepted: true, policy_version: '2026-09-06' }) });
        setRegister(false); setMessage('Account created. Now sign in.');
      } else {
        const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(body) });
        setToken(result.token); setUser(result.user);
      }
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  if (user) return user.role === role ? children : <section className="security-panel"><h2>Restricted workspace</h2><p>Sign out and use an authorized {role === 'Driver' ? 'field worker' : role.toLowerCase()} account.</p>{close && <button onClick={close}>Back</button>}</section>;
  return <div className={close ? 'shade' : undefined}><section ref={panel} className="security-panel" role={close ? 'dialog' : undefined} aria-modal={close ? true : undefined} aria-label="Account access" onKeyDown={dialogKeys}><h2>{register ? 'Create citizen account' : 'Sign in securely'}</h2><p>Your reports and points belong to your account. Staff accounts are issued by an operator.</p>
    <form onSubmit={submit}>{register && <label>Name<input name="name" required maxLength={80} autoComplete="name"/></label>}
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="username"/></label>
      <label>Password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'}/></label>
      <small>At least 12 characters. Sign-in survives reloads in this tab; sign out when using a shared device.</small>
      {register && <><label className="consent"><input name="legal-consent" type="checkbox" required/><span>I agree to the <a href="?policy=terms" target="_blank" rel="noreferrer">Terms and Conditions</a> and acknowledge the <a href="?policy=privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label><p className="legal-notice">Create an account only if you are 18 or older. A supervised institutional pilot involving children requires an approved guardian-consent process.</p></>}
      <button type="submit" className="dark" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create citizen account' : 'Sign in to GreenPulse'}</button>
    </form>{message && <p role="status">{message}</p>}{role === 'Citizen' && <button type="button" onClick={() => { setRegister(!register); setMessage(''); }}>{register ? 'Use an existing account' : 'Create a citizen account'}</button>}
    <p className="privacy-note">Student pilot: use demonstration data only. Report information is shared with authorised operators. No real voucher redemption is available.</p>
    {close && <button type="button" onClick={close}>Cancel sign in</button>}
  </section></div>;
}

const FLOW = ['Pending', 'Assigned', 'In progress', 'Cleaning', 'Resolved', 'Verified', 'Citizen confirmed'];
function useReports() {
  const [rows, setRows] = useState([]), [message, setMessage] = useState('Loading…');
  async function load() {
    try { setRows(await api('/reports?limit=100')); setMessage('Showing up to 100 latest authorized reports.'); }
    catch (e) { setRows([]); setMessage(e.message); }
  }
  useEffect(() => { let active = true; api('/reports?limit=100').then(data => { if (active) { setRows(data); setMessage('Showing up to 100 latest authorized reports.'); } }).catch(e => { if (active) setMessage(e.message); }); return () => { active = false; }; }, []);
  return { rows, message, setMessage, load };
}

export function MyReports({ close }) {
  const { rows, message, setMessage, load } = useReports();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  async function confirm(id) {
    setBusy(true);
    try { await api(`/reports/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'Citizen confirmed' }) }); await load(); await refresh(); }
    catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  return <div className="shade"><section className="modal" role="dialog" aria-modal="true" aria-label="My reports"><h2>My reports</h2><p role="status">{message}</p><button onClick={load}>Refresh status</button>
    <div className="citizen-reports">{rows.map(r => <article key={r.id}><b>#{r.id} · {r.waste_type}</b><p>{r.status}</p><small>First-response pilot target: {{ Critical: 2, High: 4, Medium: 12, Low: 24 }[r.severity] || 12} hours from submission—not a municipal guarantee.</small><div className="progress-track" role="img" aria-label={`Current report status: ${r.status}`}>{FLOW.slice(0, 6).map((s, i) => <i key={s} className={i <= FLOW.indexOf(r.status) ? 'done' : ''} aria-hidden="true"/>)}</div>{r.verification_note && <p>{r.verification_note} · {r.reward_points} verified points</p>}{r.status === 'Verified' && <button disabled={busy} onClick={() => confirm(r.id)}>Confirm successful resolution</button>}</article>)}</div>
    <button className="dark" onClick={close}>Close</button></section></div>;
}

export function Operations({ home, Map, staffMode = false }) {
  const { rows, message, setMessage, load } = useReports();
  const { user } = useAuth();
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(null), [audit, setAudit] = useState([]);
  const [workers, setWorkers] = useState([]), [managedStaff, setManagedStaff] = useState([]), [busy, setBusy] = useState(false), [proof, setProof] = useState('');
  useEffect(() => { if (!staffMode) { api('/auth/staff').then(setWorkers).catch(e => setMessage(e.message)); if (user?.is_owner) api('/auth/staff/manage').then(setManagedStaff).catch(e => setMessage(e.message)); } }, [staffMode, setMessage, user?.is_owner]);
  async function inspect(id) {
    setBusy(true);
    try { const [report, history] = await Promise.all([api(`/reports/${id}`), api(`/reports/${id}/audit`)]); setSelected(report); setAudit(history); setProof(''); }
    catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  async function change(event) {
    event.preventDefault(); setBusy(true);
    const values = new FormData(event.currentTarget), body = { status: values.get('status') };
    if (body.status === 'Assigned') body.assigned_to = Number(values.get('assigned_to'));
    if (body.status === 'Resolved') { body.completion_note = values.get('note'); body.proof_image_url = proof; }
    if (body.status === 'Verified') { body.scale = values.get('scale'); body.verification_note = values.get('note'); }
    try { await api(`/reports/${selected.id}/status`, { method: 'PATCH', body: JSON.stringify(body) }); setSelected(null); await load(); }
    catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  async function createStaff(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    const form = event.currentTarget, values = new FormData(form);
    try {
      const result = await api('/auth/staff', { method: 'POST', body: JSON.stringify({
        name: values.get('name'), email: values.get('email'), password: values.get('password'), role: values.get('role')
      }) });
      form.reset(); setMessage(result.message); setWorkers(await api('/auth/staff'));
      if (user?.is_owner) setManagedStaff(await api('/auth/staff/manage'));
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  async function revokeStaff(account) {
    if (!window.confirm(`Revoke ${account.role === 'Driver' ? 'field-worker' : 'administrator'} access for ${account.name}? They will be signed out immediately.`)) return;
    setBusy(true); setMessage('');
    try {
      const result = await api(`/auth/staff/${account.id}`, { method: 'DELETE' });
      setMessage(result.message); setManagedStaff(await api('/auth/staff/manage')); setWorkers(await api('/auth/staff'));
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  const shown = rows.filter(r => `${r.id} ${r.waste_type} ${r.status}`.toLowerCase().includes(query.toLowerCase()));
  const next = selected && (staffMode ? { Assigned: 'In progress', 'In progress': 'Cleaning', Cleaning: 'Resolved' } : { Pending: 'Assigned', Resolved: 'Verified' })[selected.status];
  return <main className={staffMode ? 'staff' : 'admin'}><header><button onClick={home}>← Home</button><div><h1>{staffMode ? 'Municipal Field Workspace' : 'Admin Operations Centre'}</h1><p>Authenticated, server-recorded workflow</p></div><button onClick={load}>Refresh</button></header>
    <section className="analytics"><div><b>{rows.length}</b><span>Loaded reports</span></div><div><b>{rows.filter(r => r.status === 'Pending').length}</b><span>Pending</span></div><div><b>{rows.filter(r => ['Assigned', 'In progress', 'Cleaning'].includes(r.status)).length}</b><span>Active</span></div><div><b>{rows.filter(r => ['Verified', 'Citizen confirmed'].includes(r.status)).length}</b><span>Verified</span></div></section>
    {!staffMode && <>{user?.is_owner&&<section className="staff-admin"><div><h2>Owner account administration</h2><p>Only the GreenPulse owner can create or revoke administrator and field-worker accounts. Share temporary passwords privately.</p></div><form onSubmit={createStaff}><label>Full name<input name="name" required maxLength={80}/></label><label>Email<input name="email" type="email" required maxLength={254}/></label><label>Temporary password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><label>Role<select name="role" defaultValue="Driver"><option value="Driver">Field worker</option><option value="Admin">Administrator</option></select></label><button disabled={busy}>Create staff account</button></form><div className="staff-directory"><h3>Owner controls</h3><p>Revoke staff access without deleting audit history.</p>{managedStaff.map(account=><article key={account.id}><span><b>{account.name}</b><small>{account.email} · {account.role === 'Driver' ? 'Field worker' : account.role}</small></span>{account.is_owner?<strong>Owner</strong>:<button type="button" disabled={busy} onClick={()=>revokeStaff(account)}>Revoke access</button>}</article>)}</div></section>}<Map reports={shown}/></>}
    <section className="list"><h2>{staffMode ? 'Your assigned tasks' : 'Operations queue'}</h2><input aria-label="Search reports" placeholder="Search category, status or report" value={query} onChange={e => setQuery(e.target.value)}/><p role="status">{message}</p>{shown.map(r => <article className="report-row" key={r.id}><span><b>#{r.id} · {r.waste_type}</b><small>{r.severity} · {r.status}</small></span><button disabled={busy} onClick={() => inspect(r.id)}>Review report</button></article>)}</section>
    {selected && <div className="shade"><section className="modal" role="dialog" aria-modal="true" aria-label="Review report"><h2>Report #{selected.id}</h2><p>{selected.waste_type} · {selected.status}</p>{selected.image_url?.startsWith('data:image/') && <img className="evidence" src={selected.image_url} alt="Reported issue"/>}{selected.proof_image_url?.startsWith('data:image/') && <><h3>Completion evidence</h3><img className="evidence" src={selected.proof_image_url} alt="Cleaning completion"/></>}<p>{selected.completion_note}</p>
      {next && <form onSubmit={change}><input type="hidden" name="status" value={next}/>{next === 'Assigned' && <label>Assign field worker<select name="assigned_to" required defaultValue=""><option value="" disabled>Select a worker</option>{workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>{!workers.length && <p>Create a field-worker account using the trusted operator console first.</p>}</label>}{next === 'Verified' && <label>Actual waste scale<select name="scale" required><option value="small">Small · 10 points</option><option value="medium">Medium · 20 points</option><option value="large">Large · 30 points</option><option value="false">No waste found · 0 points</option></select></label>}{['Resolved', 'Verified'].includes(next) && <label>{next === 'Verified' ? 'Verification findings' : 'Cleaning and disposal notes'}<textarea name="note" required maxLength={1000}/></label>}{next === 'Resolved' && <label>Completion photo (under 2 MB)<input type="file" required accept="image/jpeg,image/png,image/webp" capture="environment" onChange={async e => { try { setProof(await readPhoto(e.target.files?.[0])); } catch (err) { setProof(''); setMessage(err.message); } }}/></label>}<button className="dark" disabled={busy || (next === 'Resolved' && !proof)}>Save: {next}</button></form>}
      <p role="status">{message}</p><h3>Server audit history</h3>{audit.map((a, i) => <p key={i}>{a.action} · {new Date(a.time).toLocaleString()}</p>)}<button disabled={busy} onClick={() => setSelected(null)}>Close</button>
    </section></div>}
  </main>;
}
