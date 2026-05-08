// Proves the cross-runtime import seam for shared/types from the client side.
// Remove or expand when the first real consumer lands in Epic 3.
import { test, expect } from 'vitest';
import type { Todo } from '../../shared/types';

test('shared/types Todo shape compiles for client-side imports', () => {
  const fixture: Todo = {
    id: 'b3a8d1e5-3f72-4c2c-8d9b-8b1e5b7f4c6a',
    description: 'pick up bread',
    created_at: 1715167200000,
    completed: false,
  };
  expect(Object.keys(fixture).sort()).toEqual(['completed', 'created_at', 'description', 'id']);
});
