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
const getLocalReports = () => JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY) || '[]');
const saveLocalReport = report => localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify([report, ...getLocalReports()]));
const Icon = ({ children, color }) => <span className={`icon ${color}`}>{children}</span>;

function Modal({ title, close, children }) {
  return <div className="shade" onMouseDown={e => e.target === e.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>{children}</section>
  </div>;
}

function Landing({ citizen, admin }) {
  return <main className="landing">
    <section className="hero"><div className="logo">🍃</div><h1>Green Pulse</h1><h2>Smart Waste. Clean Campus.</h2><button onClick={citizen}>Launch Citizen App&nbsp; →</button></section>
    <section className="features"><p className="label">Platform features</p>
      <article><Icon color="blue">📷</Icon><div><b>Offline AI Classification</b><p>Identify common waste categories on your device.</p></div></article>
      <article><Icon color="red">📍</Icon><div><b>Geotagged Reporting</b><p>Capture your location and report issues instantly.</p></div></article>
      <article><Icon color="yellow">🎁</Icon><div><b>Civic Wallet Rewards</b><p>Earn Eco-Points for verified contributions.</p></div></article>
      <button className="link" onClick={admin}>▣ &nbsp; Open Admin GIS Panel</button>
    </section>
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

function Report({ close, success }) {
  const [text, setText] = useState(''); const [photo, setPhoto] = useState(''); const [loc, setLoc] = useState(null); const [msg, setMsg] = useState({type:'', text:''});
  useEffect(() => navigator.geolocation?.getCurrentPosition(p => setLoc({lat:p.coords.latitude,lng:p.coords.longitude}), () => setMsg({type:'warn',text:'Location unavailable; campus coordinates will be used.'}), {enableHighAccuracy:true,timeout:8000}), []);
  function choose(e) { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=()=>setPhoto(String(r.result)); r.readAsDataURL(f); }
  async function submit(e) {
    e.preventDefault(); setMsg({type:'wait',text:'Submitting report…'}); const p=loc||CAMPUS;
    try { const r=await fetch(`${API}/reports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({citizen_id:1,image_url:photo||'demo://no-photo',location_lat:p.lat,location_lng:p.lng,waste_type:text.trim(),severity:'Medium'})}); const data=await r.json().catch(()=>null); if(!r.ok)throw new Error(data?.detail||'Report failed'); setMsg({type:'ok',text:`Report #${data.id} submitted. +10 demo Eco-Points!`}); success(data.id); }
    catch(err){
      if (err instanceof TypeError) {
        const offline={id:`OFF-${Date.now().toString().slice(-6)}`,citizen_id:1,image_url:photo||'demo://no-photo',location_lat:p.lat,location_lng:p.lng,waste_type:text.trim(),severity:'Medium',status:'Offline draft',created_at:new Date().toISOString()};
        saveLocalReport(offline); setMsg({type:'ok',text:`Saved ${offline.id} on this device. It is available in the Admin demo while the shared API is offline.`}); success(offline.id);
      } else setMsg({type:'error',text:String(err.message)});
    }
  }
  return <Modal title="Report issue" close={close}><form onSubmit={submit} className="report"><h2>⚠ &nbsp; Report Issue</h2><textarea required value={text} onChange={e=>setText(e.target.value)} placeholder="Describe the issue (e.g., overflowing mixed waste)"/><label className="photo">📷 {photo?'Photo attached':'Add waste photo'}<input type="file" accept="image/*" capture="environment" onChange={choose}/></label><p>📍 {loc?`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`:'Getting location…'}</p>{msg.text&&<div className={`message ${msg.type}`}>{msg.text}</div>}<div className="buttons"><button type="button" onClick={close}>Cancel</button><button disabled={msg.type==='wait'||msg.type==='ok'}>Submit</button></div></form></Modal>;
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
    <section className="actions"><button className="blue" onClick={()=>setModal('scan')}><Icon color="blue">📷</Icon><b>Identify Waste</b></button><button className="red" onClick={()=>setModal('report')}><Icon color="red">⚠</Icon><b>Report Issue</b></button><button className="green" onClick={()=>setModal('bins')}><Icon color="green">📍</Icon><b>Nearby Bins</b></button><button className="yellow" onClick={()=>setModal('wallet')}><Icon color="yellow">🎁</Icon><b>Eco Points: {points}</b></button></section>
    <section className="impact"><p className="label">Your civic impact</p><div><span>♻️ &nbsp; Waste Sorted</span><b>12.5 kg</b></div><div><span>📣 &nbsp; Issues Reported</span><b>{last?1:0}</b></div><div><span>🏆 &nbsp; Campus Rank</span><b>#42</b></div>{last&&<small>Latest report: #{last}</small>}</section>
    {modal==='scan'&&<Scanner close={()=>setModal('')}/>} {modal==='report'&&<Report close={()=>setModal('')} success={id=>{setLast(id);setPoints(x=>x+10)}}/>} {modal==='wallet'&&<Wallet points={points} close={()=>setModal('')}/>} {modal==='bins'&&<NearbyBins close={()=>setModal('')}/>} 
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
  async function load(){setMessage('Loading reports…');const local=getLocalReports();try{const r=await fetch(`${API}/reports`);if(!r.ok)throw Error();const d=await r.json();setReports([...local,...d]);setMessage(local.length?`${local.length} device-local offline report(s) included.`:d.length?'':'No reports yet.')}catch{setReports(local);setMessage(local.length?'Shared API offline — showing reports saved on this device.':'Shared API offline — submit a report to create a device-local demo record.')}}
  useEffect(()=>{const local=getLocalReports();fetch(`${API}/reports`).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{setReports([...local,...d]);setMessage(local.length?`${local.length} device-local offline report(s) included.`:d.length?'':'No reports yet.')}).catch(()=>{setReports(local);setMessage(local.length?'Shared API offline — showing device-local reports.':'Shared API offline — no device-local reports yet.')})},[]); const pending=useMemo(()=>reports.filter(r=>r.status==='Pending'||r.status==='Offline draft').length,[reports]);
  return <main className="admin"><header><button onClick={home}>⌂</button><div><h1>Admin Control Panel</h1><p>Live GIS Mapping & Spatial Routing</p></div><div className="stat red"><b>{pending}</b><span>Active Reports</span></div><div className="stat green"><b>12</b><span>Fleet Active*</span></div></header><Map reports={reports}/><section className="list"><div><h2>Live reports</h2><button onClick={load}>Refresh</button></div>{message&&<p>{message}</p>}{reports.map(r=><article key={r.id}><b>#{r.id} · {r.waste_type}</b><span>{r.status} · {r.location_lat.toFixed(4)}, {r.location_lng.toFixed(4)}</span></article>)}<small>* Fleet count is demo data until its API is connected.</small></section></main>;
}

export default function App(){const[view,setView]=useState('home');const[online,setOnline]=useState(navigator.onLine);useEffect(()=>{const yes=()=>setOnline(true),no=()=>setOnline(false);window.addEventListener('online',yes);window.addEventListener('offline',no);return()=>{window.removeEventListener('online',yes);window.removeEventListener('offline',no)}},[]);return <><div className={`network ${online?'online':'offline'}`}>{online?'● Online':'● Offline demo mode'}</div>{view==='citizen'?<Citizen home={()=>setView('home')}/>:view==='admin'?<Admin home={()=>setView('home')}/>:<Landing citizen={()=>setView('citizen')} admin={()=>setView('admin')}/>}</>}
