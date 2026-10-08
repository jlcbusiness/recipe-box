'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { normalizeHttpUrl } from '../../lib/publications/validation';
import type { RecipeState } from '../../lib/recipes/data';
import type { IngredientRowPayload } from '../../lib/recipes/ingredient-rules';
import {
  type InstructionStepDraft,
  type InstructionStepPayload,
  instructionPlainText,
  serializeInstructionSteps,
} from '../../lib/recipes/instruction-rules';
import { createClient } from '../../lib/supabase/server';

export type RecipeActionState = {
  error?: string;
};

type RecipeRelationshipsPayload = {
  site_listing: null;
  pairings: { id: string; display_text: string; linked_recipe_id: string | null }[];
  references: {
    id: string;
    reference_type: 'recipe' | 'publication' | 'external_url' | 'printed_citation';
    display_text: string;
    linked_recipe_id: string | null;
    publication_id: string | null;
    url: string | null;
  }[];
};

function formText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function optionalId(formData: FormData, name: string): string | null {
  return formText(formData, name) || null;
}

function optionalInteger(formData: FormData, name: string): number | null | undefined {
  const raw = formText(formData, name);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function selectedIds(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter(Boolean);
}

function parseRecipeRelationships(formData: FormData): RecipeRelationshipsPayload | null {
  const raw = formData.get('recipe_relationships');
  if (typeof raw !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const value = parsed as Record<string, unknown>;
    if (!Array.isArray(value.pairings) || !Array.isArray(value.references)) {
      return null;
    }
    if (value.site_listing !== null) {
      return null;
    }

    const pairings = value.pairings.map(
      (entry): RecipeRelationshipsPayload['pairings'][number] | null => {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }
        const pairing = entry as Record<string, unknown>;
        if (
          typeof pairing.id !== 'string' ||
          typeof pairing.display_text !== 'string' ||
          (pairing.linked_recipe_id !== null && typeof pairing.linked_recipe_id !== 'string')
        ) {
          return null;
        }
        return {
          id: pairing.id,
          display_text: pairing.display_text,
          linked_recipe_id: pairing.linked_recipe_id,
        };
      },
    );
    if (pairings.some((entry) => entry === null)) {
      return null;
    }

    const references = value.references.map(
      (entry): RecipeRelationshipsPayload['references'][number] | null => {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }
        const reference = entry as Record<string, unknown>;
        if (
          typeof reference.id !== 'string' ||
          !['recipe', 'publication', 'external_url', 'printed_citation'].includes(
            String(reference.reference_type),
          ) ||
          typeof reference.display_text !== 'string' ||
          (reference.linked_recipe_id !== null && typeof reference.linked_recipe_id !== 'string') ||
          (reference.publication_id !== null && typeof reference.publication_id !== 'string') ||
          (reference.url !== null && typeof reference.url !== 'string')
        ) {
          return null;
        }
        const url = reference.url ? normalizeHttpUrl(reference.url) : null;
        if (reference.reference_type === 'external_url' && !url) {
          return null;
        }
        return {
          id: reference.id,
          reference_type:
            reference.reference_type as RecipeRelationshipsPayload['references'][number]['reference_type'],
          display_text:
            reference.reference_type === 'external_url' ? (url ?? '') : reference.display_text,
          linked_recipe_id: reference.linked_recipe_id,
          publication_id: reference.publication_id,
          url,
        };
      },
    );
    if (references.some((entry) => entry === null)) {
      return null;
    }

    return {
      site_listing: null,
      pairings: pairings as RecipeRelationshipsPayload['pairings'],
      references: references as RecipeRelationshipsPayload['references'],
    };
  } catch {
    return null;
  }
}

function parseIngredientRows(formData: FormData): IngredientRowPayload[] | null {
  const raw = formData.get('ingredient_rows');
  if (typeof raw !== 'string') {
    return null;
  }

  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) {
      return null;
    }

    return rows.every(
      (row) =>
        row !== null &&
        typeof row === 'object' &&
        typeof row.recipe_ingredient_id === 'string' &&
        (row.ingredient_id === null || typeof row.ingredient_id === 'string') &&
        (row.ingredient_name === null || typeof row.ingredient_name === 'string') &&
        typeof row.is_main === 'boolean' &&
        typeof row.detail === 'string' &&
        typeof row.preparation === 'string',
    )
      ? (rows as IngredientRowPayload[])
      : null;
  } catch {
    return null;
  }
}

