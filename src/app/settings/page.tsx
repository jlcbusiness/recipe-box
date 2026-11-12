import { redirect } from 'next/navigation';
import { normalizeHiddenRecipeColumns, normalizeRecipeColumnOrder } from '../../lib/explorer-state';
import type { PicklistCategory, TagOption } from '../../lib/recipes/data';
import {
  defaultInstructionEmphasis,
  isInstructionEmphasisColor,
} from '../../lib/recipes/instruction-emphasis';
import type { TemperatureSystem } from '../../lib/recipes/instruction-markdown';
import { isMeasurementSystemPreference } from '../../lib/recipes/measurement-rules';
import type { NutritionEquivalent, NutritionProfile } from '../../lib/recipes/nutrition-rules';
import { createClient } from '../../lib/supabase/server';
import { getAdminSettingsPanels } from '../admin/admin-settings-panels';
import {
  type IngredientCatalogEntry,
  IngredientCatalogManager,
  type IngredientEquivalentEntry,
  type IngredientNutritionEntry,
} from './ingredient-catalog-manager';
import {
  type IngredientDensityEntry,
  IngredientDensityManager,
} from './ingredient-density-manager';
import { RecipeColumnOrderManager } from './recipe-column-order-manager';
import { RecipePicklistManager } from './recipe-picklist-manager';
import { SettingsTabs } from './settings-tabs';
import { TagCatalogManager } from './tag-catalog-manager';
import { UnitPreferences } from './unit-preferences';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
  }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select(
      'is_admin, is_owner, volume_system, weight_system, temperature_system, ingredient_presentation, hand_preference, ingredient_color, temperature_color, duration_color, private_print_uses_colors, include_instruction_photos_in_private_print, repeat_ingredients_in_private_print, include_private_details_in_private_print, recipe_column_order, recipe_hidden_columns',
    )
    .eq('id', data.user.id)
    .maybeSingle();

  if (accountError || !account) {
    throw new Error('Unable to load account preferences.');
  }

  const adminPanels = account.is_admin
    ? await getAdminSettingsPanels({
        supabase,
        userId: data.user.id,
        currentIsOwner: account.is_owner,
      })
    : undefined;

  const [
    picklistsResult,
    revisionsResult,
    recipesResult,
    assignmentsResult,
    measurementsResult,
    recipeTimeEntriesResult,
    recipeIngredientsResult,
    ingredientCatalogResult,
    ingredientDensitiesResult,
    ingredientNutritionResult,
    ingredientEquivalentsResult,
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
    supabase.from('recipe_time_entries').select('recipe_id, time_type_id'),
    supabase.from('recipe_ingredients').select('id, recipe_id, ingredient_id'),
    supabase.from('ingredients').select('id, name').order('name'),
    supabase
      .from('ingredient_densities')
      .select('ingredient_id, volume_amount, volume_unit_code, weight_amount, weight_unit_code'),
    supabase
      .from('ingredient_nutrition_profiles')
      .select(
        'ingredient_id, serving_size_amount, serving_size_dimension, serving_size_unit_code, nutrients',
      ),
    supabase
      .from('ingredient_measure_equivalents')
      .select(
        'ingredient_id, measurement_type, picklist_value_id, picklist_value, volume_amount, volume_unit_code, weight_amount, weight_unit_code',
      ),
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
    recipeTimeEntriesResult.error ||
    recipeIngredientsResult.error ||
    ingredientCatalogResult.error ||
    ingredientDensitiesResult.error ||
    ingredientNutritionResult.error ||
    ingredientEquivalentsResult.error ||
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
  for (const entry of recipeTimeEntriesResult.data ?? []) {
    addRecipeReference(entry.time_type_id, entry.recipe_id);
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
  const nutritionEntries = (ingredientNutritionResult.data ?? []).map(
    (profile): IngredientNutritionEntry => ({
      ingredient_id: profile.ingredient_id,
      profile: {
        servingSize: {
          amount: Number(profile.serving_size_amount),
          dimension: profile.serving_size_dimension as 'volume' | 'weight',
          unitCode: profile.serving_size_unit_code,
        },
        nutrients: profile.nutrients as NutritionProfile['nutrients'],
      },
    }),
  );
  const equivalentEntries = (ingredientEquivalentsResult.data ?? []).map(
    (equivalent): IngredientEquivalentEntry => ({
      ingredient_id: equivalent.ingredient_id,
      equivalent: {
        measurementType: equivalent.measurement_type as NutritionEquivalent['measurementType'],
        picklistValueId: equivalent.picklist_value_id,
        picklistValue: equivalent.picklist_value,
        volume:
          equivalent.volume_amount === null
            ? null
            : {
                amount: Number(equivalent.volume_amount),
                unitCode: equivalent.volume_unit_code,
              },
        weight:
          equivalent.weight_amount === null
            ? null
            : {
                amount: Number(equivalent.weight_amount),
                unitCode: equivalent.weight_unit_code,
              },
      },
    }),
  );
  const thingsOptions = (picklistsResult.data ?? [])
    .filter((value) => value.category === 'informal_unit')
    .map((value) => ({ id: value.id, label: value.display_value }));
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
      <SettingsTabs
        initialTab={query.tab}
        preferences={
          <>
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
                includePrivateDetailsInPrivatePrint={
                  account.include_private_details_in_private_print === true
                }
                ingredientColor={
                  isInstructionEmphasisColor(account.ingredient_color)
                    ? account.ingredient_color
                    : defaultInstructionEmphasis.ingredient
                }
                ingredientPresentation={
                  account.ingredient_presentation === 'ingredient_first'
                    ? 'ingredient_first'
                    : 'standard'
                }
                privatePrintUsesColors={account.private_print_uses_colors !== false}
                repeatIngredientsInPrivatePrint={
                  account.repeat_ingredients_in_private_print !== false
                }
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
                volumeSystem={
                  isMeasurementSystemPreference(account.volume_system)
                    ? account.volume_system
                    : 'us_customary'
                }
                weightSystem={
                  isMeasurementSystemPreference(account.weight_system)
                    ? account.weight_system
                    : 'us_customary'
                }
              />
            </section>
            <RecipeColumnOrderManager
              initialHiddenColumns={normalizeHiddenRecipeColumns(account.recipe_hidden_columns)}
              initialOrder={normalizeRecipeColumnOrder(account.recipe_column_order)}
            />
          </>
        }
        recipeData={
          <>
            <RecipePicklistManager
              initialValues={picklistsResult.data ?? []}
              initialRevisions={revisions}
              referenceCounts={referenceCounts}
            />
            <IngredientCatalogManager
              initialIngredients={(ingredientCatalogResult.data ?? []) as IngredientCatalogEntry[]}
              initialRevision={ingredientCatalogRevisionResult.data.revision}
              referenceCounts={ingredientReferenceCounts}
              initialNutrition={nutritionEntries}
              initialEquivalents={equivalentEntries}
              thingOptions={thingsOptions}
            />
            <IngredientDensityManager
              initialIngredients={(ingredientCatalogResult.data ?? []) as IngredientCatalogEntry[]}
              initialDensities={densityEntries}
              initialRevision={ingredientCatalogRevisionResult.data.revision}
            />
            <TagCatalogManager
              initialTags={(tagsResult.data ?? []) as TagOption[]}
              initialRevision={tagCatalogRevisionResult.data.revision}
              referenceCounts={tagReferenceCounts}
            />
          </>
        }
        adminPanels={adminPanels}
      />
    </main>
  );
}
