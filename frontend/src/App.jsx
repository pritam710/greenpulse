import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import './App.css';

import { api, readPhoto } from './api';
import { AuthProvider, Access, FieldWorkerOperations, MyReports, Operations } from './Secure';
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

function Landing({ citizen, signIn }) {
  const { user } = useAuth();
  return <main className="landing">
    <a className="skip" href="#main-content">Skip to content</a><section className="hero"><div className="hero-glow"/><div className="logo" aria-hidden="true">🍃</div><p className="hero-kicker">SIH 26195 · Clean & Green Technology</p><h1>Green Pulse</h1><h2>From segregation guidance to verified resolution.</h2><p className="hero-copy">A student-built waste identification, segregation and reporting pilot for campuses and wards.</p><div className="hero-actions"><button onClick={citizen}>Open citizen reporting</button><button className="hero-signin" onClick={user ? citizen : signIn}>{user ? 'Return to citizen dashboard' : 'Sign in to your account'}</button></div><div className="trust-row"><span>AI-assisted segregation</span><span>GIS report map</span><span>Server-recorded workflow</span></div></section>
    <section id="main-content" className="features"><p className="label">Platform capabilities</p>
      <article><Icon color="green">🤖</Icon><div><b>AI Segregation Assistant</b><p>Identifies an item from up to three photos and asks for better evidence instead of guessing.</p></div></article>
      <article><Icon color="blue">♻️</Icon><div><b>Four-Stream Segregation</b><p>Guidance for wet, dry, sanitary and special-care waste.</p></div></article>
      <article><Icon color="red">📍</Icon><div><b>Geotagged Reporting</b><p>Capture your location and report issues instantly.</p></div></article>
      <article><Icon color="yellow">🎁</Icon><div><b>Civic Wallet Rewards</b><p>Earn Eco-Points for verified contributions.</p></div></article>
    </section>
    <section className="journey"><p className="label">Report workflow</p><h2>A visible path from submission to confirmation</h2><div className="journey-grid">{[['1','Citizen reports','Category, description, optional photo and location'],['2','Admin assigns','A registered field worker receives the task'],['3','Worker updates','Inspection and cleaning stages are recorded'],['4','Worker resolves','Completion photo and notes are required'],['5','Admin verifies','The citizen can then confirm the result']].map(step=><article key={step[0]}><span>{step[0]}</span><b>{step[1]}</b><p>{step[2]}</p></article>)}</div></section>
    <section className="gov-ready"><div><p className="label">Pilot scope</p><h2>Built for controlled campus or ward evaluation</h2><p>The current prototype demonstrates role-based reporting and verification. Government use would require authorised ownership, security and accessibility assessment, compliant hosting, verified operational data, and a measured pilot.</p></div><div className="readiness-grid"><article><b>4</b><span>Guidance streams</span></article><article><b>7</b><span>Report statuses</span></article><article><b>Secure</b><span>Account-based access</span></article><article><b>Pilot</b><span>Not an official service</span></article></div></section>
  </main>;
}

const MAX_CLASSIFICATION_PHOTOS = 3;
const MAX_CLASSIFICATION_FILE_BYTES = 12 * 1024 * 1024;
const TARGET_CLASSIFICATION_BYTES = 600 * 1024;
const CLASSIFICATION_STREAMS = ['Wet', 'Dry', 'Sanitary', 'Special care', 'Construction & demolition', 'Horticulture', 'Needs expert handling'];

function normaliseClassification(data) {
  const uncertain = data.certainty === 'uncertain' || data.status === 'needs_more_evidence' || data.needs_more_information === true;
  return {
    uncertain,
    decision: data.decision,
    item: data.item || 'Waste item',
    material: data.material || 'Unknown',
    stream: data.stream || 'Needs expert handling',
    binColor: data.bin?.color || '',
    binLabel: data.bin?.label || '',
    guidance: data.guidance || '',
    reason: data.reason || '',
    prompt: data.follow_up_question || 'Add a clear photo from another angle or describe the material and any labels.',
    recyclable: data.recyclable,
    hazardous: data.hazardous,
    alternatives: Array.isArray(data.alternatives) ? data.alternatives.slice(0, 3) : [],
    reviewNotice: data.user_review?.notice || 'AI suggestion, not final municipal verification. Confirm or correct the stream.',
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not prepare this photo.'));
    reader.readAsDataURL(blob);
  });
}

