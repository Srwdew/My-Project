import { useSyncExternalStore } from 'react';
const TOKEN_KEY = 'spendsense_token';
export function saveToken(token: string) { localStorage.setItem(TOKEN_KEY, token); window.dispatchEvent(new Event('spendsense-session')); }
export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function removeToken() { localStorage.removeItem(TOKEN_KEY); window.dispatchEvent(new Event('spendsense-session')); }
export function isLoggedIn() { return Boolean(getToken()); }
function subscribe(listener: () => void) { window.addEventListener('spendsense-session', listener); window.addEventListener('storage', listener); return () => { window.removeEventListener('spendsense-session', listener); window.removeEventListener('storage', listener); }; }
export function useSessionKey() { return useSyncExternalStore(subscribe, getToken, () => null); }
