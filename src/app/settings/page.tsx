import { redirect } from 'next/navigation';
import type { PicklistCategory, TagOption } from '../../lib/recipes/data';
import type { MeasurementSystem } from '../../lib/recipes/measurement-rules';
import { createClient } from '../../lib/supabase/server';
import {
  type IngredientCatalogEntry,
  IngredientCatalogManager,
} from './ingredient-catalog-manager';
import { RecipePicklistManager } from './recipe-picklist-manager';
import { TagCatalogManager } from './tag-catalog-manager';
import { UnitPreferences } from './unit-preferences';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('volume_system, weight_system')
    .eq('id', data.user.id)
    .maybeSingle();

  if (accountError || !account) {
    throw new Error('Unable to load account preferences.');
  }

  const [
    picklistsResult,
    revisionsResult,
    recipesResult,
    assignmentsResult,
    measurementsResult,
    recipeIngredientsResult,
    ingredientCatalogResult,
    ingredientCatalogRevisionResult,
    tagsResult,
    tagCatalogRevisionResult,
    recipeTagAssignmentsResult,
    publicationTagAssignmentsResult,
  ] = await Promise.all([
    supabase
      .from('recipe_picklist_values')
      .select('id, category, value, display_value, sort_order, is_protected')
      .order('category')
      .order('sort_order'),
    supabase.from('recipe_picklist_revisions').select('category, revision'),
    supabase.from('recipes').select('id, food_type_id, verdict_id, enthusiasm_id'),
    supabase.from('recipe_picklist_assignments').select('recipe_id, picklist_value_id'),
    supabase
      .from('recipe_ingredient_measurements')
      .select('recipe_ingredient_id, picklist_value_id')
      .not('picklist_value_id', 'is', null),
    supabase.from('recipe_ingredients').select('id, recipe_id, ingredient_id'),
    supabase.from('ingredients').select('id, name').order('name'),
    supabase.from('ingredient_catalog_revisions').select('revision').maybeSingle(),
    supabase.from('tags').select('id, name, color_key').order('name'),
    supabase.from('tag_catalog_revisions').select('revision').maybeSingle(),
    supabase.from('recipe_tags').select('tag_id, recipe_id'),
    supabase.from('publication_tags').select('tag_id, publication_id'),
  ]);

  if (
    picklistsResult.error ||
    revisionsResult.error ||
    recipesResult.error ||
    assignmentsResult.error ||
    measurementsResult.error ||
    recipeIngredientsResult.error ||
    ingredientCatalogResult.error ||
    ingredientCatalogRevisionResult.error ||
    !ingredientCatalogRevisionResult.data ||
    tagsResult.error ||
    tagCatalogRevisionResult.error ||
    !tagCatalogRevisionResult.data ||
    recipeTagAssignmentsResult.error ||
    publicationTagAssignmentsResult.error
  ) {
    throw new Error('Unable to load Settings data.');
  }

  const referenceRecipes = new Map<string, Set<string>>();
  const measurementCounts = new Map<string, number>();
  function addRecipeReference(valueId: string | null, recipeId: string) {
    if (!valueId) return;
    const recipeIds = referenceRecipes.get(valueId) ?? new Set<string>();
    recipeIds.add(recipeId);
    referenceRecipes.set(valueId, recipeIds);
  }

  for (const recipe of recipesResult.data ?? []) {
    addRecipeReference(recipe.food_type_id, recipe.id);
    addRecipeReference(recipe.verdict_id, recipe.id);
    addRecipeReference(recipe.enthusiasm_id, recipe.id);
  }
  for (const assignment of assignmentsResult.data ?? []) {
    addRecipeReference(assignment.picklist_value_id, assignment.recipe_id);
  }
  const recipeIdByIngredientId = new Map(
    (recipeIngredientsResult.data ?? []).map((ingredient) => [ingredient.id, ingredient.recipe_id]),
  );
  for (const measurement of measurementsResult.data ?? []) {
    const valueId = measurement.picklist_value_id;
    const recipeId = recipeIdByIngredientId.get(measurement.recipe_ingredient_id);
    if (valueId && recipeId) {
      addRecipeReference(valueId, recipeId);
      measurementCounts.set(valueId, (measurementCounts.get(valueId) ?? 0) + 1);
    }
  }

  const referenceCounts = Object.fromEntries(
    (picklistsResult.data ?? []).map((value) => [
      value.id,
      {
        recipes: referenceRecipes.get(value.id)?.size ?? 0,
        measurements: measurementCounts.get(value.id) ?? 0,
      },
    ]),
  );
  const revisions = Object.fromEntries(
    (revisionsResult.data ?? []).map((item) => [item.category, item.revision]),
  ) as Partial<Record<PicklistCategory, number>>;
  const ingredientRecipes = new Map<string, Set<string>>();
  for (const row of recipeIngredientsResult.data ?? []) {
    const recipes = ingredientRecipes.get(row.ingredient_id) ?? new Set<string>();
    recipes.add(row.recipe_id);
    ingredientRecipes.set(row.ingredient_id, recipes);
  }
  const ingredientReferenceCounts = Object.fromEntries(
    (ingredientCatalogResult.data ?? []).map((ingredient) => [
      ingredient.id,
      ingredientRecipes.get(ingredient.id)?.size ?? 0,
    ]),
  );
  const tagReferenceCounts = Object.fromEntries(
    (tagsResult.data ?? []).map((tag) => [
      tag.id,
      {
        recipes: (recipeTagAssignmentsResult.data ?? []).filter(
          (assignment) => assignment.tag_id === tag.id,
        ).length,
        publications: (publicationTagAssignmentsResult.data ?? []).filter(
          (assignment) => assignment.tag_id === tag.id,
        ).length,
      },
    ]),
  );

  return (
    <main aria-labelledby="page-title" className="settings-main">
      <h1 id="page-title">Settings</h1>
      <section aria-labelledby="personal-preferences-title" className="settings-section">
        <h2 id="personal-preferences-title">Personal preferences</h2>
        <div className="settings-preference-group">
          <h3 id="units-title">Units</h3>
          <UnitPreferences
            volumeSystem={account.volume_system as MeasurementSystem}
            weightSystem={account.weight_system as MeasurementSystem}
          />
        </div>
      </section>
      <RecipePicklistManager
        initialValues={picklistsResult.data ?? []}
        initialRevisions={revisions}
        referenceCounts={referenceCounts}
      />
      <IngredientCatalogManager
        initialIngredients={(ingredientCatalogResult.data ?? []) as IngredientCatalogEntry[]}
        initialRevision={ingredientCatalogRevisionResult.data.revision}
        referenceCounts={ingredientReferenceCounts}
      />
      <TagCatalogManager
        initialTags={(tagsResult.data ?? []) as TagOption[]}
        initialRevision={tagCatalogRevisionResult.data.revision}
        referenceCounts={tagReferenceCounts}
      />
    </main>
  );
}
