import { getToken, removeToken } from './auth';

const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:4000'
).trim().replace(/\/+$/, '');

type ApiOptions = RequestInit & {
  auth?: boolean;
};

export async function apiFetch(
  path: string,
  options: ApiOptions = {}
) {
  const { auth = true, ...fetchOptions } = options;

  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('API path ต้องเริ่มด้วย / เช่น /transactions');
  }

  const headers = new Headers(fetchOptions.headers);

  if (
    !headers.has('Content-Type') &&
    typeof fetchOptions.body === 'string'
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const token = auth ? getToken() : null;

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (
    auth &&
    response.status === 401 &&
    getToken() === token
  ) {
    removeToken();

    if (window.location.pathname !== '/login') {
      window.location.replace('/login');
    }
  }

  if (auth && response.ok && getToken() === token &&
      /^(POST|PUT|DELETE)$/i.test(fetchOptions.method ?? 'GET') &&
      /^\/(transactions(?:\/|$)|budget(?:\/|$)|settings$|notification-settings\/budget$)/.test(path)) {
    window.dispatchEvent(new Event('spendsense-data-changed'));
  }
  return response;
}