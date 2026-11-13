import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClient,
  getIngredients,
  getPreparationOptions,
  getPublications,
  getRecipeLinkOptions,
  getRecipePicklists,
  getTags,
  redirect,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  getIngredients: vi.fn(),
  getPreparationOptions: vi.fn(),
  getPublications: vi.fn(),
  getRecipeLinkOptions: vi.fn(),
  getRecipePicklists: vi.fn(),
  getTags: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/recipes/data', () => ({
  getIngredients,
  getPreparationOptions,
  getPublications,
  getRecipeLinkOptions,
  getRecipePicklists,
  getTags,
}));
vi.mock('../../src/app/recipes/recipe-form', () => ({ RecipeForm: () => null }));

import NewRecipePage from '../../src/app/recipes/new/page';

describe('new recipe page authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    });
  });

  it.each([
    ['missing user', { data: { user: null }, error: null }],
    ['auth error', { data: { user: null }, error: new Error('Auth lookup failed') }],
  ])('redirects before loading private recipe data on %s', async (_label, authResult) => {
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue(authResult) },
    });

    await expect(NewRecipePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT:/',
    );
    expect(redirect).toHaveBeenCalledWith('/');
    expect(getIngredients).not.toHaveBeenCalled();
    expect(getPreparationOptions).not.toHaveBeenCalled();
    expect(getPublications).not.toHaveBeenCalled();
    expect(getRecipeLinkOptions).not.toHaveBeenCalled();
    expect(getRecipePicklists).not.toHaveBeenCalled();
    expect(getTags).not.toHaveBeenCalled();
  });
});
