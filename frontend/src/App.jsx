import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const CAMPUS = { lat: 17.6599, lng: 75.9064 };
const DEMO_BINS = [
  { id: 1, name: 'Main Gate Recycling Bin', type: 'Recyclable', lat: 17.6614, lng: 75.9049 },
  { id: 2, name: 'Canteen Wet-Waste Bin', type: 'Organic', lat: 17.6588, lng: 75.9081 },
  { id: 3, name: 'Library Segregation Point', type: 'Mixed', lat: 17.6577, lng: 75.9052 },
  { id: 4, name: 'Hostel Block Blue Bin', type: 'Recyclable', lat: 17.6622, lng: 75.9090 },
];
const LOCAL_REPORTS_KEY = 'greenpulse-offline-reports';
const WORKFLOW_KEY = 'greenpulse-workflow';
const AUDIT_KEY = 'greenpulse-audit-log';
const getLocalReports = () => JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY) || '[]');
const saveLocalReport = report => localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify([report, ...getLocalReports()]));
const getWorkflow = () => JSON.parse(localStorage.getItem(WORKFLOW_KEY) || '{}');
const applyWorkflow = reports => reports.map(report => ({ ...report, ...(getWorkflow()[report.id] || {}) }));
const getAudit = () => JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
const addAudit = (reportId, action, actor) => localStorage.setItem(AUDIT_KEY,JSON.stringify([{reportId,action,actor,time:new Date().toISOString()},...getAudit()].slice(0,50)));
const updateWorkflow = (id, changes, actor='System') => { const all=getWorkflow(); all[id]={...(all[id]||{}),...changes,updated_at:new Date().toISOString()}; localStorage.setItem(WORKFLOW_KEY,JSON.stringify(all)); addAudit(id,changes.status?`Status changed to ${changes.status}`:'Record updated',actor); };
const Icon = ({ children, color }) => <span className={`icon ${color}`}>{children}</span>;

