import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

import { api, readPhoto } from './api';
import { AuthProvider, Access, MyReports, Operations } from './Secure';
import { useAuth } from './auth-context';
import { LegalFooter, LegalPage } from './Legal';
const CAMPUS = { lat: 17.6599, lng: 75.9064 };
const PILOT_BOUNDS = { south: 16.9, north: 18.4, west: 74.9, east: 76.9 };
const inPilotArea = report => Number.isFinite(Number(report.location_lat)) && Number.isFinite(Number(report.location_lng)) &&
  Number(report.location_lat) >= PILOT_BOUNDS.south && Number(report.location_lat) <= PILOT_BOUNDS.north &&
  Number(report.location_lng) >= PILOT_BOUNDS.west && Number(report.location_lng) <= PILOT_BOUNDS.east;
const DEMO_BINS = [
  { id: 1, name: 'Main Gate Recycling Bin', type: 'Recyclable', lat: 17.6614, lng: 75.9049 },
  { id: 2, name: 'Canteen Wet-Waste Bin', type: 'Organic', lat: 17.6588, lng: 75.9081 },
  { id: 3, name: 'Library Segregation Point', type: 'Mixed', lat: 17.6577, lng: 75.9052 },
  { id: 4, name: 'Hostel Block Blue Bin', type: 'Recyclable', lat: 17.6622, lng: 75.9090 },
];
const Icon = ({ children, color }) => <span className={`icon ${color}`} aria-hidden="true">{children}</span>;

