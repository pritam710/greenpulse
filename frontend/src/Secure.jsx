import { useCallback, useEffect, useRef, useState } from 'react';
import { api, hasToken, readPhoto, setToken } from './api';
import './security.css';
import { Auth, useAuth } from './auth-context';

const DIALOG_FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])';
function useDialogFocus(active) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    dialog.current?.querySelector(DIALOG_FOCUSABLE)?.focus();
    return () => { if (previous?.isConnected) previous.focus?.(); };
  }, [active]);
  function keys(event, close, busy = false) {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...(dialog.current?.querySelectorAll(DIALOG_FOCUSABLE) || [])];
    if (!items.length) { event.preventDefault(); dialog.current?.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return { dialog, keys };
}

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
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ ...body, name: fields.get('name'), consent_accepted: true, policy_version: '2026-09-19' }) });
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
const STATUS_EXPLANATIONS = {
  Pending: 'Received by the server and waiting for administrator review.',
  Assigned: 'An administrator assigned a field worker to inspect the site.',
  'In progress': 'The assigned worker is inspecting the reported issue.',
  Cleaning: 'The assigned worker is carrying out cleaning and disposal.',
  Resolved: 'The worker submitted completion proof; administrator verification is next.',
  Verified: 'An administrator checked the completion evidence. You can confirm the result.',
  'Citizen confirmed': 'The person who reported the issue confirmed successful resolution.',
};
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
  const [details, setDetails] = useState({}), [expanded, setExpanded] = useState(null);
  const { dialog, keys } = useDialogFocus(true);
  async function showDetails(id) {
    if (expanded === id) { setExpanded(null); return; }
    setBusy(true);
    try {
      const [report, history] = await Promise.all([api(`/reports/${id}`), api(`/reports/${id}/audit`)]);
      setDetails(current => ({ ...current, [id]: { report, history } })); setExpanded(id);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function confirm(id) {
    setBusy(true);
    try { await api(`/reports/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'Citizen confirmed' }) }); setExpanded(null); setDetails({}); await load(); await refresh(); }
    catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  return <div className="shade"><section ref={dialog} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby="my-reports-title" onKeyDown={event => keys(event, close, busy)}><h2 id="my-reports-title">My reports</h2><p role="status">{message}</p><button type="button" disabled={busy} onClick={load}>Refresh report status</button>
    <div className="citizen-reports">{!rows.length && <div className="empty"><h3>No reports to display</h3><p>If you have not submitted a report yet, close this window and choose “Report an issue”. If the server is unavailable, retry after reconnecting.</p></div>}{rows.map(r => <article key={r.id}><b>#{r.id} · {r.waste_type}</b><p><strong>{r.status}</strong> — {STATUS_EXPLANATIONS[r.status]}</p><small>First-response pilot target: {{ Critical: 2, High: 4, Medium: 12, Low: 24 }[r.severity] || 12} hours from submission—not a municipal guarantee.</small><div className="progress-track" role="img" aria-label={`Current report status: ${r.status}`}>{FLOW.map((s, i) => <i key={s} className={i <= FLOW.indexOf(r.status) ? 'done' : ''} aria-hidden="true"/>)}</div>{r.verification_note && <p>{r.verification_note} · {r.reward_points} verified points</p>}<button type="button" disabled={busy} aria-expanded={expanded === r.id} aria-controls={`report-detail-${r.id}`} onClick={() => showDetails(r.id)}>{expanded === r.id ? 'Hide report details' : `View details and evidence for report #${r.id}`}</button>
      {expanded === r.id && details[r.id] && <section className="citizen-detail" id={`report-detail-${r.id}`}><h3>Report progress</h3><ol className="report-flow">{FLOW.map((stage, index) => <li key={stage} className={index <= FLOW.indexOf(r.status) ? 'done' : ''} aria-current={stage === r.status ? 'step' : undefined}><span aria-hidden="true">{index < FLOW.indexOf(r.status) ? '✓' : index === FLOW.indexOf(r.status) ? '●' : '○'}</span>{stage}</li>)}</ol><p>Submitted: {formatTaskTime(r.created_at)}<br/>Priority: {r.severity}<br/>Field worker: {r.assigned_to ? 'Assigned to this report' : 'Not assigned yet'}</p>{details[r.id].report.completion_note && <p><b>Cleaning and disposal notes:</b> {details[r.id].report.completion_note}</p>}{details[r.id].report.proof_image_url?.startsWith('data:image/') ? <figure><img className="evidence" src={details[r.id].report.proof_image_url} alt={`Cleaning completion evidence for your report ${r.id}`}/><figcaption>Worker-submitted completion evidence. Check this against the actual site before confirming.</figcaption></figure> : <p>No completion evidence has been submitted yet.</p>}<h3>Server-recorded history</h3><ol className="citizen-history">{details[r.id].history.map((entry, index) => <li key={`${entry.time}-${index}`}>{entry.action} · <time>{formatTaskTime(entry.time)}</time></li>)}</ol></section>}
      {r.status === 'Verified' && <button type="button" disabled={busy} onClick={() => confirm(r.id)}>Confirm report #{r.id} was successfully resolved</button>}</article>)}</div>
    <button type="button" className="dark" disabled={busy} onClick={close}>Close my reports</button></section></div>;
}

const WORKER_STAGES = ['Assigned', 'In progress', 'Cleaning', 'Resolved', 'Verified'];
const WORKER_COMPLETE = new Set(['Verified', 'Citizen confirmed']);
const statusClass = status => status.toLowerCase().replaceAll(' ', '-');
const taskButtonLabel = status => ({
  Assigned: 'Open task',
  'In progress': 'Continue inspection',
  Cleaning: 'Finish and add proof',
  Resolved: 'View proof status',
  Verified: 'View completed task',
  'Citizen confirmed': 'View completed task',
}[status] || 'View task');
const formatTaskTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};
const formatCoordinates = report => `${Number(report.location_lat).toFixed(5)}, ${Number(report.location_lng).toFixed(5)}`;

export function FieldWorkerOperations({ home }) {
  const { rows, message, setMessage, load } = useReports();
  const { user } = useAuth();
  const [query, setQuery] = useState(''), [scope, setScope] = useState('active');
  const [selected, setSelected] = useState(null), [audit, setAudit] = useState([]);
  const [busy, setBusy] = useState(false), [proof, setProof] = useState('');
  const dialog = useRef(null), previousFocus = useRef(null);

  useEffect(() => {
    if (!selected) return;
    previousFocus.current = document.activeElement;
    dialog.current?.querySelector('button, [href], input, textarea')?.focus();
    return () => previousFocus.current?.focus?.();
  }, [selected]);

  function dialogKeys(event) {
    if (event.key === 'Escape' && !busy) { setSelected(null); return; }
    if (event.key !== 'Tab') return;
    const items = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function inspect(id) {
    setBusy(true); setMessage('Loading task details…');
    try {
      const [report, history] = await Promise.all([api(`/reports/${id}`), api(`/reports/${id}/audit`)]);
      setSelected(report); setAudit(history); setProof(''); setMessage('Task details loaded.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function advance(status, extra = {}) {
    if (!selected) return;
    const reportId = selected.id;
    setBusy(true); setMessage('Saving task update…');
    try {
      await api(`/reports/${reportId}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...extra }) });
      setSelected(null); setProof(''); await load();
      setMessage(`Task #${reportId} updated to ${status}.`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function complete(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await advance('Resolved', { completion_note: values.get('note'), proof_image_url: proof });
  }

  const counts = {
    assigned: rows.filter(row => row.status === 'Assigned').length,
    inspection: rows.filter(row => row.status === 'In progress').length,
    cleaning: rows.filter(row => row.status === 'Cleaning').length,
    review: rows.filter(row => row.status === 'Resolved').length,
  };
  const normalizedQuery = query.trim().toLowerCase();
  const visible = rows.filter(row => {
    const complete = WORKER_COMPLETE.has(row.status);
    if (scope === 'active' && complete) return false;
    if (scope === 'completed' && !complete) return false;
    return `${row.id} ${row.waste_type} ${row.severity} ${row.status} ${row.location_lat} ${row.location_lng}`.toLowerCase().includes(normalizedQuery);
  }).sort((a, b) => {
    const stage = status => WORKER_STAGES.indexOf(status) < 0 ? WORKER_STAGES.length : WORKER_STAGES.indexOf(status);
    const priority = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    return stage(a.status) - stage(b.status) || (priority[b.severity] || 0) - (priority[a.severity] || 0) || b.id - a.id;
  });
  const selectedStage = selected ? (selected.status === 'Citizen confirmed' ? WORKER_STAGES.length - 1 : WORKER_STAGES.indexOf(selected.status)) : -1;

  return <main className="staff" id="main-content">
    <a className="skip" href="#worker-task-queue">Skip to assigned tasks</a>
    <header className="worker-header">
      <button type="button" onClick={home}>← Home</button>
      <div><span className="worker-kicker">Field operations</span><h1>My assigned work</h1><p>{user?.name} · Only tasks assigned to this account</p></div>
      <button type="button" onClick={load} disabled={busy}>Refresh tasks</button>
    </header>
    <section className="staff-summary" aria-label="Assignment summary">
      <div><b>{counts.assigned}</b><span>New assignments</span></div>
      <div><b>{counts.inspection}</b><span>In inspection</span></div>
      <div><b>{counts.cleaning}</b><span>Being cleaned</span></div>
      <div><b>{counts.review}</b><span>Awaiting verification</span></div>
    </section>
    <section className="worker-toolbar" aria-labelledby="worker-queue-title">
      <div><h2 id="worker-queue-title">Assigned task queue</h2><p>Open a task, follow its stage, and upload completion proof from the site.</p></div>
      <label><span>Show</span><select value={scope} onChange={event => setScope(event.target.value)}><option value="active">Active work</option><option value="completed">Completed history</option><option value="all">All assigned tasks</option></select></label>
      <label><span>Find a task</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Task number, waste or status"/></label>
    </section>
    <p className="worker-message" role="status" aria-live="polite">{message}</p>
    <section className="task-list" id="worker-task-queue" tabIndex={-1} aria-label="Field-worker tasks">
      {!visible.length && <div className="empty"><span aria-hidden="true">✓</span><h2>{rows.length ? 'No tasks match this view' : 'No tasks assigned yet'}</h2><p>{rows.length ? 'Change the filter or search to see another task.' : `When an administrator assigns work to ${user?.name || 'you'}, it will appear here.`}</p></div>}
      {visible.map(report => <article className={`worker-task priority-${report.severity.toLowerCase()}`} key={report.id}>
        <div className="task-head"><span><small>Task #{report.id}</small><b>{report.waste_type}</b></span><span className={`status ${statusClass(report.status)}`}>{report.status}</span></div>
        <dl className="task-meta"><div><dt>Priority</dt><dd>{report.severity}</dd></div><div><dt>Submitted</dt><dd>{formatTaskTime(report.created_at)}</dd></div><div><dt>Location</dt><dd>{formatCoordinates(report)}</dd></div></dl>
        <div className="task-actions"><span>{WORKER_COMPLETE.has(report.status) ? 'Work complete' : report.status === 'Resolved' ? 'Proof sent to administrator' : 'Action available'}</span><button type="button" disabled={busy} onClick={() => inspect(report.id)}>{taskButtonLabel(report.status)}</button></div>
      </article>)}
    </section>
    {selected && <div className="shade" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setSelected(null); }}><section ref={dialog} className="modal worker-detail" role="dialog" aria-modal="true" aria-labelledby="worker-task-title" onKeyDown={dialogKeys}>
      <header><div><span className="worker-kicker">Assigned to {user?.name}</span><h2 id="worker-task-title">Task #{selected.id}</h2><p>{selected.waste_type}</p></div><button type="button" className="modal-close" onClick={() => setSelected(null)} disabled={busy} aria-label="Close task details">×</button></header>
      <div className="worker-detail-badges"><span className={`status ${statusClass(selected.status)}`}>{selected.status}</span><span className={`priority-label priority-${selected.severity.toLowerCase()}`}>{selected.severity} priority</span></div>
      <ol className="worker-flow" aria-label={`Task progress: ${selected.status}`}>{WORKER_STAGES.map((stage, index) => <li className={index <= selectedStage ? 'done' : ''} key={stage}><span aria-hidden="true">{index < selectedStage ? '✓' : index === selectedStage ? '●' : '○'}</span>{stage}</li>)}</ol>
      <section className="task-location"><h3>Where to go</h3><p>{formatCoordinates(selected)}</p><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${selected.location_lat},${selected.location_lng}`)}`} target="_blank" rel="noreferrer">Open directions in Google Maps ↗</a><small>Opening directions shares these coordinates with Google only after you choose the link.</small></section>
      <section><h3>Reported evidence</h3>{selected.image_url?.startsWith('data:image/') ? <img className="evidence" src={selected.image_url} alt={`Waste reported for task ${selected.id}`}/> : <p>No report photo was provided.</p>}</section>
      {selected.completion_note && <section className="completion-note"><h3>Completion note</h3><p>{selected.completion_note}</p></section>}
      {selected.proof_image_url?.startsWith('data:image/') && <section><h3>Completion evidence</h3><img className="evidence" src={selected.proof_image_url} alt={`Cleaning completion for task ${selected.id}`}/></section>}
      {selected.status === 'Assigned' && <button type="button" className="worker-primary" disabled={busy} onClick={() => advance('In progress')}>{busy ? 'Saving…' : 'Start inspection'}</button>}
      {selected.status === 'In progress' && <button type="button" className="worker-primary" disabled={busy} onClick={() => advance('Cleaning')}>{busy ? 'Saving…' : 'Inspection complete — start cleaning'}</button>}
      {selected.status === 'Cleaning' && <form className="completion-form" onSubmit={complete}><h3>Complete this task</h3><label>Cleaning and disposal notes<textarea name="note" required minLength={10} maxLength={1000} placeholder="What was collected, segregated and disposed of?"/></label><label className="proof-field">Completion photo (JPEG, PNG or WebP)<input type="file" required accept="image/jpeg,image/png,image/webp" capture="environment" onChange={async event => { try { const photo = await readPhoto(event.target.files?.[0]); setProof(photo); setMessage('Completion photo ready to submit.'); } catch (error) { setProof(''); setMessage(error.message); } }}/></label>{proof && <img className="evidence proof-preview" src={proof} alt="New completion proof preview"/>}<button type="submit" className="worker-primary" disabled={busy || !proof}>{busy ? 'Submitting proof…' : 'Submit completion proof'}</button></form>}
      {selected.status === 'Resolved' && <p className="worker-callout">Completion proof submitted. This task is waiting for administrator verification.</p>}
      {selected.status === 'Verified' && <p className="worker-callout success">An administrator verified this task. No further field action is required.</p>}
      {selected.status === 'Citizen confirmed' && <p className="worker-callout success">The citizen confirmed that the issue was resolved.</p>}
      <section className="worker-audit"><h3>Server-recorded task history</h3>{audit.length ? <ol>{audit.map((entry, index) => <li key={`${entry.time}-${index}`}><b>{entry.action}</b><time>{formatTaskTime(entry.time)}</time></li>)}</ol> : <p>No history is available.</p>}</section>
      <p role="status" aria-live="polite">{message}</p><button type="button" className="worker-secondary" disabled={busy} onClick={() => setSelected(null)}>Close task</button>
    </section></div>}
  </main>;
}

export function Operations({ home, Map, staffMode = false }) {
  const { rows, message, setMessage, load } = useReports();
  const { user } = useAuth();
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(null), [audit, setAudit] = useState([]);
  const [workers, setWorkers] = useState([]), [managedStaff, setManagedStaff] = useState([]), [busy, setBusy] = useState(false), [proof, setProof] = useState('');
  const { dialog, keys } = useDialogFocus(Boolean(selected));
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
    if (!window.confirm(`Revoke ${account.role === 'Driver' ? 'field-worker' : 'administrator'} access for ${account.name}? They will be signed out immediately. Active field tasks will return to Pending for reassignment; audit history will remain.`)) return;
    setBusy(true); setMessage('');
    try {
      const result = await api(`/auth/staff/${account.id}`, { method: 'DELETE' });
      setMessage(result.message); setManagedStaff(await api('/auth/staff/manage')); setWorkers(await api('/auth/staff'));
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  const shown = rows.filter(r => `${r.id} ${r.waste_type} ${r.status}`.toLowerCase().includes(query.toLowerCase()));
  const next = selected && (staffMode ? { Assigned: 'In progress', 'In progress': 'Cleaning', Cleaning: 'Resolved' } : { Pending: 'Assigned', Resolved: 'Verified' })[selected.status];
  return <main className={staffMode ? 'staff' : 'admin'} id="main-content"><a className="skip" href="#operations-queue">Skip to operations queue</a><header><button onClick={home}>← Home</button><div><h1>{staffMode ? 'Municipal Field Workspace' : 'Admin Operations Centre'}</h1><p>Authenticated, server-recorded workflow</p></div><button onClick={load}>Refresh reports</button></header>
    <section className="analytics"><div><b>{rows.length}</b><span>Loaded reports</span></div><div><b>{rows.filter(r => r.status === 'Pending').length}</b><span>Pending</span></div><div><b>{rows.filter(r => ['Assigned', 'In progress', 'Cleaning'].includes(r.status)).length}</b><span>Active</span></div><div><b>{rows.filter(r => ['Verified', 'Citizen confirmed'].includes(r.status)).length}</b><span>Verified</span></div></section>
    {!staffMode && <>{user?.is_owner&&<section className="staff-admin"><div><h2>Owner account administration</h2><p>Only the GreenPulse owner can create or revoke administrator and field-worker accounts. Share temporary passwords privately.</p></div><form onSubmit={createStaff}><label>Full name<input name="name" required maxLength={80}/></label><label>Email<input name="email" type="email" required maxLength={254}/></label><label>Temporary password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label><label>Role<select name="role" defaultValue="Driver"><option value="Driver">Field worker</option><option value="Admin">Administrator</option></select></label><button disabled={busy}>Create staff account</button></form><div className="staff-directory"><h3>Owner controls</h3><p>Revoke staff access without deleting audit history.</p>{managedStaff.map(account=><article key={account.id}><span><b>{account.name}</b><small>{account.email} · {account.role === 'Driver' ? 'Field worker' : account.role}</small></span>{account.is_owner?<strong>Owner</strong>:<button type="button" disabled={busy} onClick={()=>revokeStaff(account)}>Revoke access</button>}</article>)}</div></section>}<Map reports={shown}/></>}
    <section className="list" id="operations-queue" tabIndex={-1}><h2>{staffMode ? 'Your assigned tasks' : 'Operations queue'}</h2><label className="queue-search">Find a report<input type="search" placeholder="Search category, status or report number" value={query} onChange={e => setQuery(e.target.value)}/></label><p role="status">{message}</p>{!shown.length && <p>No reports match this queue. Try another search or refresh the reports.</p>}{shown.map(r => <article className="report-row" key={r.id}><span><b>#{r.id} · {r.waste_type}</b><small>{r.severity} · {r.status}</small></span><button disabled={busy} onClick={() => inspect(r.id)}>Review report #{r.id}</button></article>)}</section>
    {selected && <div className="shade"><section ref={dialog} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-labelledby="review-report-title" onKeyDown={event => keys(event, () => setSelected(null), busy)}><h2 id="review-report-title">Report #{selected.id}</h2><p>{selected.waste_type} · {selected.status}</p>{selected.image_url?.startsWith('data:image/') && <img className="evidence" src={selected.image_url} alt={`Reported waste or sanitation issue for report ${selected.id}`}/>}{selected.proof_image_url?.startsWith('data:image/') && <><h3>Completion evidence</h3><img className="evidence" src={selected.proof_image_url} alt={`Cleaning completion evidence for report ${selected.id}`}/></>}<p>{selected.completion_note}</p>
      {next && <form onSubmit={change}><input type="hidden" name="status" value={next}/>{next === 'Assigned' && <label>Assign field worker<select name="assigned_to" required defaultValue=""><option value="" disabled>Select a worker</option>{workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>{!workers.length && <p>Create a field-worker account using the trusted operator console first.</p>}</label>}{next === 'Verified' && <label>Actual waste scale<select name="scale" required><option value="small">Small · 10 points</option><option value="medium">Medium · 20 points</option><option value="large">Large · 30 points</option><option value="false">No waste found · 0 points</option></select></label>}{['Resolved', 'Verified'].includes(next) && <label>{next === 'Verified' ? 'Verification findings' : 'Cleaning and disposal notes'}<textarea name="note" required maxLength={1000}/></label>}{next === 'Resolved' && <label>Completion photo (under 2 MB)<input type="file" required accept="image/jpeg,image/png,image/webp" capture="environment" onChange={async e => { try { setProof(await readPhoto(e.target.files?.[0])); } catch (err) { setProof(''); setMessage(err.message); } }}/></label>}<button className="dark" disabled={busy || (next === 'Resolved' && !proof)}>Save: {next}</button></form>}
      <p role="status">{message}</p><h3>Server audit history</h3>{audit.map((a, i) => <p key={i}>{a.action} · {new Date(a.time).toLocaleString()}</p>)}<button type="button" disabled={busy} onClick={() => setSelected(null)}>Close report review</button>
    </section></div>}
  </main>;
}
