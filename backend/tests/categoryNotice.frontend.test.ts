import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryNotice } from '../../frontend/src/utils/categoryNotice';

test('load failed: the retry message', () => {
  assert.equal(categoryNotice(true, 0, 0), 'load_failed');
});
test('loaded, none for this type: says so, no retry', () => {
  assert.equal(categoryNotice(false, 5, 0), 'none_for_type');
});
test('still loading or categories available: no message', () => {
  assert.equal(categoryNotice(false, 0, 0), null);
  assert.equal(categoryNotice(false, 5, 3), null);
});