async function readClassificationPhoto(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_CLASSIFICATION_FILE_BYTES)
    throw new Error('Choose a JPEG, PNG or WebP photo under 12 MB. It will be resized before analysis.');
  let source;
  try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    source = await new Promise((resolve, reject) => {
      const image = new Image(), url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be opened.')); };
      image.src = url;
    });
  }
  const originalWidth = source.width || source.naturalWidth, originalHeight = source.height || source.naturalHeight;
  let scale = Math.min(1, 1280 / Math.max(originalWidth, originalHeight));
  let blob = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(originalWidth * scale)); canvas.height = Math.max(1, Math.round(originalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0, canvas.width, canvas.height);
    blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', Math.max(.5, .82 - attempt * .08)));
    if (!blob) throw new Error('This browser could not prepare the photo.');
    if (blob.size <= TARGET_CLASSIFICATION_BYTES) break;
    scale *= .82;
  }
  source.close?.();
  if (!blob || blob.size > TARGET_CLASSIFICATION_BYTES) throw new Error('This photo is still too detailed after resizing. Try a closer crop.');
  return blobToDataUrl(blob);
}

function Scanner({ close }) {
  const [photos, setPhotos] = useState([]);
  const [description, setDescription] = useState('');
  const [serviceState, setServiceState] = useState('checking');
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [selectedStream, setSelectedStream] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const photoInput = useRef(null);

  useEffect(() => {
    let active = true;
    api('/classification/status').then(data => {
      if (active) setServiceState(data.available ? 'available' : 'unavailable');
    }).catch(() => { if (active) setServiceState('unavailable'); });
    return () => { active = false; };
  }, []);

  async function choose(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    const available = MAX_CLASSIFICATION_PHOTOS - photos.length;
    if (!available) { setPhase('error'); setMessage(`You can add up to ${MAX_CLASSIFICATION_PHOTOS} photos.`); return; }
    try {
      const selected = files.slice(0, available);
      const encoded = await Promise.all(selected.map(readClassificationPhoto));
      setPhotos(current => [...current, ...encoded.map((image, index) => ({ image, name: selected[index].name }))]);
      setResult(null); setSelectedStream(''); setConfirmed(false); setPhase('idle');
      setMessage(files.length > available ? `Added ${available} photo${available === 1 ? '' : 's'}. The limit is ${MAX_CLASSIFICATION_PHOTOS}.` : '');
    } catch (error) { setPhase('error'); setMessage(error.message); }
  }

  function removePhoto(index) {
    setPhotos(current => current.filter((_, photoIndex) => photoIndex !== index));
    setResult(null); setSelectedStream(''); setConfirmed(false); setPhase('idle'); setMessage('');
  }

  async function classify(event) {
    event.preventDefault();
    if (serviceState !== 'available') { setPhase('error'); setMessage('AI classification is not available yet. Use the manual Segregation Guide and try again later.'); return; }
    if (!photos.length) { setPhase('error'); setMessage('Add at least one clear waste photo before classifying.'); return; }
    setPhase('loading'); setMessage('Analysing the item and finding the correct waste stream…'); setResult(null);
    try {
      const data = await api('/classification', { method: 'POST', body: JSON.stringify({ images: photos.map(photo => photo.image), description: description.trim(), consent_accepted: true, policy_version: '2026-09-12' }) });
      const next = normaliseClassification(data);
      setResult(next); setSelectedStream(next.stream); setConfirmed(false); setPhase(next.uncertain ? 'uncertain' : 'success');
      setMessage(next.uncertain ? next.prompt : 'AI suggestion ready. Confirm or correct the stream before following it.');
    } catch (error) { setPhase('error'); setMessage(error.message); }
  }

  return <Modal title="AI segregation assistant" close={close}>
    <form className="classifier" onSubmit={classify}>
      <div className="classifier-heading"><span aria-hidden="true">♻️</span><div><h2>AI Segregation Assistant</h2><p>Photograph one waste item. GreenPulse will identify it and suggest the correct waste stream.</p></div></div>
      {serviceState !== 'available' && <div className={`classifier-message ${serviceState === 'checking' ? 'loading' : 'error'}`} role="status" aria-live="polite">{serviceState === 'checking' ? 'Checking the AI classification service…' : 'AI classification is currently unavailable. No photo will be sent. You can still use the manual Segregation Guide.'}</div>}
      <button type="button" className="scanner" onClick={() => photoInput.current?.click()} disabled={serviceState !== 'available' || photos.length >= MAX_CLASSIFICATION_PHOTOS || phase === 'loading'} aria-describedby="classifier-photo-help">
        <span>📷<b>{photos.length ? 'Add another angle' : 'Capture or select a waste photo'}</b><small>Clear, well-lit photos improve accuracy · up to {MAX_CLASSIFICATION_PHOTOS}</small></span>
      </button>
      <input ref={photoInput} className="classifier-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={choose} aria-label="Add waste photos" disabled={serviceState !== 'available' || photos.length >= MAX_CLASSIFICATION_PHOTOS || phase === 'loading'}/><p id="classifier-photo-help" className="classifier-photo-help">Photograph only one item or one mixed pile. Add another angle when material or labels are hard to see.</p>
      {photos.length > 0 && <div className="classifier-photos" aria-label="Selected waste photos">{photos.map((photo, index) => <figure key={`${photo.name}-${index}`}><img src={photo.image} alt={`Waste evidence ${index + 1}`}/><button type="button" onClick={() => removePhoto(index)} aria-label={`Remove waste photo ${index + 1}`} disabled={phase === 'loading'}>×</button><figcaption>Photo {index + 1}</figcaption></figure>)}</div>}
      <label className="classifier-description">Optional description<textarea value={description} onChange={event => { setDescription(event.target.value); setResult(null); setSelectedStream(''); setConfirmed(false); setPhase('idle'); setMessage(''); }} maxLength={500} placeholder="Example: clear drink bottle with a recycling label" disabled={phase === 'loading'}/><small>{description.length}/500 · Add the material, label or where the item came from if it is unclear.</small></label>
      <label className="classifier-consent"><input type="checkbox" required disabled={phase === 'loading'}/><span>I consent to sending these selected photos and optional description through the GreenPulse backend to Google Gemini for one-time waste analysis. The classification service does not save the photos or result.</span></label>
      <p className="classifier-privacy">Do not include faces, number plates, identity documents, addresses or unrelated people. Read the <a href="?policy=privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
      {message && <div className={`classifier-message ${phase}`} role="status" aria-live="polite">{phase === 'loading' && <span className="classifier-spinner" aria-hidden="true"/>}<span>{message}</span></div>}
      {result && <section className={`classification-result ${result.uncertain ? 'uncertain' : 'confident'}`} aria-label="Waste classification result" aria-live="polite">
        <div className="classification-result-title"><span aria-hidden="true">{result.uncertain ? '🔎' : '✅'}</span><div><small>{result.uncertain ? 'Uncertain — more evidence needed' : 'Clear AI suggestion'}</small><h3>{result.item}</h3></div><strong>{result.uncertain ? 'Review' : 'Clear'}</strong></div>
        <p className="classification-review-notice">{result.reviewNotice}</p>
        <dl><div><dt>Material</dt><dd>{result.material}</dd></div><div><dt>Suggested stream</dt><dd>{result.stream}</dd></div><div><dt>Confidence</dt><dd>{result.uncertain ? 'Uncertain — add evidence' : 'Clear suggestion'}</dd></div>{(result.binColor || result.binLabel) && <div><dt>Suggested bin</dt><dd>{[result.binColor, result.binLabel].filter(Boolean).join(' · ')}</dd></div>}</dl>
        {!result.uncertain && <div className="classification-flags">{typeof result.recyclable === 'boolean' && <span>{result.recyclable ? '♻️ Recyclable' : 'Not normally recyclable'}</span>}{result.hazardous === true && <span className="hazardous">⚠️ Handle with care</span>}</div>}
        {result.guidance && <p className="classification-guidance"><b>What to do:</b> {result.guidance}</p>}
        {result.uncertain && <p className="classification-caution"><b>Why we paused:</b> {result.reason || 'The available evidence is not clear enough for a reliable segregation decision.'}</p>}
        {result.uncertain && result.alternatives.length > 0 && <p className="classification-alternatives"><b>Possible matches:</b> {result.alternatives.join(', ')}</p>}
        {!result.uncertain && <div className="classification-review"><label>Confirm or correct the stream<select value={selectedStream} onChange={event => { setSelectedStream(event.target.value); setConfirmed(false); }}>{[...new Set([result.stream, ...CLASSIFICATION_STREAMS])].map(stream => <option key={stream}>{stream}</option>)}</select></label><button type="button" onClick={() => setConfirmed(true)}>Confirm segregation choice</button>{confirmed && <p role="status">✓ Confirmed as {selectedStream}. Check the suggested bin against local collection rules.</p>}</div>}
      </section>}
      <p className="classifier-safety">AI-assisted guidance can be wrong. Confirm the item and follow local collection rules. Never handle sharp, medical, chemical or unknown waste without trained assistance.</p>
      <div className="classifier-actions"><button type="button" onClick={close}>Close assistant</button><button type="submit" disabled={serviceState !== 'available' || !photos.length || phase === 'loading'}>{phase === 'loading' ? 'Classifying…' : result?.uncertain ? 'Analyse new evidence' : 'Identify waste'}</button></div>
    </form>
  </Modal>;
}

