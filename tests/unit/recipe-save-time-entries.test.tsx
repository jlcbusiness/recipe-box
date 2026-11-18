import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as externalReferenceTitles from '../../src/lib/recipes/external-reference-title';

const { createClient, redirect, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('../../src/lib/supabase/server', () => ({ createClient }));

import { saveRecipe } from '../../src/app/recipes/actions';

const recipeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const timeTypeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const setId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function createFormData(
  timeEntries: unknown = [],
  relationships: unknown = { site_listing: null, pairings: [], references: [] },
) {
  const formData = new FormData();
  formData.set('name', 'Time entry recipe');
  formData.set('state', 'want_to_try');
  formData.set('ingredient_rows', '[]');
  formData.set('ingredient_sets', JSON.stringify([{ id: setId, label: 'Main', position: 0 }]));
  formData.set('instruction_steps', '[]');
  formData.set('nutrition_overrides', '{}');
  formData.set('recipe_relationships', JSON.stringify(relationships));
  formData.set('time_entries', JSON.stringify(timeEntries));
  return formData;
}

describe('recipe save time entries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: recipeId, version: 1 }], error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
  });

  it('sends only normalized time-entry data to the trusted save RPC', async () => {
    const formData = createFormData([{ time_type_id: timeTypeId, minutes: 25, position: 0 }]);

    await expect(saveRecipe(undefined, formData)).resolves.toEqual({ recipeId });

    const supabase = await createClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith(
      'save_recipe_with_time_entries',
      expect.objectContaining({
        p_time_entries: [{ time_type_id: timeTypeId, minutes: 25, position: 0 }],
      }),
    );
    expect(supabase.rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_total_time_minutes');
  });

  it('rejects malformed or incomplete time entries before calling the save RPC', async () => {
    const formData = createFormData([{ time_type_id: '', minutes: '25', position: 0 }]);

    await expect(saveRecipe(undefined, formData)).resolves.toMatchObject({
      error: expect.stringMatching(/time/i),
    });

    const supabase = await createClient.mock.results[0]?.value;
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('preserves protected source identity while normalizing recipe references', async () => {
    const sourcePublicId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const formData = createFormData([], {
      site_listing: null,
      pairings: [],
      references: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          reference_type: 'external_url',
          display_text: 'https://example.test/source',
          linked_recipe_id: null,
          publication_id: null,
          url: 'https://example.test/source',
          is_protected_source: true,
          source_public_id: sourcePublicId,
        },
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          reference_type: 'printed_citation',
          display_text: 'A printed source',
          linked_recipe_id: null,
          publication_id: null,
          url: null,
        },
      ],
    });

    await expect(saveRecipe(undefined, formData)).resolves.toEqual({ recipeId });

    const supabase = await createClient.mock.results[0]?.value;
    expect(supabase.rpc.mock.calls[0]?.[1].p_recipe_relationships.references).toEqual([
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        reference_type: 'external_url',
        display_text: 'https://example.test/source',
        linked_recipe_id: null,
        publication_id: null,
        url: 'https://example.test/source',
        is_protected_source: true,
        source_public_id: sourcePublicId,
      },
      {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        reference_type: 'printed_citation',
        display_text: 'A printed source',
        linked_recipe_id: null,
        publication_id: null,
        url: null,
        is_protected_source: false,
        source_public_id: null,
      },
    ]);
  });

  it('saves an automatically resolved page title with the normalized URL', async () => {
    const resolveTitles = externalReferenceTitles.resolveExternalReferenceTitles;
    const lookup = vi.fn(async () => ({
      title: 'Stovetop Chicken & Broccoli Casserole',
      reason: null,
    }));
    vi.spyOn(externalReferenceTitles, 'resolveExternalReferenceTitles').mockImplementation(
      (references, storedReferences) => resolveTitles(references, storedReferences, lookup),
    );
    const referenceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const formData = createFormData([], {
      site_listing: null,
      pairings: [],
      references: [
        {
          id: referenceId,
          reference_type: 'external_url',
          display_text: '',
          linked_recipe_id: null,
          publication_id: null,
          url: 'https://EXAMPLE.test/chicken',
        },
      ],
    });

    await expect(saveRecipe(undefined, formData)).resolves.toEqual({ recipeId });

    expect(lookup).toHaveBeenCalledWith('https://example.test/chicken', expect.any(AbortSignal));
    const supabase = await createClient.mock.results[0]?.value;
    expect(supabase.rpc.mock.calls[0]?.[1].p_recipe_relationships.references).toEqual([
      {
        id: referenceId,
        reference_type: 'external_url',
        display_text: 'Stovetop Chicken & Broccoli Casserole',
        linked_recipe_id: null,
        publication_id: null,
        url: 'https://example.test/chicken',
        is_protected_source: false,
        source_public_id: null,
      },
    ]);
  });

  it.each([
    ['timeout', { title: null, reason: 'timeout' }],
    ['blocked destination', { title: null, reason: 'blocked_address' }],
    ['invalid response', { title: null, reason: 'non_html' }],
    ['missing title', { title: null, reason: 'missing_title' }],
  ] as const)('saves with URL fallback after a %s lookup failure', async (_failure, result) => {
    const resolveTitles = externalReferenceTitles.resolveExternalReferenceTitles;
    const lookup = vi.fn(async () => result);
    vi.spyOn(externalReferenceTitles, 'resolveExternalReferenceTitles').mockImplementation(
      (references, storedReferences) => resolveTitles(references, storedReferences, lookup),
    );
    const referenceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const normalizedUrl = 'https://example.test/recipe';
    const formData = createFormData([], {
      site_listing: null,
      pairings: [],
      references: [
        {
          id: referenceId,
          reference_type: 'external_url',
          display_text: '',
          linked_recipe_id: null,
          publication_id: null,
          url: 'https://EXAMPLE.test/recipe',
        },
      ],
    });

    await expect(saveRecipe(undefined, formData)).resolves.toEqual({ recipeId });

    const supabase = await createClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith(
      'save_recipe_with_time_entries',
      expect.objectContaining({
        p_recipe_relationships: {
          site_listing: null,
          pairings: [],
          references: [
            {
              id: referenceId,
              reference_type: 'external_url',
              display_text: normalizedUrl,
              linked_recipe_id: null,
              publication_id: null,
              url: normalizedUrl,
              is_protected_source: false,
              source_public_id: null,
            },
          ],
        },
      }),
    );
  });

  it('rejects inconsistent protected source metadata before calling the save RPC', async () => {
    const formData = createFormData([], {
      site_listing: null,
      pairings: [],
      references: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          reference_type: 'external_url',
          display_text: 'https://example.test/source',
          linked_recipe_id: null,
          publication_id: null,
          url: 'https://example.test/source',
          is_protected_source: true,
          source_public_id: null,
        },
      ],
    });

    await expect(saveRecipe(undefined, formData)).resolves.toMatchObject({
      error: expect.stringMatching(/Pairs With and References/),
    });

    const supabase = await createClient.mock.results[0]?.value;
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
