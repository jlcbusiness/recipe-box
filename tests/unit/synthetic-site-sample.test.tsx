import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findLocalOwner } from '../../scripts/synthetic-owner-selection.mjs';

type SyntheticRecipe = {
  slug: string;
  state: 'tried' | 'want_to_try' | 'will_not_try';
  opinion: {
    verdict: string | null;
    enthusiasm: string | null;
    reason: string | null;
  };
  ingredientSets?: Array<{ key: string; label: string }>;
  ingredients: Array<{
    key: string;
    name: string;
    setKey?: string;
    portionOneRatio?: number;
    preparation?: string;
    sizeValue?: number;
    sizeUnit?: string;
  }>;
  instructions: string[];
  instructionDetails: Array<{
    ingredientRefs: Array<string | { key: string; portionOrdinal: number }>;
    durationMinutes: number | null;
    temperature: { kind: string; value?: number; heat?: string } | null;
    photoKeys: string[];
  }>;
  photos: Array<{
    key: string;
    kind: 'gallery' | 'instruction';
    stepIndex: number | null;
    alignment: 'left' | 'center' | 'right' | null;
    width: number | null;
    crop: { left: number; top: number; width: number; height: number; rotation: number };
  }>;
};

type SyntheticFixture = {
  format: string;
  testAccounts: {
    primaryOwner: string;
    admin: string;
    neighbor: string;
    empty: string;
    neighborRecipeStates: Array<'tried' | 'want_to_try' | 'will_not_try'>;
  };
  publications: Array<{
    name: string;
    siteUrl: string;
    recipes: SyntheticRecipe[];
  }>;
};

const fixture = JSON.parse(
  readFileSync('tests/fixtures/recipe-box-synthetic-site-sample.json', 'utf8'),
) as SyntheticFixture;

