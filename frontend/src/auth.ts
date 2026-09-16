const TOKEN_KEY = 'spendsense_token';

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event('spendsense-session'));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event('spendsense-session'));
}

export function isLoggedIn() {
  return Boolean(getToken());
}