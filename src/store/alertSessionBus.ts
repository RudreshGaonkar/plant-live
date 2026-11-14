// src/store/alertSessionBus.ts
// Lightweight event bus to break the circular dependency between
// useSession.ts and useAlertEngine.ts. No React, no Zustand, no app imports.

let _clearer: (() => void) | null = null;

/** Called once by useAlertEngine to register its session-clear logic */
export function registerAlertSessionClearer(fn: () => void): void {
  _clearer = fn;
}

/**
 * Called by useSession.signOut() and the auth listener to clear alert session state.
 * Safe to call even before useAlertEngine has mounted (no-op until registered).
 */
export function triggerAlertSessionClear(): void {
  _clearer?.();
}
