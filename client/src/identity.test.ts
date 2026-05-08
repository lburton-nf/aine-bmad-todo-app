import { test, expect, beforeEach } from 'vitest';
import { getUserId, reset } from './identity';

const STORAGE_KEY = 'todo.userId';
const USER_ID_REGEX = /^anon-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  localStorage.clear();
});

test('mints a fresh anon-{uuid} when storage is empty and persists it', () => {
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  const id = getUserId();
  expect(id).toMatch(USER_ID_REGEX);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(id);
});

test('returns the same value across calls (no remint)', () => {
  const first = getUserId();
  const second = getUserId();
  const third = getUserId();
  expect(second).toBe(first);
  expect(third).toBe(first);
});

test('discards a malformed stored value and mints a fresh one', () => {
  localStorage.setItem(STORAGE_KEY, 'junk');
  const id = getUserId();
  expect(id).not.toBe('junk');
  expect(id).toMatch(USER_ID_REGEX);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(id);
});

test('discards an empty stored value and mints a fresh one', () => {
  localStorage.setItem(STORAGE_KEY, '');
  const id = getUserId();
  expect(id).toMatch(USER_ID_REGEX);
});

test('keeps a valid stored value verbatim', () => {
  const valid = 'anon-11111111-1111-1111-1111-111111111111';
  localStorage.setItem(STORAGE_KEY, valid);
  expect(getUserId()).toBe(valid);
});

test('reset() clears the stored value and mints a fresh different one', () => {
  const before = getUserId();
  const after = reset();
  expect(after).not.toBe(before);
  expect(after).toMatch(USER_ID_REGEX);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(after);
});