function parseInstructionSteps(
  formData: FormData,
  ingredientRows: IngredientRowPayload[],
): InstructionStepPayload[] | null {
  const raw = formData.get('instruction_steps');
  if (typeof raw !== 'string') {
    return null;
  }

  try {
    const steps: unknown = JSON.parse(raw);
    if (!Array.isArray(steps)) {
      return null;
    }

    const drafts: InstructionStepDraft[] = [];
    for (const [index, value] of steps.entries()) {
      if (value === null || typeof value !== 'object') {
        return null;
      }
      const step = value as Record<string, unknown>;
      if (
        Object.keys(step).some(
          (key) => !['id', 'position', 'content_markdown', 'plain_text'].includes(key),
        ) ||
        typeof step.id !== 'string' ||
        step.position !== index ||
        typeof step.content_markdown !== 'string' ||
        typeof step.plain_text !== 'string'
      ) {
        return null;
      }

      drafts.push({
        id: step.id,
        markdown: step.content_markdown,
        plainText: instructionPlainText(step.content_markdown),
      });
    }

    return serializeInstructionSteps(
      drafts,
      ingredientRows.map((row) => row.recipe_ingredient_id),
    );
  } catch {
    return null;
  }
}

export async function saveRecipe(
  _previousState: RecipeActionState | undefined,
  formData: FormData,
): Promise<RecipeActionState> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { error: 'Sign in before saving a recipe.' };
  }

  const name = formText(formData, 'name');
  const state = formText(formData, 'state');
  if (!name) {
    return { error: 'Enter a recipe name.' };
  }
  if (!['want_to_try', 'tried', 'will_not_try'].includes(state)) {
    return { error: 'Choose a State before saving.' };
  }
  const ingredientRows = parseIngredientRows(formData);
  if (!ingredientRows) {
    return { error: 'Check the ingredient rows before saving.' };
  }
  const instructionSteps = parseInstructionSteps(formData, ingredientRows);
  if (!instructionSteps) {
    return { error: 'Check the instruction steps before saving.' };
  }
  const relationships = parseRecipeRelationships(formData);
  if (!relationships) {
    return { error: 'Check the Pairs With and References fields before saving.' };
  }

  const timeFields = [
    'prep_time_minutes',
    'mixing_time_minutes',
    'marinate_time_minutes',
    'chill_time_minutes',
    'freeze_time_minutes',
    'cook_time_minutes',
    'bake_time_minutes',
    'cooling_time_minutes',
    'rest_time_minutes',
    'total_time_minutes',
  ] as const;
  const times = Object.fromEntries(
    timeFields.map((field) => [field, optionalInteger(formData, field)]),
  );
  if (Object.values(times).some((value) => value === undefined)) {
    return { error: 'Time values must be whole minutes greater than or equal to zero.' };
  }

  const servesText = formText(formData, 'serves');
  const serves = servesText ? Number(servesText) : null;
  if (serves !== null && (!Number.isSafeInteger(serves) || serves <= 0)) {
    return { error: 'Serves must be a whole number greater than zero.' };
  }

  const recipeId = optionalId(formData, 'recipe_id');
  const expectedVersionText = formText(formData, 'expected_version');
  const expectedVersion = expectedVersionText ? Number(expectedVersionText) : null;
  if (
    recipeId &&
    (expectedVersion === null || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
  ) {
    return { error: 'Reload this recipe before saving.' };
  }

  const recipeUrlValue = formText(formData, 'recipe_url');
  const recipeUrl = recipeUrlValue ? normalizeHttpUrl(recipeUrlValue) : null;
  if (recipeUrlValue && !recipeUrl) {
    return { error: 'Enter a valid HTTP(S) URL.' };
  }

  const { data, error } = await supabase.rpc('save_recipe_with_relationships', {
    p_recipe_id: recipeId,
    p_expected_version: expectedVersion,
    p_name: name,
    p_food_type_id: optionalId(formData, 'food_type_id'),
    p_state: state as RecipeState,
    p_verdict_id: optionalId(formData, 'verdict_id'),
    p_enthusiasm_id: optionalId(formData, 'enthusiasm_id'),
    p_occasion_details: formText(formData, 'occasion_details') || null,
    p_reason: formText(formData, 'reason') || null,
    p_serves: serves,
    p_prep_time_minutes: times.prep_time_minutes,
    p_mixing_time_minutes: times.mixing_time_minutes,
    p_marinate_time_minutes: times.marinate_time_minutes,
    p_chill_time_minutes: times.chill_time_minutes,
    p_freeze_time_minutes: times.freeze_time_minutes,
    p_cook_time_minutes: times.cook_time_minutes,
    p_bake_time_minutes: times.bake_time_minutes,
    p_cooling_time_minutes: times.cooling_time_minutes,
    p_rest_time_minutes: times.rest_time_minutes,
    p_total_time_minutes: times.total_time_minutes,
    p_notes_markdown: String(formData.get('notes_markdown') ?? ''),
    p_meal_type_ids: selectedIds(formData, 'meal_type_ids'),
    p_cuisine_ids: selectedIds(formData, 'cuisine_ids'),
    p_equipment_ids: selectedIds(formData, 'equipment_ids'),
    p_ingredient_rows: ingredientRows,
    p_instruction_steps: instructionSteps,
    p_publication_id: optionalId(formData, 'publication_id'),
    p_publication_page: formText(formData, 'publication_page') || null,
    p_recipe_url: recipeUrl,
    p_recipe_relationships: relationships,
  });

  if (error) {
    if (error.code === '40001') {
      return { error: 'This recipe changed in another session. Reload before saving again.' };
    }
    if (error.code === 'P0002') {
      return { error: 'This recipe is no longer available.' };
    }
    return { error: 'Unable to save this recipe. Check the selected options and try again.' };
  }

  const savedRecipe = Array.isArray(data) ? data[0] : data;
  if (!savedRecipe?.id) {
    return { error: 'Unable to confirm the recipe save. Reload before continuing.' };
  }

  revalidatePath('/recipes');
  revalidatePath(`/recipes/${savedRecipe.id}`);
  revalidatePath('/publications');
  for (const pairing of relationships.pairings) {
    if (pairing.linked_recipe_id) {
      revalidatePath(`/recipes/${pairing.linked_recipe_id}`);
    }
  }
  redirect(`/recipes/${savedRecipe.id}`);
}

