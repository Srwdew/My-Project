import { clearPendingTransaction } from "./lib/pendingTransaction";
import { useSyncExternalStore } from "react";
const TOKEN_KEY = "spendsense_token";
export function saveToken(token: string) {
  clearPendingTransaction();
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event("spendsense-session"));
}
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function removeToken() {
  clearPendingTransaction();
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("spendsense-session"));
}
export function isLoggedIn() {
  return Boolean(getToken());
}
function subscribe(listener: () => void) {
  window.addEventListener("spendsense-session", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("spendsense-session", listener);
    window.removeEventListener("storage", listener);
  };
}
export function useSessionKey() {
  return useSyncExternalStore(subscribe, getToken, () => null);
}

if (typeof window !== "undefined") {
  let observedToken = getToken();
  window.addEventListener("spendsense-session", () => {
    const next = getToken();
    if (next !== observedToken) clearPendingTransaction();
    observedToken = next;
  });
  window.addEventListener("storage", (event) => {
    if (event.key === TOKEN_KEY || event.key === null) {
      clearPendingTransaction();
      observedToken = getToken();
    }
  });
}
