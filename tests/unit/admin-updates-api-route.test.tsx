import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClient } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));

import { GET } from '../../src/app/api/admin/updates/route';

const apiKey = 'test-admin-updates-api-key-with-at-least-thirty-two-characters';

function update(
  id: string,
  body: string,
  kind: string,
  completedVersion: string | null,
  completedAt: string | null,
  sortOrder: number,
  isArchived = false,
) {
  return {
    id,
    body_markdown: body,
    kind,
    completed_version: completedVersion,
    completed_at: completedAt,
    sort_order: sortOrder,
    is_archived: isArchived,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-02T00:00:00.000Z',
    revision: 3,
    created_by: 'private-actor-id',
    updated_by: 'private-actor-id',
  };
}

function setup(
  result: { data: ReturnType<typeof update>[] | null; error: { code?: string } | null } = {
    data: [],
    error: null,
  },
) {
  const order = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  createAdminClient.mockReturnValue({ from });
  return { from, select, order };
}

function request(authorization?: string) {
  const headers = new Headers();
  if (authorization) headers.set('Authorization', authorization);
  return new Request('https://recipe-box.example/api/admin/updates', { headers });
}

describe('Admin Updates API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_UPDATES_API_KEY', apiKey);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('fails closed when the server key is missing', async () => {
    vi.stubEnv('ADMIN_UPDATES_API_KEY', '');

    const response = await GET(request(`Bearer ${apiKey}`));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Admin Updates API is not configured.',
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ['missing credentials', undefined],
    ['an incorrect key', 'Bearer incorrect-api-key'],
    ['a non-bearer scheme', `Basic ${apiKey}`],
  ])('rejects %s before querying Supabase', async (_label, authorization) => {
    setup();

    const response = await GET(request(authorization));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid API credentials.' });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('returns all updates in tracker order with only the documented fields', async () => {
    const { from, select, order } = setup({
      data: [
        update(
          '00000000-0000-4000-8000-000000000004',
          'Completed older',
          'feature',
          '1.2.0',
          '2026-11-05T00:00:00.000Z',
          0,
        ),
        update('00000000-0000-4000-8000-000000000001', 'Open second', 'fix', null, null, 2),
        update(
          '00000000-0000-4000-8000-000000000002',
          'Archived open first',
          'change',
          null,
          null,
          1,
          true,
        ),
        update(
          '00000000-0000-4000-8000-000000000003',
          'Completed newer',
          'fix',
          '1.3.0',
          '2026-11-10T00:00:00.000Z',
          0,
        ),
      ],
      error: null,
    });

    const response = await GET(request(`Bearer ${apiKey}`));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0, must-revalidate',
    );
    expect(from).toHaveBeenCalledWith('app_updates');
    expect(select).toHaveBeenCalledWith(
      'id, body_markdown, kind, completed_version, completed_at, sort_order, is_archived, created_at, updated_at',
    );
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    await expect(response.json()).resolves.toEqual({
      updates: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          body_markdown: 'Archived open first',
          kind: 'change',
          completed_version: null,
          completed_at: null,
          sort_order: 1,
          is_archived: true,
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-02T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000001',
          body_markdown: 'Open second',
          kind: 'fix',
          completed_version: null,
          completed_at: null,
          sort_order: 2,
          is_archived: false,
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-02T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000003',
          body_markdown: 'Completed newer',
          kind: 'fix',
          completed_version: '1.3.0',
          completed_at: '2026-11-10T00:00:00.000Z',
          sort_order: 0,
          is_archived: false,
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-02T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000004',
          body_markdown: 'Completed older',
          kind: 'feature',
          completed_version: '1.2.0',
          completed_at: '2026-11-05T00:00:00.000Z',
          sort_order: 0,
          is_archived: false,
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-02T00:00:00.000Z',
        },
      ],
    });
  });

  it('returns an unavailable error rather than an empty success on database failure', async () => {
    setup({ data: null, error: { code: 'XX000' } });

    const response = await GET(request(`Bearer ${apiKey}`));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Unable to load Admin Updates. Please try again.',
    });
  });
});
