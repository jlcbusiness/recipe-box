import { describe, expect, it } from 'vitest';
import {
  normalizePublicUsername,
  validatePublicUsername,
} from '../../src/lib/accounts/public-username-rules';

describe('public username rules', () => {
  it('normalizes surrounding whitespace and case', () => {
    expect(normalizePublicUsername('  Jamie-Lamont  ')).toBe('jamie-lamont');
  });

  it('accepts 3–30 lowercase ASCII letters, numbers, and internal hyphens', () => {
    expect(validatePublicUsername('abc')).toBeNull();
    expect(validatePublicUsername('a-1')).toBeNull();
    expect(validatePublicUsername('a'.repeat(30))).toBeNull();
  });

  it.each(['', 'ab', 'a'.repeat(31), '-abc', 'abc-', 'has space', 'under_score', 'café'])(
    'rejects invalid username %j',
    (value) => {
      expect(validatePublicUsername(value)).not.toBeNull();
    },
  );
});