function Modal({ title, close, children }) {
  const dialog = useRef(null);
  const previousFocus = useRef(null);
  useEffect(() => {
    previousFocus.current = document.activeElement;
    const first = dialog.current?.querySelector('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])');
    first?.focus();
    return () => previousFocus.current?.focus?.();
  }, []);
  function keys(event) {
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="shade" onMouseDown={e => e.target === e.currentTarget && close()}>
    <section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={keys}>{children}</section>
  </div>;
}

function Landing({ citizen, admin, staff }) {
  return <main className="landing">
    <a className="skip" href="#main-content">Skip to content</a><section className="hero"><div className="hero-glow"/><div className="logo" aria-hidden="true">🍃</div><p className="hero-kicker">SIH 26195 · Clean & Green Technology</p><h1>Green Pulse</h1><h2>From citizen report to verified resolution.</h2><p className="hero-copy">A student-built waste and sanitation reporting pilot for campuses and wards.</p><button onClick={citizen}>Open citizen reporting</button><div className="trust-row"><span>Four-stream guidance</span><span>GIS report map</span><span>Server-recorded workflow</span></div></section>
    <section id="main-content" className="features"><p className="label">Platform capabilities</p>
      <article><Icon color="blue">♻️</Icon><div><b>Four-Stream Segregation</b><p>Guidance for wet, dry, sanitary and special-care waste.</p></div></article>
      <article><Icon color="red">📍</Icon><div><b>Geotagged Reporting</b><p>Capture your location and report issues instantly.</p></div></article>
      <article><Icon color="yellow">🎁</Icon><div><b>Civic Wallet Rewards</b><p>Earn Eco-Points for verified contributions.</p></div></article>
      <button className="link" onClick={admin}>▣ &nbsp; Open Admin GIS Panel</button>
      <button className="link secondary" onClick={staff}>✓ &nbsp; Open Cleaning Staff Workspace</button>
    </section>
    <section className="journey"><p className="label">Report workflow</p><h2>A visible path from submission to confirmation</h2><div className="journey-grid">{[['1','Citizen reports','Category, description, optional photo and location'],['2','Admin assigns','A registered field worker receives the task'],['3','Worker updates','Inspection and cleaning stages are recorded'],['4','Worker resolves','Completion photo and notes are required'],['5','Admin verifies','The citizen can then confirm the result']].map(step=><article key={step[0]}><span>{step[0]}</span><b>{step[1]}</b><p>{step[2]}</p></article>)}</div></section>
    <section className="gov-ready"><div><p className="label">Pilot scope</p><h2>Built for controlled campus or ward evaluation</h2><p>The current prototype demonstrates role-based reporting and verification. Government use would require authorised ownership, security and accessibility assessment, compliant hosting, verified operational data, and a measured pilot.</p></div><div className="readiness-grid"><article><b>4</b><span>Guidance streams</span></article><article><b>7</b><span>Report statuses</span></article><article><b>3</b><span>Operational roles</span></article><article><b>Pilot</b><span>Not an official service</span></article></div></section>
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
  useEffect(() => navigator.geolocation?.getCurrentPosition(p => setLoc({lat:p.coords.latitude,lng:p.coords.longitude}), () => setMsg({type:'warn',text:'Location unavailable. Enter the actual coordinates below; no location will be guessed.'}), {enableHighAccuracy:true,timeout:8000}), []);
  async function choose(e) { try { setPhoto(await readPhoto(e.target.files?.[0])); } catch(err) { setPhoto(''); setMsg({type:'error',text:err.message}); } }
  async function submit(e) {
    e.preventDefault();
    if (!Number.isFinite(loc?.lat) || !Number.isFinite(loc?.lng)) { setMsg({type:'error',text:'A location is required. Enable location permission or enter the coordinates.'}); return; }
    setMsg({type:'wait',text:'Submitting report…'});
    try {
      const data=await api('/reports',{method:'POST',body:JSON.stringify({image_url:photo,location_lat:loc.lat,location_lng:loc.lng,waste_type:`${category}: ${text.trim()}`,severity:priority,consent_accepted:true,policy_version:'2026-09-06'})});
      setMsg({type:'ok',text:`Report #${data.id} received by the server and queued for review.`}); success(data.id);
    } catch(err) { setMsg({type:'error',text:err.message}); }
  }
  return <Modal title="Report issue" close={close}><form onSubmit={submit} className="report"><h2>Report a waste or sanitation issue</h2><div className="form-row"><label>Issue type<select value={category} onChange={e=>setCategory(e.target.value)}><option>Waste overflow</option><option>Mixed or unsegregated waste</option><option>Dirty washroom</option><option>Drainage or waterlogging</option><option>Odour or pest problem</option><option>Unsafe sanitary waste</option><option>Illegal dumping</option></select></label><label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label></div><label>What did you observe?<textarea required maxLength={900} value={text} onChange={e=>setText(e.target.value)} placeholder="Describe the issue and any safety risk"/></label><label className="photo">{photo?'Evidence photo attached':'Add an optional evidence photo'}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose}/></label><p>Report location: {Number.isFinite(loc?.lat)&&Number.isFinite(loc?.lng)?`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`:'not set'}</p><div className="form-row"><label>Latitude<input type="number" inputMode="decimal" step="any" min="-90" max="90" required value={loc?.lat ?? ''} onChange={e=>setLoc(p=>({...p,lat:e.target.value===''?undefined:Number(e.target.value)}))}/></label><label>Longitude<input type="number" inputMode="decimal" step="any" min="-180" max="180" required value={loc?.lng ?? ''} onChange={e=>setLoc(p=>({...p,lng:e.target.value===''?undefined:Number(e.target.value)}))}/></label></div><p className="privacy-note">Your report and coordinates are shared with authorised operators. Avoid faces, number plates, identity documents, and unrelated people.</p><label className="consent"><input type="checkbox" required/><span>I consent to GreenPulse processing this report, location, and optional photo for the pilot workflow. I have permission to submit the content.</span></label><p className="legal-notice">Read the <a href="?policy=privacy" target="_blank">Privacy Policy</a> and <a href="?policy=terms" target="_blank">Terms and Conditions</a>.</p>{msg.text&&<div className={`message ${msg.type}`} role="status">{msg.text}</div>}<div className="buttons"><button type="button" onClick={close}>Cancel report</button><button disabled={msg.type==='wait'||msg.type==='ok'}>Submit report</button></div></form></Modal>;
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
  const [modal,setModal]=useState(''); const [last,setLast]=useState(null);
  const {user,refresh}=useAuth(); const points=user?.green_credits ?? 0;
  useEffect(()=>{ if(!modal) refresh(); },[modal,refresh]);
  return <main className="citizen"><header><div className="top"><button onClick={home} aria-label="About GreenPulse">ⓘ</button><h1>Green Pulse</h1><button className="track-top" onClick={()=>setModal('reports')}>My Reports</button></div><div className="quick-report"><div><p>See waste? Report it now.</p><h2>Photo + GPS + 30 seconds</h2></div><button onClick={()=>setModal('report')}>📷 Report an issue</button></div></header>
    <section className="actions"><button className="red primary-action" onClick={()=>setModal('report')}><Icon color="red">📷</Icon><b>Capture & Report</b><small>Open camera, add GPS and submit</small></button><button className="green" onClick={()=>setModal('reports')}><Icon color="green">📋</Icon><b>Track My Reports</b><small>See queue, inspection and cleaning status</small></button><button className="blue" onClick={()=>setModal('guide')}><Icon color="blue">♻️</Icon><b>Segregation Guide</b></button><button className="green" onClick={()=>setModal('bins')}><Icon color="green">📍</Icon><b>Nearby Bins</b></button><button className="yellow" onClick={()=>setModal('wallet')}><Icon color="yellow">🎁</Icon><b>Eco Points: {points}</b></button><button className="blue" onClick={()=>setModal('scan')}><Icon color="blue">📷</Icon><b>Classification Demo</b></button></section>
    <section className="impact"><p className="label">Your civic impact</p><div><span>♻️ &nbsp; Waste Sorted</span><b>Not measured</b></div><div><span>📣 &nbsp; Issues Reported</span><b>{last?'View My Reports':'—'}</b></div><div><span>🏆 &nbsp; Campus Rank</span><b>Not ranked</b></div>{last&&<small>Latest report: #{last}</small>}</section>
    {modal==='guide'&&<Segregation close={()=>setModal('')}/>} {modal==='scan'&&<Scanner close={()=>setModal('')}/>} {modal==='report'&&<Access role="Citizen" close={()=>setModal('')}><Report close={()=>setModal('')} success={id=>setLast(id)}/></Access>} {modal==='wallet'&&<Access role="Citizen" close={()=>setModal('')}><Wallet points={points} close={()=>setModal('')}/></Access>} {modal==='bins'&&<NearbyBins close={()=>setModal('')}/>} {modal==='reports'&&<Access role="Citizen" close={()=>setModal('')}><MyReports close={()=>setModal('')}/></Access>}
  </main>;
}

function Map({ reports }) {
  const el=useRef(null), map=useRef(null);
  useEffect(()=>{if(!el.current||map.current)return;map.current=L.map(el.current).setView([CAMPUS.lat,CAMPUS.lng],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map.current);const observer=new ResizeObserver(()=>map.current?.invalidateSize());observer.observe(el.current);const resize=()=>map.current?.invalidateSize();window.addEventListener('resize',resize);setTimeout(resize,100);return()=>{observer.disconnect();window.removeEventListener('resize',resize);map.current?.remove();map.current=null}},[]);
  const outliers=reports.filter(report=>!inPilotArea(report)).length;
  useEffect(()=>{if(!map.current)return;const localReports=reports.filter(inPilotArea);map.current.eachLayer(x=>x instanceof L.CircleMarker&&x.remove());localReports.forEach(r=>L.circleMarker([r.location_lat,r.location_lng],{radius:10,color:r.status==='Pending'?'#dc2626':'#16a34a',fillOpacity:.85}).addTo(map.current).bindPopup(Object.assign(document.createElement('span'),{textContent:`Report #${r.id} · ${r.waste_type} · ${r.status}`})));if(localReports.length>1)map.current.fitBounds(localReports.map(r=>[r.location_lat,r.location_lng]),{padding:[30,30],maxZoom:15});else if(localReports.length===1)map.current.setView([localReports[0].location_lat,localReports[0].location_lng],15);else map.current.setView([CAMPUS.lat,CAMPUS.lng],13)},[reports]);
  return <section className="operations-map" aria-label="Solapur pilot operations map"><div className="map" ref={el}/>{outliers>0&&<p role="status">⚠ {outliers} report{outliers===1?' has':'s have'} coordinates outside the Solapur pilot area and {outliers===1?'is':'are'} excluded from map zoom. Review the coordinates before assignment.</p>}</section>;
}

function Admin({home}) { return <Access role="Admin" close={home}><Operations home={home} Map={Map}/></Access>; }
function Staff({home}) { return <Access role="Driver" close={home}><Operations home={home} staffMode Map={Map}/></Access>; }

function AppContent(){const initialPolicy=new URLSearchParams(window.location.search).get('policy');const[view,setView]=useState(initialPolicy?'legal':'citizen');const[policy,setPolicy]=useState(initialPolicy||'privacy');const[online,setOnline]=useState(navigator.onLine);useEffect(()=>{const yes=()=>setOnline(true),no=()=>setOnline(false);window.addEventListener('online',yes);window.addEventListener('offline',no);return()=>{window.removeEventListener('online',yes);window.removeEventListener('offline',no)}},[]);function openPolicy(id){setPolicy(id);setView('legal');window.history.replaceState({},'',`?policy=${id}`);window.scrollTo(0,0)}function home(){window.history.replaceState({},'',window.location.pathname);setView('citizen');window.scrollTo(0,0)}if(view==='legal')return <LegalPage page={policy} onBack={home}/>;return <><div className={`network ${online?'online':'offline'}`}>{online?'Online':'Offline — reporting and status updates unavailable'}</div>{view==='citizen'?<Citizen home={()=>setView('home')}/>:view==='admin'?<Admin home={()=>setView('home')}/>:view==='staff'?<Staff home={()=>setView('home')}/>:<Landing citizen={()=>setView('citizen')} admin={()=>setView('admin')} staff={()=>setView('staff')}/>}<LegalFooter onOpen={openPolicy}/></>}

export default function App(){return <AuthProvider><AppContent/></AuthProvider>;}