export async function trashRecipe(formData: FormData): Promise<void> {
  const recipeId = formText(formData, 'recipe_id');
  const expectedVersion = Number(formText(formData, 'expected_version'));
  if (!recipeId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    redirect('/recipes?status=conflict');
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect('/');
  }

  const { error } = await supabase.rpc('trash_recipe', {
    p_recipe_id: recipeId,
    p_expected_version: expectedVersion,
  });
  if (error) {
    redirect(
      error.code === '40001' || error.code === '55000'
        ? '/recipes?status=conflict'
        : '/recipes?status=error',
    );
  }

  revalidatePath('/recipes');
  revalidatePath('/recipes/trash');
  revalidatePath(`/recipes/${recipeId}`);
  redirect('/recipes?status=trashed');
}

export async function restoreRecipe(formData: FormData): Promise<void> {
  const recipeId = formText(formData, 'recipe_id');
  const expectedVersion = Number(formText(formData, 'expected_version'));
  if (!recipeId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    redirect('/recipes/trash?status=conflict');
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect('/');
  }

  const { error } = await supabase.rpc('restore_recipe', {
    p_recipe_id: recipeId,
    p_expected_version: expectedVersion,
  });
  if (error) {
    redirect('/recipes/trash?status=conflict');
  }

  revalidatePath('/recipes');
  revalidatePath('/recipes/trash');
  revalidatePath(`/recipes/${recipeId}`);
  redirect(`/recipes/${recipeId}`);
}
