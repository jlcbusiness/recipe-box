import { describe, expect, it } from 'vitest';
import {
  type AdminUpdate,
  compareSemverCore,
  getAdminUpdateBodyError,
  isAdminUpdateKind,
  isSemverCore,
  sortAdminUpdates,
} from '../../src/lib/admin-updates/rules';

function update(
  id: string,
  values: Partial<AdminUpdate> & Pick<AdminUpdate, 'created_at' | 'completed_version'>,
): AdminUpdate {
  const { created_at, completed_version, ...overrides } = values;
  return {
    id,
    body_markdown: id,
    kind: 'fix',
    is_archived: false,
    revision: 1,
    created_at,
    updated_at: created_at,
    completed_version,
    ...overrides,
  };
}

describe('admin update validation and ordering', () => {
  it('requires non-whitespace content and enforces the trimmed Unicode code-point limit', () => {
    expect(getAdminUpdateBodyError(' \n\t ')).toBe('Enter update text.');
    expect(getAdminUpdateBodyError(`${'a'.repeat(4_999)}🍲`)).toBeNull();
    expect(getAdminUpdateBodyError(` ${'a'.repeat(5_000)}🍲 `)).toBe(
      'Update text must be 5,000 characters or fewer.',
    );
    expect(getAdminUpdateBodyError(` ${'a'.repeat(5_000)} `)).toBeNull();
  });

  it('allows exactly Fix and Feature as entry kinds', () => {
    expect(isAdminUpdateKind('fix')).toBe(true);
    expect(isAdminUpdateKind('feature')).toBe(true);
    expect(isAdminUpdateKind('tweak')).toBe(false);
    expect(isAdminUpdateKind('')).toBe(false);
    expect(isAdminUpdateKind(null)).toBe(false);
  });

  it('compares semantic version core numbers rather than their text', () => {
    expect(compareSemverCore('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemverCore('2.0.0', '10.0.0')).toBeLessThan(0);
    expect(compareSemverCore('0.0.0', '0.0.0')).toBe(0);
    expect(compareSemverCore('999999999999999999999.0.0', '2.0.0')).toBeGreaterThan(0);

    for (const invalid of [
      '',
      '1.2',
      '1.2.3.4',
      'v1.2.3',
      '01.2.3',
      '1.02.3',
      '1.2.03',
      '1.-2.3',
      '1.2.3-rc.1',
      '1.2.3+build.1',
      ' 1.2.3',
      '1.2.3 ',
    ]) {
      expect(() => compareSemverCore(invalid, '1.2.3'), invalid).toThrow(
        'Expected a semantic version core.',
      );
    }
  });

  it('accepts only standard semantic version cores', () => {
    expect(isSemverCore('0.0.0')).toBe(true);
    expect(isSemverCore('1.10.0')).toBe(true);
    expect(isSemverCore('01.2.3')).toBe(false);
    expect(isSemverCore('1.2.3-rc.1')).toBe(false);
    expect(isSemverCore('1.2.3\n')).toBe(false);
  });

  it('sorts incomplete updates first and completed updates by semantic version', () => {
    const updates = [
      update('done-1-9', { created_at: '2026-01-03T00:00:00Z', completed_version: '1.9.0' }),
      update('open-old', { created_at: '2026-01-01T00:00:00Z', completed_version: null }),
      update('done-1-10', { created_at: '2026-01-01T00:00:00Z', completed_version: '1.10.0' }),
      update('open-new', { created_at: '2026-01-02T00:00:00Z', completed_version: null }),
      update('done-equal-new', {
        created_at: '2026-01-04T00:00:00Z',
        completed_version: '1.10.0',
      }),
    ];

    expect(sortAdminUpdates(updates).map(({ id }) => id)).toEqual([
      'open-new',
      'open-old',
      'done-equal-new',
      'done-1-10',
      'done-1-9',
    ]);
  });
});