const STREAMS = [
  { icon:'🥬',name:'Wet waste',color:'green',examples:'Food scraps, fruit peels, flowers',action:'Use the green bin. Compost or send for biomethanation.' },
  { icon:'📦',name:'Dry waste',color:'blue',examples:'Plastic, paper, metal, glass, rubber',action:'Keep clean and dry. Use the blue bin for sorting and recycling.' },
  { icon:'🩹',name:'Sanitary waste',color:'red',examples:'Diapers, sanitary pads, contaminated hygiene waste',action:'Wrap securely, mark it, and use the designated sanitary-waste bin.' },
  { icon:'🔋',name:'Special-care waste',color:'special',examples:'Batteries, bulbs, paint containers, chemicals',action:'No national bin colour is assigned. Do not mix it with regular waste; use an authorised collection point.' },
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
    if (!mapElement.current) return;
    let disposed = false, observer;
    import('leaflet').then(({ default: L }) => {
      if (disposed || !mapElement.current) return;
      map.current=L.map(mapElement.current).setView([position.lat,position.lng],15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map.current);
      DEMO_BINS.forEach(bin=>L.circleMarker([bin.lat,bin.lng],{radius:11,color:'#07883c',fillColor:'#22c55e',fillOpacity:.9}).addTo(map.current).bindPopup(`<b>${bin.name}</b><br>${bin.type}`));
      L.circleMarker([position.lat,position.lng],{radius:9,color:'#1d4ed8',fillColor:'#60a5fa',fillOpacity:1}).addTo(map.current).bindPopup('<b>Your position</b>');
      observer=new ResizeObserver(()=>map.current?.invalidateSize()); observer.observe(mapElement.current); setTimeout(()=>map.current?.invalidateSize(),100);
    }).catch(() => setNotice('The map could not load. The verified demo bin list remains available below.'));
    return()=>{disposed=true;observer?.disconnect();map.current?.remove();map.current=null};
  }, [position]);
  return <Modal title="Nearby bins" close={close}><h2 className="left">📍 Nearby Bins</h2><div className="bin-map" ref={mapElement}/><p className="bin-notice">{notice}</p><div className="bin-list">{sorted.map(bin=><article key={bin.id}><span><b>{bin.name}</b><small>{bin.type} · Demo campus location</small></span><strong>{bin.distance<1?`${Math.round(bin.distance*1000)} m`:`${bin.distance.toFixed(1)} km`}</strong></article>)}</div><button className="dark" onClick={close}>Close Map</button></Modal>;
}

