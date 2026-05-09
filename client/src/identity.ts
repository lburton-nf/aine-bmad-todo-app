// Anonymous identity module — mints, persists, validates, and resets the
// caller's `anon-${uuid}` identifier. Single source of truth for X-User-Id.

const STORAGE_KEY = 'todo.userId';
// Canonical 8-4-4-4-12 UUID hex shape — same regex the server enforces.
const USER_ID_REGEX = /^anon-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mint(): string {
  return `anon-${crypto.randomUUID()}`;
}

/**
 * Returns the caller's anonymous user id, minting and persisting a fresh
 * one if no valid value is already stored.
 */
export function getUserId(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && USER_ID_REGEX.test(stored)) return stored;
  const fresh = mint();
  localStorage.setItem(STORAGE_KEY, fresh);
  return fresh;
}

/**
 * Clears the stored id and mints a fresh one. Returns the new id.
 * Used by the API client when the server reports an unrecognised id (FR9).
 */
export function reset(): string {
  localStorage.removeItem(STORAGE_KEY);
  return getUserId();
}
