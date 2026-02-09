import { describe, it, expect } from 'vitest';
import { SKIP_TYPES } from './message-types.js';

describe('message-types', () => {
  it('should skip progress and file-history-snapshot types', () => {
    expect(SKIP_TYPES.has('progress')).toBe(true);
    expect(SKIP_TYPES.has('file-history-snapshot')).toBe(true);
  });

  it('should not skip user and assistant types', () => {
    expect(SKIP_TYPES.has('user')).toBe(false);
    expect(SKIP_TYPES.has('assistant')).toBe(false);
  });
});
