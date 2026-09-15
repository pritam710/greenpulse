const configured = import.meta.env.VITE_API_URL;
const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const hostedBackend = 'https://greenpulse-api-o5a2.onrender.com';
export const API = configured || (local ? 'http://127.0.0.1:8000' : hostedBackend);
const tokenKey = 'greenpulse-session';
let token = '';
try { token = sessionStorage.getItem(tokenKey) || ''; } catch { token = ''; }
export const hasToken = () => Boolean(token);
export const setToken = value => {
  token = value || '';
  try { if (token) sessionStorage.setItem(tokenKey, token); else sessionStorage.removeItem(tokenKey); } catch { /* Use the in-memory session when storage is unavailable. */ }
};

export async function api(path, options = {}) {
  if (!API) throw new Error('The secure server has not been connected to this hosted demo yet.');
  if (!local && !API.startsWith('https://')) throw new Error('The secure server must use HTTPS.');
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options, cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch { throw new Error('Server unavailable. Nothing was submitted or changed. Please retry when connected.'); }
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
