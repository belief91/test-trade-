/**
 * Synchronise le symbole (paire tradée) entre le Journal et la Calculatrice.
 *
 * Fonctionnement honnête : BroadcastChannel permet une synchronisation en
 * direct SI les deux pages sont ouvertes en même temps sur le même appareil
 * (deux onglets). localStorage sert de mémoire de secours : si tu tapes une
 * paire dans le Journal puis navigues ensuite vers la Calculatrice, elle
 * démarre avec cette paire déjà sélectionnée — même sans onglet ouvert
 * simultanément.
 */

const STORAGE_KEY = "beliefx-last-symbol";
const CHANNEL_NAME = "beliefx-symbol-sync";

export function broadcastSymbol(symbol) {
  if (!symbol || typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, symbol);
  } catch { /* stockage indisponible, on ignore silencieusement */ }
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(symbol);
    channel.close();
  } catch { /* BroadcastChannel non supporté, localStorage suffit */ }
}

export function getLastSymbol() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Retourne une fonction "unsubscribe" à appeler au démontage du composant. */
export function subscribeToSymbol(callback) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e) => callback(e.data);
  return () => channel.close();
}