describe('synthetic site sample fixture', () => {
  it('covers all recipes with metadata, ingredient references, and varied instructions', () => {
    const recipes = fixture.publications.flatMap((publication) => publication.recipes);
    expect(fixture.format).toBe('recipe-box-synthetic-site-sample/v6');
    expect(fixture.publications).toHaveLength(7);
    expect(recipes).toHaveLength(51);
    expect(recipes.filter((recipe) => recipe.state === 'tried')).toHaveLength(26);
    expect(recipes.filter((recipe) => recipe.state === 'want_to_try')).toHaveLength(17);
    expect(recipes.filter((recipe) => recipe.state === 'will_not_try')).toHaveLength(8);

    for (const recipe of recipes) {
      const ingredientKeys = new Set(recipe.ingredients.map((ingredient) => ingredient.key));
      const ingredientNamesBySet = new Set(
        recipe.ingredients.map((ingredient) => {
          const setKey = ingredient.setKey ?? recipe.ingredientSets?.[0]?.key ?? 'ingredients';
          return `${setKey}:${ingredient.name.normalize('NFKC').trim().toLocaleLowerCase()}`;
        }),
      );
      expect(ingredientNamesBySet.size).toBe(recipe.ingredients.length);
      expect(recipe.instructions).toHaveLength(recipe.instructionDetails.length);
      expect(recipe.instructionDetails.some((step) => step.durationMinutes !== null)).toBe(true);
      expect(recipe.instructionDetails.some((step) => step.temperature !== null)).toBe(true);
      const referencedKeys = new Set(
        recipe.instructionDetails.flatMap((step) =>
          step.ingredientRefs.map((reference) =>
            typeof reference === 'string' ? reference : reference.key,
          ),
        ),
      );
      expect(referencedKeys).toEqual(ingredientKeys);
      for (const [index, step] of recipe.instructionDetails.entries()) {
        for (const reference of step.ingredientRefs) {
          const key = typeof reference === 'string' ? reference : reference.key;
          expect(ingredientKeys.has(key)).toBe(true);
          if (typeof reference !== 'string') {
            expect([1, 2]).toContain(reference.portionOrdinal);
            expect(
              recipe.ingredients.find((ingredient) => ingredient.key === key)?.portionOneRatio,
            ).toBeGreaterThan(0);
            expect(
              recipe.ingredients.find((ingredient) => ingredient.key === key)?.portionOneRatio,
            ).toBeLessThan(1);
          }
          const ingredient = recipe.ingredients.find((entry) => entry.key === key);
          expect(recipe.instructions[index].toLocaleLowerCase()).toContain(
            ingredient?.name.toLocaleLowerCase(),
          );
        }
      }
      expect(recipe.opinion.verdict !== null).toBe(recipe.state === 'tried');
      expect(recipe.opinion.enthusiasm !== null).toBe(recipe.state === 'want_to_try');
      expect(recipe.opinion.reason !== null).toBe(recipe.state === 'will_not_try');
    }
  });

  it('includes Afterlight examples for repeated, divided, and cubed ingredients', () => {
    const afterlight = fixture.publications.find(
      (publication) => publication.name === 'Afterlight Kitchen',
    );
    expect(afterlight).toBeDefined();

    const gingerRice = afterlight?.recipes.find(
      (recipe) => recipe.slug === 'ginger-miso-mushroom-rice',
    );
    expect(gingerRice?.ingredientSets?.map((set) => set.label)).toEqual([
      'Mushroom rice',
      'Fresh finish',
    ]);
    expect(
      gingerRice?.ingredients
        .filter((ingredient) => ingredient.name === 'Ginger')
        .map((ingredient) => ({
          setKey: ingredient.setKey,
          portionOneRatio: ingredient.portionOneRatio,
        })),
    ).toEqual([
      { setKey: 'rice', portionOneRatio: undefined },
      { setKey: 'finish', portionOneRatio: undefined },
    ]);

    const flatbread = afterlight?.recipes.find(
      (recipe) => recipe.slug === 'crisp-chickpea-flatbread',
    );
    const thymeRows = flatbread?.ingredients.filter((ingredient) => ingredient.name === 'Thyme');
    expect(thymeRows?.map((ingredient) => ingredient.setKey)).toEqual(['batter', 'finish']);
    expect(thymeRows?.map((ingredient) => ingredient.portionOneRatio)).toEqual([0.5, 0.25]);
    for (const ingredient of thymeRows ?? []) {
      expect(
        flatbread?.instructionDetails
          .flatMap((step) =>
            step.ingredientRefs.filter(
              (reference) => typeof reference !== 'string' && reference.key === ingredient.key,
            ),
          )
          .map((reference) => (typeof reference === 'string' ? null : reference.portionOrdinal)),
      ).toContain(1);
      expect(
        flatbread?.instructionDetails
          .flatMap((step) =>
            step.ingredientRefs.filter(
              (reference) => typeof reference !== 'string' && reference.key === ingredient.key,
            ),
          )
          .map((reference) => (typeof reference === 'string' ? null : reference.portionOrdinal)),
      ).toContain(2);
    }

    const noodleSalad = afterlight?.recipes.find(
      (recipe) => recipe.slug === 'sesame-cucumber-noodle-salad',
    );
    expect(
      noodleSalad?.ingredients.find((ingredient) => ingredient.name === 'Rice Vinegar'),
    ).toMatchObject({ portionOneRatio: 0.5, preparation: 'divided' });
    expect(noodleSalad?.ingredients.find((ingredient) => ingredient.name === 'Tofu')).toMatchObject(
      {
        preparation: 'cubed',
        sizeValue: 1.5,
        sizeUnit: 'cm',
      },
    );
  });

  it('defines distinct local accounts for fixture ownership and isolation checks', () => {
    const accounts = [
      fixture.testAccounts.primaryOwner,
      fixture.testAccounts.admin,
      fixture.testAccounts.neighbor,
      fixture.testAccounts.empty,
    ];
    expect(new Set(accounts).size).toBe(accounts.length);
    expect(accounts.every((email) => email.endsWith('@example.test'))).toBe(true);
    expect(fixture.testAccounts.admin).toBe('synthetic-admin@example.test');
    expect(fixture.testAccounts.neighborRecipeStates).toEqual([
      'tried',
      'want_to_try',
      'will_not_try',
    ]);
  });

  it('preserves a sole local owner and prefers the dedicated fixture owner', () => {
    const existingOwner = { id: 'existing-owner', email: 'cook@local.test' };
    const syntheticOwner = {
      id: 'synthetic-owner',
      email: fixture.testAccounts.primaryOwner,
    };

    expect(findLocalOwner([existingOwner], fixture.testAccounts.primaryOwner)).toBe(existingOwner);
    expect(findLocalOwner([existingOwner, syntheticOwner], fixture.testAccounts.primaryOwner)).toBe(
      syntheticOwner,
    );
    expect(findLocalOwner([], fixture.testAccounts.primaryOwner)).toBeNull();
  });

  it('refuses to choose among multiple local owners without a fixture owner', () => {
    expect(() =>
      findLocalOwner(
        [
          { id: 'first-owner', email: 'first@local.test' },
          { id: 'second-owner', email: 'second@local.test' },
        ],
        fixture.testAccounts.primaryOwner,
      ),
    ).toThrow('Multiple non-test local accounts exist.');
  });

  it('gives every recipe a gallery photo and varied inline photo layouts', () => {
    const recipes = fixture.publications.flatMap((publication) => publication.recipes);
    const inlineAlignments = new Set<string>();
    const inlineWidths = new Set<number>();

    for (const recipe of recipes) {
      expect(recipe.photos.filter((photo) => photo.kind === 'gallery')).toHaveLength(1);
      expect(recipe.photos.some((photo) => photo.kind === 'instruction')).toBe(true);
      for (const photo of recipe.photos) {
        expect(photo.crop.left + photo.crop.width).toBeLessThanOrEqual(1);
        expect(photo.crop.top + photo.crop.height).toBeLessThanOrEqual(1);
        expect([0, 90, 180, 270]).toContain(photo.crop.rotation);
        if (photo.kind === 'instruction') {
          expect(photo.stepIndex).toBeGreaterThanOrEqual(0);
          expect(photo.width).toBeGreaterThan(0);
          inlineAlignments.add(photo.alignment ?? '');
          inlineWidths.add(photo.width ?? 0);
          expect(recipe.instructionDetails[photo.stepIndex ?? -1]?.photoKeys).toContain(photo.key);
        }
      }
    }

    expect(inlineAlignments.size).toBeGreaterThanOrEqual(3);
    expect(inlineWidths.size).toBeGreaterThan(1);
  });
});
