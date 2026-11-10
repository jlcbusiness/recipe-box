import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { RecipeRelationshipsEditor } from '../../src/app/recipes/recipe-relationships-editor';
import type { RecipeReference } from '../../src/lib/recipes/data';

const sourcePublicId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const reference = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reference_type: 'external_url',
  display_text: "source-user's Citrus cake",
  linked_recipe_id: null,
  linked_recipe_is_active: false,
  publication_id: null,
  url: `https://recipe-box.example/r/${sourcePublicId}`,
  position: 0,
  is_protected_source: true,
  source_public_id: sourcePublicId,
} satisfies RecipeReference;

describe('protected recipe source reference', () => {
  beforeEach(() => cleanup());

  it('renders as read-only attribution and preserves its identity in the save payload', () => {
    const { container } = render(
      <RecipeRelationshipsEditor recipeOptions={[]} pairings={[]} references={[reference]}>
        <div />
      </RecipeRelationshipsEditor>,
    );

    expect(screen.getByText('(protected source)')).toBeTruthy();
    expect(screen.getByRole('link', { name: reference.display_text }).getAttribute('href')).toBe(
      reference.url,
    );
    expect(container.querySelector('.recipe-reference-locked-value')?.textContent).toBe(
      `${reference.display_text} (protected source)`,
    );
    expect(screen.queryByLabelText('Reference 1')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Reference 1' })).toBeNull();

    const payload = JSON.parse(
      container.querySelector<HTMLInputElement>('input[name="recipe_relationships"]')?.value ?? '',
    ) as { references: Record<string, unknown>[] };
    expect(payload.references).toContainEqual(
      expect.objectContaining({
        is_protected_source: true,
        source_public_id: sourcePublicId,
      }),
    );
  });
});