function Citizen({ home }) {
  const [modal,setModal]=useState(''); const [last,setLast]=useState(null);
  const {user,refresh}=useAuth(); const points=user?.green_credits ?? 0;
  useEffect(()=>{ if(!modal) refresh(); },[modal,refresh]);
  if (user && user.role !== 'Citizen') return null;
  return <main className="citizen" id="main-content"><a className="skip" href="#citizen-actions">Skip to reporting actions</a><header><div className="top"><button onClick={home} aria-label="About GreenPulse">ⓘ</button><h1>Green Pulse</h1><button className="track-top" onClick={()=>setModal('reports')}>My Reports</button></div><div className="quick-report"><div><p>See waste? Report it now.</p><h2>Add a description, location and optional photo</h2></div><button onClick={()=>setModal('report')}>📷 Report an issue</button></div></header>
    <section className="actions" id="citizen-actions" tabIndex={-1}><button className="red primary-action" onClick={()=>setModal('report')}><Icon color="red">📷</Icon><b>Capture & Report</b><small>Add a location, details and optional photo</small></button><button className="green" onClick={()=>setModal('reports')}><Icon color="green">📋</Icon><b>Track My Reports</b><small>See queue, inspection and cleaning status</small></button><button className="blue" onClick={()=>setModal('guide')}><Icon color="blue">♻️</Icon><b>Segregation Guide</b></button><button className="green" onClick={()=>setModal('bins')}><Icon color="green">📍</Icon><b>Nearby Bins</b></button><button className="yellow" onClick={()=>setModal('wallet')}><Icon color="yellow">🎁</Icon><b>Eco Points: {points}</b></button><button className="blue" onClick={()=>setModal('scan')}><Icon color="blue">🤖</Icon><b>AI Segregation Assistant</b><small>Identify an item and find its correct bin</small></button></section>
    <section className="impact"><p className="label">Your civic impact</p><div><span>♻️ &nbsp; Waste Sorted</span><b>Not measured</b></div><div><span>📣 &nbsp; Issues Reported</span><b>{last?'View My Reports':'—'}</b></div><div><span>🏆 &nbsp; Campus Rank</span><b>Not ranked</b></div>{last&&<small>Latest report: #{last}</small>}</section>
    {modal==='guide'&&<Segregation close={()=>setModal('')}/>} {modal==='scan'&&<Access role="Citizen" close={()=>setModal('')}><Scanner close={()=>setModal('')}/></Access>} {modal==='report'&&<Access role="Citizen" close={()=>setModal('')}><Report close={()=>setModal('')} success={id=>setLast(id)}/></Access>} {modal==='wallet'&&<Access role="Citizen" close={()=>setModal('')}><Wallet points={points} close={()=>setModal('')}/></Access>} {modal==='bins'&&<NearbyBins close={()=>setModal('')}/>} {modal==='reports'&&<Access role="Citizen" close={()=>setModal('')}><MyReports close={()=>setModal('')}/></Access>}
  </main>;
}

function Map({ reports }) {
  const el=useRef(null), map=useRef(null), leaflet=useRef(null);
  const [mapReady,setMapReady]=useState(false), [mapError,setMapError]=useState('');
  useEffect(()=>{if(!el.current||map.current)return;let disposed=false,observer;const resize=()=>map.current?.invalidateSize();import('leaflet').then(({default:L})=>{if(disposed||!el.current)return;leaflet.current=L;map.current=L.map(el.current).setView([CAMPUS.lat,CAMPUS.lng],13);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map.current);observer=new ResizeObserver(resize);observer.observe(el.current);window.addEventListener('resize',resize);setTimeout(resize,100);setMapReady(true)}).catch(()=>setMapError('The map could not load. Reports remain available in the operations queue.'));return()=>{disposed=true;observer?.disconnect();window.removeEventListener('resize',resize);map.current?.remove();map.current=null;leaflet.current=null}},[]);
  const outliers=reports.filter(report=>!inPilotArea(report)).length;
  useEffect(()=>{const L=leaflet.current;if(!mapReady||!map.current||!L)return;const localReports=reports.filter(inPilotArea);map.current.eachLayer(x=>x instanceof L.CircleMarker&&x.remove());localReports.forEach(r=>L.circleMarker([r.location_lat,r.location_lng],{radius:10,color:r.status==='Pending'?'#dc2626':'#16a34a',fillOpacity:.85}).addTo(map.current).bindPopup(Object.assign(document.createElement('span'),{textContent:`Report #${r.id} · ${r.waste_type} · ${r.status}`})));if(localReports.length>1)map.current.fitBounds(localReports.map(r=>[r.location_lat,r.location_lng]),{padding:[30,30],maxZoom:15});else if(localReports.length===1)map.current.setView([localReports[0].location_lat,localReports[0].location_lng],15);else map.current.setView([CAMPUS.lat,CAMPUS.lng],13)},[reports,mapReady]);
  return <section className="operations-map" aria-label="Solapur pilot operations map"><div className="map" ref={el}/>{mapError&&<p role="status">{mapError}</p>}{outliers>0&&<p role="status">⚠ {outliers} report{outliers===1?' has':'s have'} coordinates outside the Solapur pilot area and {outliers===1?'is':'are'} excluded from map zoom. Review the coordinates before assignment.</p>}</section>;
}

