import { redirect } from 'next/navigation';
import { normalizeHiddenRecipeColumns, normalizeRecipeColumnOrder } from '../../lib/explorer-state';
import { isDatabaseExportReminderDue } from '../../lib/exports/rules';
import type { PicklistCategory, TagOption } from '../../lib/recipes/data';
import {
  defaultInstructionEmphasis,
  isInstructionEmphasisColor,
} from '../../lib/recipes/instruction-emphasis';
import type { TemperatureSystem } from '../../lib/recipes/instruction-markdown';
import type { MeasurementSystem } from '../../lib/recipes/measurement-rules';
import { createClient } from '../../lib/supabase/server';
import { ExportAction } from '../export-action';
import { DatabaseImportAction } from './database-import-action';
import {
  type IngredientCatalogEntry,
  IngredientCatalogManager,
} from './ingredient-catalog-manager';
import {
  type IngredientDensityEntry,
  IngredientDensityManager,
} from './ingredient-density-manager';
import { RecipeColumnOrderManager } from './recipe-column-order-manager';
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
    .select(
      'volume_system, weight_system, temperature_system, ingredient_presentation, hand_preference, ingredient_color, temperature_color, duration_color, private_print_uses_colors, include_instruction_photos_in_private_print, recipe_column_order, recipe_hidden_columns, last_database_export_at',
    )
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
    ingredientDensitiesResult,
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
    supabase
      .from('ingredient_densities')
      .select('ingredient_id, volume_amount, volume_unit_code, weight_amount, weight_unit_code'),
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
    ingredientDensitiesResult.error ||
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
  const ingredientNames = new Map(
    (ingredientCatalogResult.data ?? []).map((ingredient) => [ingredient.id, ingredient.name]),
  );
  const densityEntries = (ingredientDensitiesResult.data ?? []).flatMap((density) => {
    const ingredientName = ingredientNames.get(density.ingredient_id);
    if (!ingredientName) return [];
    return [
      {
        ...density,
        ingredient_name: ingredientName,
        volume_amount: Number(density.volume_amount),
        weight_amount: Number(density.weight_amount),
      },
    ];
  }) as IngredientDensityEntry[];
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
        <UnitPreferences
          durationColor={
            isInstructionEmphasisColor(account.duration_color)
              ? account.duration_color
              : defaultInstructionEmphasis.duration
          }
          handPreference={account.hand_preference === 'left' ? 'left' : 'right'}
          includeInstructionPhotosInPrivatePrint={
            account.include_instruction_photos_in_private_print !== false
          }
          ingredientColor={
            isInstructionEmphasisColor(account.ingredient_color)
              ? account.ingredient_color
              : defaultInstructionEmphasis.ingredient
          }
          ingredientPresentation={
            account.ingredient_presentation === 'ingredient_first' ? 'ingredient_first' : 'standard'
          }
          privatePrintUsesColors={account.private_print_uses_colors !== false}
          temperatureColor={
            isInstructionEmphasisColor(account.temperature_color)
              ? account.temperature_color
              : defaultInstructionEmphasis.temperature
          }
          temperatureSystem={
            (account.temperature_system === 'celsius'
              ? 'celsius'
              : 'fahrenheit') as TemperatureSystem
          }
          volumeSystem={account.volume_system as MeasurementSystem}
          weightSystem={account.weight_system as MeasurementSystem}
        />
      </section>
      <RecipePicklistManager
        initialValues={picklistsResult.data ?? []}
        initialRevisions={revisions}
        referenceCounts={referenceCounts}
      />
      <RecipeColumnOrderManager
        initialHiddenColumns={normalizeHiddenRecipeColumns(account.recipe_hidden_columns)}
        initialOrder={normalizeRecipeColumnOrder(account.recipe_column_order)}
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
      <IngredientDensityManager
        initialIngredients={(ingredientCatalogResult.data ?? []) as IngredientCatalogEntry[]}
        initialDensities={densityEntries}
        initialRevision={ingredientCatalogRevisionResult.data.revision}
      />
      <section
        aria-labelledby="data-management-title"
        className="settings-section settings-data-management"
      >
        <div className="settings-data-management-heading">
          <h2 id="data-management-title">Data management</h2>
          <p>
            {account.last_database_export_at
              ? `Last database export: ${new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(account.last_database_export_at))}`
              : 'No database export yet'}
          </p>
        </div>
        {isDatabaseExportReminderDue(account.last_database_export_at) && (
          <p className="settings-export-reminder" role="note">
            Make a database export now. Your backup reminder appears every 30 days.
          </p>
        )}
        <div className="settings-data-management-content">
          <ExportAction buttonLabel="Export database" scope={{ type: 'database' }} />
          <DatabaseImportAction />
        </div>
      </section>
    </main>
  );
}