function Modal({ title, close, children }) {
  return <div className="shade" onMouseDown={e => e.target === e.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>{children}</section>
  </div>;
}

function Landing({ citizen, admin, staff }) {
  return <main className="landing">
    <a className="skip" href="#main-content">Skip to content</a><section className="hero"><div className="hero-glow"/><div className="logo">🍃</div><p className="hero-kicker">SIH 26195 · Clean & Green Technology</p><h1>Green Pulse</h1><h2>From citizen report to verified resolution.</h2><p className="hero-copy">A rule-aligned, offline-ready waste and sanitation operations platform for campuses, wards and urban local bodies.</p><button onClick={citizen}>Launch Citizen App&nbsp; →</button><div className="trust-row"><span>✓ Four-stream guidance</span><span>✓ GIS operations</span><span>✓ Audit-ready workflow</span></div></section>
    <section id="main-content" className="features"><p className="label">Platform capabilities</p>
      <article><Icon color="blue">♻️</Icon><div><b>Four-Stream Segregation</b><p>Guidance for wet, dry, sanitary and special-care waste.</p></div></article>
      <article><Icon color="red">📍</Icon><div><b>Geotagged Reporting</b><p>Capture your location and report issues instantly.</p></div></article>
      <article><Icon color="yellow">🎁</Icon><div><b>Civic Wallet Rewards</b><p>Earn Eco-Points for verified contributions.</p></div></article>
      <button className="link" onClick={admin}>▣ &nbsp; Open Admin GIS Panel</button>
      <button className="link secondary" onClick={staff}>✓ &nbsp; Open Cleaning Staff Workspace</button>
    </section>
    <section className="journey"><p className="label">Closed-loop operations</p><h2>Every complaint has an owner, SLA and verifiable outcome</h2><div className="journey-grid">{[['1','Citizen reports','Photo, category, priority and GPS'],['2','Admin triages','Map, risk and duplicate review'],['3','Team accepts','Named owner and response SLA'],['4','Staff resolves','Completion evidence and notes'],['5','Admin verifies','Audit trail and analytics update']].map(step=><article key={step[0]}><span>{step[0]}</span><b>{step[1]}</b><p>{step[2]}</p></article>)}</div></section>
    <section className="gov-ready"><div><p className="label">Government pilot readiness</p><h2>Designed to scale from one campus to a ward command centre</h2><p>Open REST architecture, role-based workflow design, low-connectivity support and traceable resolution records create a credible path to ULB integration.</p></div><div className="readiness-grid"><article><b>4</b><span>Mandatory waste streams</span></article><article><b>5</b><span>Workflow states</span></article><article><b>3</b><span>Operational roles</span></article><article><b>24×7</b><span>Offline-ready access</span></article></div></section>
  </main>;
}

function Scanner({ close }) {
  const [preview, setPreview] = useState('');
  const [state, setState] = useState('');
  function choose(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setPreview(URL.createObjectURL(file)); setState('Scanning demo image…');
    setTimeout(() => setState('Plastic Bottle Detected!'), 1000);
  }
  return <Modal title="Identify waste" close={close}>
    <label className="scanner">{preview ? <img src={preview} alt="Waste"/> : <span>📷<b>Select or capture a waste photo</b></span>}<input type="file" accept="image/*" capture="environment" onChange={choose}/></label>
    {state && <div className={state.includes('Detected') ? 'result' : ''}><h2>{state.includes('Detected') && '✓ '}{state}</h2>{state.includes('Detected') && <><p>Category: <b>Recyclable</b>. Dispose in Blue Bin.</p><small>Demo result — production needs an on-device model.</small></>}</div>}
    <button className="dark" onClick={close}>Close Scanner</button>
  </Modal>;
}

const STREAMS = [
  { icon:'🥬',name:'Wet waste',color:'green',examples:'Food scraps, fruit peels, flowers',action:'Use the green bin. Compost or send for biomethanation.' },
  { icon:'📦',name:'Dry waste',color:'blue',examples:'Plastic, paper, metal, glass, rubber',action:'Keep clean and dry. Use the blue bin for sorting and recycling.' },
  { icon:'🩹',name:'Sanitary waste',color:'red',examples:'Diapers, sanitary pads, contaminated hygiene waste',action:'Wrap securely, mark it, and use the designated sanitary-waste bin.' },
  { icon:'🔋',name:'Special-care waste',color:'yellow',examples:'Batteries, bulbs, paint containers, chemicals',action:'Do not mix with regular waste. Hand over at an authorized collection point.' },
];
function Segregation({ close }) { const[selected,setSelected]=useState(null);return <Modal title="Four-stream segregation" close={close}><h2 className="left">♻️ Segregation Assistant</h2><p className="bin-notice">Aligned with India’s Solid Waste Management Rules, 2026.</p><div className="stream-grid">{STREAMS.map(stream=><button key={stream.name} className={stream.color} onClick={()=>setSelected(stream)}><span>{stream.icon}</span><b>{stream.name}</b><small>{stream.examples}</small></button>)}</div>{selected&&<div className="stream-advice"><h3>{selected.icon} {selected.name}</h3><p>{selected.action}</p></div>}<button className="dark" onClick={close}>Close Guide</button></Modal>; }

function Report({ close, success }) {
  const [text, setText] = useState(''); const [category,setCategory]=useState('Waste overflow'); const[priority,setPriority]=useState('Medium'); const [photo, setPhoto] = useState(''); const [loc, setLoc] = useState(null); const [msg, setMsg] = useState({type:'', text:''});
  useEffect(() => navigator.geolocation?.getCurrentPosition(p => setLoc({lat:p.coords.latitude,lng:p.coords.longitude}), () => setMsg({type:'warn',text:'Location unavailable; campus coordinates will be used.'}), {enableHighAccuracy:true,timeout:8000}), []);
  function choose(e) { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>setPhoto(String(r.result)); r.readAsDataURL(f); }
  async function submit(e) {
    e.preventDefault(); setMsg({type:'wait',text:'Submitting report…'}); const p=loc||CAMPUS;
    try { const r=await fetch(`${API}/reports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({citizen_id:1,image_url:photo||'demo://no-photo',location_lat:p.lat,location_lng:p.lng,waste_type:`${category}: ${text.trim()}`,severity:priority})}); const data=await r.json().catch(()=>null); if(!r.ok)throw new Error(data?.detail||'Report failed'); setMsg({type:'ok',text:`Report #${data.id} submitted. +10 demo Eco-Points!`}); success(data.id); }
    catch(err){
      if (err instanceof TypeError) {
        const offline={id:`OFF-${Date.now().toString().slice(-6)}`,citizen_id:1,image_url:photo||'demo://no-photo',location_lat:p.lat,location_lng:p.lng,waste_type:`${category}: ${text.trim()}`,severity:priority,status:'Pending',created_at:new Date().toISOString()};
        saveLocalReport(offline); setMsg({type:'ok',text:`Saved ${offline.id} on this device. It is available in the Admin demo while the shared API is offline.`}); success(offline.id);
      } else setMsg({type:'error',text:String(err.message)});
    }
  }
  return <Modal title="Report issue" close={close}><form onSubmit={submit} className="report"><h2>⚠ &nbsp; Report Waste or Sanitation Issue</h2><div className="form-row"><label>Issue type<select value={category} onChange={e=>setCategory(e.target.value)}><option>Waste overflow</option><option>Mixed or unsegregated waste</option><option>Dirty washroom</option><option>Drainage or waterlogging</option><option>Odour or pest problem</option><option>Unsafe sanitary waste</option><option>Illegal dumping</option></select></label><label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label></div><textarea required value={text} onChange={e=>setText(e.target.value)} placeholder="Describe what you observed and any safety risk"/><label className="photo">📷 {photo?'Photo attached':'Add evidence photo'}<input type="file" accept="image/*" capture="environment" onChange={choose}/></label><p>📍 {loc?`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`:'Getting location…'}</p>{msg.text&&<div className={`message ${msg.type}`}>{msg.text}</div>}<div className="buttons"><button type="button" onClick={close}>Cancel</button><button disabled={msg.type==='wait'||msg.type==='ok'}>Submit</button></div></form></Modal>;
}

function Wallet({ points, close }) { return <Modal title="Civic wallet" close={close}><div className="gift">🎁</div><h2>Civic Wallet</h2><p>You have <b className="greenText">{points} Eco-Points</b> from civic contributions.</p><p className="label left">Available vouchers</p><div className="voucher"><span>🎟️ &nbsp; <b>Partner reward – 20% off</b><small>Demo voucher</small></span><strong>100 pts</strong></div><button className="dark" onClick={close}>Close Wallet</button></Modal>; }

function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function NearbyBins({ close }) {
  const mapElement = useRef(null), map = useRef(null);
  const [position, setPosition] = useState(CAMPUS);
  const [notice, setNotice] = useState('Using campus center. Allow location access to sort from your position.');
  useEffect(() => { navigator.geolocation?.getCurrentPosition(({coords}) => { setPosition({lat:coords.latitude,lng:coords.longitude}); setNotice('Sorted from your current position.'); }, () => {}, {enableHighAccuracy:true,timeout:8000}); }, []);
  const sorted = useMemo(() => DEMO_BINS.map(bin => ({...bin,distance:distanceKm(position,bin)})).sort((a,b)=>a.distance-b.distance), [position]);
  useEffect(() => {
    if (!mapElement.current || map.current) return;
    map.current=L.map(mapElement.current).setView([position.lat,position.lng],15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map.current);
    DEMO_BINS.forEach(bin=>L.circleMarker([bin.lat,bin.lng],{radius:11,color:'#07883c',fillColor:'#22c55e',fillOpacity:.9}).addTo(map.current).bindPopup(`<b>${bin.name}</b><br>${bin.type}`));
    L.circleMarker([position.lat,position.lng],{radius:9,color:'#1d4ed8',fillColor:'#60a5fa',fillOpacity:1}).addTo(map.current).bindPopup('<b>Your position</b>');
    const observer=new ResizeObserver(()=>map.current?.invalidateSize()); observer.observe(mapElement.current); setTimeout(()=>map.current?.invalidateSize(),100);
    return()=>{observer.disconnect();map.current?.remove();map.current=null};
  }, [position]);
  return <Modal title="Nearby bins" close={close}><h2 className="left">📍 Nearby Bins</h2><div className="bin-map" ref={mapElement}/><p className="bin-notice">{notice}</p><div className="bin-list">{sorted.map(bin=><article key={bin.id}><span><b>{bin.name}</b><small>{bin.type} · Demo campus location</small></span><strong>{bin.distance<1?`${Math.round(bin.distance*1000)} m`:`${bin.distance.toFixed(1)} km`}</strong></article>)}</div><button className="dark" onClick={close}>Close Map</button></Modal>;
}

function Citizen({ home }) {
  const [modal,setModal]=useState(''); const [points,setPoints]=useState(150); const [last,setLast]=useState(null);
  return <main className="citizen"><header><div className="top"><button onClick={home}>←</button><h1>Green Pulse</h1><span>♧</span></div><div className="clean"><b>Campus cleanliness</b><strong>94%</strong></div></header>
    <section className="actions"><button className="blue" onClick={()=>setModal('guide')}><Icon color="blue">♻️</Icon><b>Segregation Guide</b></button><button className="red" onClick={()=>setModal('report')}><Icon color="red">⚠</Icon><b>Report Issue</b></button><button className="green" onClick={()=>setModal('bins')}><Icon color="green">📍</Icon><b>Nearby Bins</b></button><button className="yellow" onClick={()=>setModal('wallet')}><Icon color="yellow">🎁</Icon><b>Eco Points: {points}</b></button><button className="blue wide" onClick={()=>setModal('scan')}><Icon color="blue">📷</Icon><b>Image Classification Demo</b></button></section>
    <section className="impact"><p className="label">Your civic impact</p><div><span>♻️ &nbsp; Waste Sorted</span><b>12.5 kg</b></div><div><span>📣 &nbsp; Issues Reported</span><b>{last?1:0}</b></div><div><span>🏆 &nbsp; Campus Rank</span><b>#42</b></div>{last&&<small>Latest report: #{last}</small>}</section>
    {modal==='guide'&&<Segregation close={()=>setModal('')}/>} {modal==='scan'&&<Scanner close={()=>setModal('')}/>} {modal==='report'&&<Report close={()=>setModal('')} success={id=>{setLast(id);setPoints(x=>x+10)}}/>} {modal==='wallet'&&<Wallet points={points} close={()=>setModal('')}/>} {modal==='bins'&&<NearbyBins close={()=>setModal('')}/>} 
  </main>;
}

function Map({ reports }) {
  const el=useRef(null), map=useRef(null);
  useEffect(()=>{if(!el.current||map.current)return;map.current=L.map(el.current).setView([CAMPUS.lat,CAMPUS.lng],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map.current);const observer=new ResizeObserver(()=>map.current?.invalidateSize());observer.observe(el.current);const resize=()=>map.current?.invalidateSize();window.addEventListener('resize',resize);setTimeout(resize,100);return()=>{observer.disconnect();window.removeEventListener('resize',resize);map.current?.remove();map.current=null}},[]);
  useEffect(()=>{if(!map.current)return;map.current.eachLayer(x=>x instanceof L.CircleMarker&&x.remove());reports.forEach(r=>L.circleMarker([r.location_lat,r.location_lng],{radius:10,color:r.status==='Pending'?'#dc2626':'#16a34a',fillOpacity:.85}).addTo(map.current).bindPopup(`<b>Report #${r.id}</b><br>${r.waste_type}<br>${r.status}`));if(reports.length)map.current.fitBounds(reports.map(r=>[r.location_lat,r.location_lng]),{padding:[30,30],maxZoom:15})},[reports]);
  return <div className="map" ref={el}/>;
}

function Admin({ home }) {
  const [reports,setReports]=useState([]),[message,setMessage]=useState('Loading reports…');
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('All');
  const [openedAt]=useState(()=>Date.now());
  function merge(local,remote){return applyWorkflow([...local,...remote])}
  async function load(){setMessage('Loading reports…');const local=getLocalReports();try{const r=await fetch(`${API}/reports`);if(!r.ok)throw Error();const d=await r.json();setReports(merge(local,d));setMessage(local.length?`${local.length} device-local report(s) included.`:d.length?'':'No reports yet.')}catch{setReports(merge(local,[]));setMessage(local.length?'API unavailable — showing device-local workflow.':'No reports yet.')}}
  function transition(id,status){updateWorkflow(id,{status,assigned_to:status==='Assigned'?'Campus Cleaning Team':getWorkflow()[id]?.assigned_to},'Ward administrator');setReports(rows=>applyWorkflow(rows));}
  useEffect(()=>{const local=getLocalReports();fetch(`${API}/reports`).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{setReports(merge(local,d));setMessage('')}).catch(()=>{setReports(merge(local,[]));setMessage(local.length?'API unavailable — showing device-local workflow.':'No reports yet.')})},[]);
  const pending=reports.filter(r=>r.status==='Pending').length, active=reports.filter(r=>['Assigned','In progress'].includes(r.status)).length, resolved=reports.filter(r=>['Resolved','Verified'].includes(r.status)).length;
  const high=reports.filter(r=>['High','Critical'].includes(r.severity)).length;
  const shown=reports.filter(r=>(filter==='All'||r.status===filter)&&`${r.id} ${r.waste_type} ${r.severity}`.toLowerCase().includes(query.toLowerCase()));
  const sla=r=>{const hours={Critical:2,High:4,Medium:12,Low:24}[r.severity]||12;const due=new Date(new Date(r.created_at).getTime()+hours*36e5);return {hours,due,late:openedAt>due&& !['Resolved','Verified'].includes(r.status)}};
  const audit=getAudit().slice(0,5);
  return <main className="admin"><header><button onClick={home} aria-label="Home">⌂</button><div><h1>Admin Operations Centre</h1><p>GIS, assignment, verification and sanitation analytics</p></div><div className="stat red"><b>{pending}</b><span>Pending</span></div><div className="stat amber"><b>{active}</b><span>In progress</span></div><div className="stat green"><b>{resolved}</b><span>Resolved</span></div></header><section className="analytics"><div><b>{reports.length}</b><span>Total reports</span></div><div><b>{high}</b><span>High priority</span></div><div><b>{reports.length?Math.round(resolved/reports.length*100):0}%</b><span>Resolution rate</span></div><div><b>{new Set(reports.map(r=>r.waste_type.split(':')[0])).size}</b><span>Issue categories</span></div></section><Map reports={shown}/><section className="list"><div><h2>Operations queue</h2><button onClick={load}>Refresh</button></div><div className="queue-tools"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search report, category or priority" aria-label="Search operations queue"/><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter by status">{['All','Pending','Assigned','In progress','Resolved','Verified'].map(x=><option key={x}>{x}</option>)}</select></div>{message&&<p>{message}</p>}{shown.map(r=>{const s=sla(r);return <article className="report-row" key={r.id}><span><b>#{r.id} · {r.waste_type}</b><small>{r.severity} priority · {r.location_lat.toFixed(4)}, {r.location_lng.toFixed(4)}</small><small className={s.late?'sla late':'sla'}>{s.late?'⚠ SLA breached':`SLA ${s.hours}h`} · due {s.due.toLocaleString([], {dateStyle:'short',timeStyle:'short'})}</small></span><span className={`status ${String(r.status).toLowerCase().replace(' ','-')}`}>{r.status}</span><div className="row-actions">{r.status==='Pending'&&<button onClick={()=>transition(r.id,'Assigned')}>Assign</button>}{r.status==='Resolved'&&<button onClick={()=>transition(r.id,'Verified')}>Verify proof</button>}{r.status==='Verified'&&<b>✓ Closed</b>}</div></article>})}</section><section className="audit"><p className="label">Accountability log</p><h2>Recent workflow actions</h2>{!audit.length&&<p>Actions will appear here when reports are assigned, started, resolved or verified.</p>}{audit.map((a,i)=><article key={`${a.time}-${i}`}><span>#{a.reportId}</span><b>{a.action}</b><small>{a.actor} · {new Date(a.time).toLocaleString()}</small></article>)}</section></main>;
}

function Staff({ home }) {
  const [reports,setReports]=useState([]); const[message,setMessage]=useState('Loading assigned tasks…');
  async function load(){const local=getLocalReports();try{const r=await fetch(`${API}/reports`);const remote=r.ok?await r.json():[];setReports(applyWorkflow([...local,...remote]));setMessage('')}catch{setReports(applyWorkflow(local));setMessage('API unavailable — showing device-local assignments.')}}
  useEffect(()=>{const timer=setTimeout(load,0);return()=>clearTimeout(timer)},[]);
  function move(id,status){let proof='';if(status==='Resolved'){proof=window.prompt('Add a short completion note (for example: area cleaned, dry waste moved to blue bin).')||'';if(!proof.trim())return;}updateWorkflow(id,{status,assigned_to:'Campus Cleaning Team',completion_note:proof},'Cleaning staff');setReports(rows=>applyWorkflow(rows));}
  const tasks=reports.filter(r=>['Assigned','In progress','Resolved'].includes(r.status));
  return <main className="staff"><header><button onClick={home}>←</button><div><h1>Cleaning Staff Workspace</h1><p>Assigned sanitation and waste-resolution tasks</p></div><button onClick={load}>Refresh</button></header><section className="staff-summary"><div><b>{tasks.filter(t=>t.status==='Assigned').length}</b><span>New</span></div><div><b>{tasks.filter(t=>t.status==='In progress').length}</b><span>Active</span></div><div><b>{tasks.filter(t=>t.status==='Resolved').length}</b><span>Awaiting verification</span></div></section><section className="task-list">{message&&<p>{message}</p>}{!tasks.length&&<div className="empty"><span>✓</span><h2>No assigned tasks</h2><p>Assign a pending report from the Admin Operations Centre.</p></div>}{tasks.map(task=><article key={task.id}><div className="task-head"><span><b>Task #{task.id}</b><small>{task.waste_type}</small></span><span className={`status ${task.status.toLowerCase().replace(' ','-')}`}>{task.status}</span></div><p>📍 {task.location_lat.toFixed(5)}, {task.location_lng.toFixed(5)} · <b>{task.severity}</b> priority</p><div className="task-actions">{task.status==='Assigned'&&<button onClick={()=>move(task.id,'In progress')}>Start task</button>}{task.status==='In progress'&&<button onClick={()=>move(task.id,'Resolved')}>Upload proof & mark resolved</button>}{task.status==='Resolved'&&<span>Submitted to administrator for verification.</span>}</div></article>)}</section></main>;
}

export default function App(){const[view,setView]=useState('home');const[online,setOnline]=useState(navigator.onLine);useEffect(()=>{const yes=()=>setOnline(true),no=()=>setOnline(false);window.addEventListener('online',yes);window.addEventListener('offline',no);return()=>{window.removeEventListener('online',yes);window.removeEventListener('offline',no)}},[]);return <><div className={`network ${online?'online':'offline'}`}>{online?'● Online':'● Offline demo mode'}</div>{view==='citizen'?<Citizen home={()=>setView('home')}/>:view==='admin'?<Admin home={()=>setView('home')}/>:view==='staff'?<Staff home={()=>setView('home')}/>:<Landing citizen={()=>setView('citizen')} admin={()=>setView('admin')} staff={()=>setView('staff')}/>}</>}