function Admin({home}) { return <Access role="Admin" close={home}><Operations Map={Map}/></Access>; }
function Staff({home}) { return <Access role="Driver" close={home}><FieldWorkerOperations/></Access>; }

function AppContent() {
  const initialPolicy = new URLSearchParams(window.location.search).get('policy');
  const [view, setView] = useState(initialPolicy ? 'legal' : 'citizen');
  const [policy, setPolicy] = useState(initialPolicy || 'privacy');
  const [online, setOnline] = useState(navigator.onLine);
  const { user, authReady, openLogin } = useAuth();

  useEffect(() => {
    const yes = () => setOnline(true), no = () => setOnline(false);
    window.addEventListener('online', yes); window.addEventListener('offline', no);
    return () => { window.removeEventListener('online', yes); window.removeEventListener('offline', no); };
  }, []);
  function openPolicy(id) { setPolicy(id); setView('legal'); window.history.replaceState({}, '', `?policy=${id}`); window.scrollTo(0, 0); }
  function home() { window.history.replaceState({}, '', window.location.pathname); setView('citizen'); window.scrollTo(0, 0); }
  if (view === 'legal') return <LegalPage page={policy} onBack={home}/>;
  if (!authReady) return <main className="workspace-loading" aria-live="polite"><div><span aria-hidden="true">🍃</span><h1>Green Pulse</h1><p>Opening your secure workspace…</p></div></main>;
  const workspace = user?.role === 'Admin'
    ? <Admin home={home}/>
    : user?.role === 'Driver'
      ? <Staff home={home}/>
      : view === 'home'
        ? <Landing citizen={() => setView('citizen')} signIn={openLogin}/>
        : <Citizen home={() => setView('home')}/>;
  return <><div className={`network ${online ? 'online' : 'offline'}`}>{online ? 'Online' : 'Offline — reporting and status updates unavailable'}</div>{workspace}<LegalFooter onOpen={openPolicy}/></>;
}

export default function App(){return <AuthProvider><AppContent/></AuthProvider>;}
