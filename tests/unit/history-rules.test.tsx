import { describe, expect, it } from 'vitest';
import { formatHistoryEvent } from '../../src/lib/history/rules';

describe('history event formatting', () => {
  it('formats changed recipe values and nested content without exposing identifiers', () => {
    const entry = formatHistoryEvent(
      {
        actor_user_id: 'actor-secret-id',
        event_type: 'recipe.updated',
        before_data: {
          account_id: 'account-secret-id',
          id: 'record-secret-id',
          public_id: 'public-link-secret-id',
          version: 2,
          name: 'Sunday roast',
          bake_time_minutes: 45,
          picklists: {
            food_type: 'Roast',
            meal_type: ['Dinner'],
            cuisine: ['British'],
            publication: 'Sunday Table',
          },
          ingredients: [
            {
              id: 'ingredient-row-secret-id',
              ingredient_id: 'ingredient-secret-id',
              name: 'Potato',
              preparation: 'quartered',
              measurements: [
                {
                  id: 'measurement-secret-id',
                  amount_min: 4,
                  unit_code: null,
                  picklist_value: null,
                },
              ],
            },
          ],
          steps: [{ id: 'step-secret-id', position: 1, plain_text: 'Roast until tender.' }],
          tags: [{ id: 'tag-secret-id', name: 'Sunday' }],
        },
        after_data: {
          account_id: 'account-secret-id',
          id: 'record-secret-id',
          public_id: 'public-link-secret-id',
          version: 3,
          name: 'Sunday roast potatoes',
          bake_time_minutes: 45,
          picklists: {
            food_type: 'Roast',
            meal_type: ['Dinner'],
            cuisine: ['British'],
            publication: 'The Green Kitchen',
          },
          ingredients: [
            {
              id: 'ingredient-row-secret-id',
              ingredient_id: 'ingredient-secret-id',
              name: 'Potato',
              preparation: 'quartered',
              measurements: [
                {
                  id: 'measurement-secret-id',
                  amount_min: 6,
                  unit_code: null,
                  picklist_value: null,
                },
              ],
            },
          ],
          steps: [{ id: 'step-secret-id', position: 1, plain_text: 'Roast until golden.' }],
          tags: [{ id: 'tag-secret-id', name: 'Sunday' }],
        },
      },
      'recipe',
    );

    expect(entry.action).toBe('Recipe updated');
    expect(entry.actor).toBe('You');
    expect(entry.changes).toContainEqual({
      label: 'Name',
      before: 'Sunday roast',
      after: 'Sunday roast potatoes',
    });
    expect(entry.changes).toContainEqual({
      label: 'Ingredients',
      before: 'Potato (4), quartered',
      after: 'Potato (6), quartered',
    });
    expect(entry.changes).toContainEqual({
      label: 'Instructions',
      before: 'Roast until tender.',
      after: 'Roast until golden.',
    });
    expect(entry.changes).toContainEqual({
      label: 'Classifications',
      before: 'Food type: Roast; Publication: Sunday Table; Meal type: Dinner; Cuisine: British',
      after:
        'Food type: Roast; Publication: The Green Kitchen; Meal type: Dinner; Cuisine: British',
    });
    expect(JSON.stringify(entry)).not.toMatch(/secret-id|public-link/);
    expect(
      entry.changes.every((change) =>
        [change.before, change.after].every(
          (value) => !value || !['{', '}', '[', ']'].some((character) => value.includes(character)),
        ),
      ),
    ).toBe(true);
  });

  it('shows initial creation values and turns cleared values into readable text', () => {
    const created = formatHistoryEvent(
      {
        actor_user_id: null,
        event_type: 'publication.created',
        before_data: null,
        after_data: {
          id: 'publication-secret-id',
          account_id: 'account-secret-id',
          name: 'Family cookbook',
          publication_type: 'book',
          author: null,
        },
      },
      'publication',
    );
    const updated = formatHistoryEvent(
      {
        actor_user_id: 'actor-secret-id',
        event_type: 'publication.updated',
        before_data: { name: 'Family cookbook', author: 'A. Cook' },
        after_data: { name: 'Family cookbook', author: null },
      },
      'publication',
    );

    expect(created.action).toBe('Publication created');
    expect(created.actor).toBe('Account unavailable');
    expect(created.changes).toContainEqual({
      label: 'Name',
      before: null,
      after: 'Family cookbook',
    });
    expect(updated.changes).toContainEqual({
      label: 'Author',
      before: 'A. Cook',
      after: 'Not set',
    });
    expect(JSON.stringify(created)).not.toContain('publication-secret-id');
  });

  it('treats a null legacy after snapshot as cleared display values', () => {
    const entry = formatHistoryEvent(
      {
        actor_user_id: 'actor-secret-id',
        event_type: 'recipe.updated',
        before_data: { name: 'Older recipe name' },
        after_data: null,
      },
      'recipe',
    );

    expect(entry.changes).toContainEqual({
      label: 'Name',
      before: 'Older recipe name',
      after: 'Not set',
    });
  });
});
