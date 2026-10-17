import { afterEach, describe, expect, it, vi } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

import { getPublicRecipePageData } from '../../src/lib/recipes/public-data';

const publicId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('public recipe media access', () => {
  it.each([
    { label: 'private', is_private: true, trashed_at: null },
    { label: 'trashed', is_private: false, trashed_at: '2026-01-01T00:00:00.000Z' },
  ])('does not load or sign photos for a $label recipe', async (visibility) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');

    const maybeSingle = vi.fn(async () => ({
      data: {
        id: 'recipe-id',
        account_id: 'account-id',
        public_id: publicId,
        is_private: visibility.is_private,
        trashed_at: visibility.trashed_at,
      },
      error: null,
    }));
    const query = {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
    };
    const from = vi.fn(() => query);
    const createSignedUrl = vi.fn();
    const storageFrom = vi.fn(() => ({ createSignedUrl }));
    createClientMock.mockReturnValue({
      from,
      storage: { from: storageFrom },
    });

    await expect(getPublicRecipePageData(publicId)).resolves.toEqual({
      status: 'unavailable',
    });

    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith('recipes');
    expect(storageFrom).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
