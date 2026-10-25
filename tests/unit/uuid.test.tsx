import { describe, expect, it, vi } from 'vitest';
import { createUuid } from '../../src/lib/uuid';

describe('createUuid', () => {
  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    const getRandomValues = vi.fn((values: Uint8Array) => values);

    expect(createUuid({ randomUUID, getRandomValues })).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it('generates a version 4 UUID with getRandomValues when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((values: Uint8Array) => {
      values.fill(0);
      return values;
    });

    expect(createUuid({ getRandomValues })).toBe('00000000-0000-4000-8000-000000000000');
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});
