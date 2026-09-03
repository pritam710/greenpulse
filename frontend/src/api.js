const configured = import.meta.env.VITE_API_URL;
const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
export const API = configured || (local ? 'http://127.0.0.1:8000' : '');
let token = '';
export const setToken = value => { token = value; };

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
      token = '';
      window.dispatchEvent(new Event('greenpulse-session-expired'));
    }
    throw new Error(typeof data?.detail === 'string' ? data.detail : 'Request could not be completed.');
  }
  return data;
}

export async function readPhoto(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)
    throw new Error('Choose a JPEG, PNG or WebP photo under 2 MB.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read photo.'));
    reader.readAsDataURL(file);
  });
}
