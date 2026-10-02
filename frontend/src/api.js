const configured = import.meta.env.VITE_API_URL;
const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const hostedBackend = 'https://greenpulse-api-o5a2.onrender.com';
export const API = configured || (local ? 'http://127.0.0.1:8000' : hostedBackend);
export const REQUEST_TIMEOUT_MS = 75_000;
const READY_CACHE_MS = 5 * 60 * 1000;
const tokenKey = 'greenpulse-session';
let token = '';
let readyAt = 0;
let warming = null;
try { token = sessionStorage.getItem(tokenKey) || ''; } catch { token = ''; }
export const hasToken = () => Boolean(token);
export const setToken = value => {
  token = value || '';
  try { if (token) sessionStorage.setItem(tokenKey, token); else sessionStorage.removeItem(tokenKey); } catch { /* Use the in-memory session when storage is unavailable. */ }
};

export async function api(path, options = {}) {
  if (!API) throw new Error('The secure server has not been connected to this hosted demo yet.');
  if (!local && !API.startsWith('https://')) throw new Error('The secure server must use HTTPS.');
  const { timeoutMs = REQUEST_TIMEOUT_MS, signal: callerSignal, ...requestOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const cancelFromCaller = () => controller.abort();
  if (callerSignal?.aborted) cancelFromCaller();
  else callerSignal?.addEventListener('abort', cancelFromCaller, { once: true });
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const headers = new Headers(requestOptions.headers || {});
  if (requestOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...requestOptions, cache: 'no-store', credentials: 'omit', signal: controller.signal, headers,
    });
  } catch {
    if (timedOut) {
      const seconds = Math.ceil(timeoutMs / 1000);
      const method = String(requestOptions.method || 'GET').toUpperCase();
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        throw new Error(`The secure server did not respond within ${seconds} seconds. It may be waking from the free hosting mode; please retry once.`);
      }
      throw new Error(`The secure server did not respond within ${seconds} seconds. The result is unknown; wait for the server-ready indicator before submitting again.`);
    }
    if (callerSignal?.aborted) throw new Error('Request cancelled. Nothing was submitted or changed.');
    throw new Error('Server unavailable. Nothing was submitted or changed. Please retry when connected.');
  } finally {
    window.clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', cancelFromCaller);
  }
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) {
      setToken('');
      window.dispatchEvent(new Event('greenpulse-session-expired'));
    }
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Request could not be completed.');
  }
  return data;
}

// Start the free API and its database before a visitor submits credentials. The
// root fallback keeps the site compatible while an older backend release is
// still active. Both requests are read-only; authentication POSTs are never
// replayed.
export function warmApi({ force = false } = {}) {
  if (!force && readyAt && Date.now() - readyAt < READY_CACHE_MS) {
    return Promise.resolve({ ready: true, cached: true });
  }
  if (warming) return warming;
  warming = api('/ready').catch(() => api('/'))
    .then(() => { readyAt = Date.now(); return { ready: true, cached: false }; })
    .catch(error => ({ ready: false, message: error.message }))
    .finally(() => { warming = null; });
  return warming;
}

export async function readPhoto(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024)
    throw new Error('Choose a JPEG, PNG or WebP photo under 15 MB.');
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read photo.'));
    reader.readAsDataURL(file);
  });
  const targetLength = 800 * 1024;
  if (source.length <= targetLength) return source;

  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Could not prepare this photo.'));
    element.src = source;
  });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare this photo.');
  for (const maxSide of [1600, 1400, 1200, 1000]) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const compressed = canvas.toDataURL('image/jpeg', quality);
      if (compressed.length <= targetLength) return compressed;
    }
  }
  throw new Error('This photo is still too large. Retake it at a lower camera resolution.');
}
