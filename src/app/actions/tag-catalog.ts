'use server';

import { revalidatePath } from 'next/cache';
import type { TagOption } from '../../lib/recipes/data';
import { type TagColorKey, tagColorMeta } from '../../lib/recipes/tag-colors';
import { createClient } from '../../lib/supabase/server';

export type TagCatalogActionState = {
  status?: 'saved' | 'conflict' | 'error';
  message?: string;
  revision?: number;
};

export type TagCreateResult = {
  tag?: TagOption;
  created?: boolean;
  error?: string;
};

const actions = new Set(['add', 'rename', 'merge', 'delete']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const colorKeys = new Set(Object.keys(tagColorMeta));

function getUuid(formData: FormData, name: string): string | null | undefined {
  const value = formData.get(name);
  if (value === null || value === '') return null;
  return typeof value === 'string' && uuidPattern.test(value) ? value : undefined;
}

export async function manageTagCatalog(
  _previousState: TagCatalogActionState,
  formData: FormData,
): Promise<TagCatalogActionState> {
  const action = formData.get('action');
  const revisionValue = formData.get('revision');
  const revision = typeof revisionValue === 'string' ? Number(revisionValue) : NaN;
  const tagId = getUuid(formData, 'tag_id');
  const replacementId = getUuid(formData, 'replacement_id');
  const nameEntry = formData.get('name');
  const name = typeof nameEntry === 'string' ? nameEntry : null;

  if (
    typeof action !== 'string' ||
    !actions.has(action) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    tagId === undefined ||
    replacementId === undefined ||
    ((action === 'add' || action === 'rename') && (!name?.trim() || name.trim().length > 160)) ||
    ((action === 'rename' || action === 'merge' || action === 'delete') && tagId === null) ||
    (action === 'merge' && (!replacementId || replacementId === tagId)) ||
    (action === 'delete' && replacementId === tagId)
  ) {
    return { status: 'error', message: 'Choose a valid tag catalog change.' };
  }

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return { status: 'error', message: 'Sign in to manage tags.' };
  }

  if (action === 'add') {
    const { data, error } = await supabase.rpc('create_or_get_tag', {
      p_name: name?.trim() ?? '',
      p_expected_revision: revision,
    });
    if (error?.code === '40001') {
      return {
        status: 'conflict',
        message: 'The tag catalog changed in another session. The latest values are loading.',
      };
    }
    if (error?.code === '23505') {
      return { status: 'error', message: 'A tag with that name already exists.' };
    }
    if (error?.code === '23514') {
      return { status: 'error', message: error.message };
    }
    if (error || !data || typeof data !== 'object') {
      return { status: 'error', message: 'Tag catalog could not be updated.' };
    }
    const result = data as { created?: boolean; revision?: number };
    if (!result.created) {
      return { status: 'error', message: 'A tag with that name already exists.' };
    }
    revalidatePath('/settings');
    revalidatePath('/recipes');
    revalidatePath('/recipes/[id]', 'page');
    revalidatePath('/publications');
    revalidatePath('/publications/[id]', 'page');
    return {
      status: 'saved',
      message: 'Tag added.',
      revision: result.revision ?? revision + 1,
    };
  }

  const { data: nextRevision, error } = await supabase.rpc('manage_tag_catalog', {
    p_action: action,
    p_expected_revision: revision,
    p_tag_id: tagId,
    p_name: name,
    p_replacement_id: replacementId,
  });

  if (error?.code === '40001') {
    return {
      status: 'conflict',
      message: 'The tag catalog changed in another session. The latest values are loading.',
    };
  }
  if (error?.code === '23505') {
    return { status: 'error', message: 'A tag with that name already exists.' };
  }
  if (error?.code === '23514') {
    return { status: 'error', message: error.message };
  }
  if (error) {
    return { status: 'error', message: 'Tag catalog could not be updated.' };
  }

  revalidatePath('/settings');
  revalidatePath('/recipes');
  revalidatePath('/recipes/[id]', 'page');
  revalidatePath('/publications');
  revalidatePath('/publications/[id]', 'page');
  return {
    status: 'saved',
    message: 'Tag catalog updated.',
    revision: typeof nextRevision === 'number' ? nextRevision : revision + 1,
  };
}

export async function createOrGetTag(name: string): Promise<TagCreateResult> {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 160) {
    return { error: 'Tag names must contain 1 to 160 characters.' };
  }

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return { error: 'Sign in before adding a tag.' };
  }

  const { data, error } = await supabase.rpc('create_or_get_tag', {
    p_name: normalizedName,
    p_expected_revision: null,
  });
  if (error?.code === '23514') return { error: error.message };
  if (error || !data || typeof data !== 'object') {
    return { error: 'Tag could not be added. Try again.' };
  }

  const result = data as {
    id?: string;
    name?: string;
    color_key?: string;
    created?: boolean;
  };
  if (
    !result.id ||
    !result.name ||
    typeof result.color_key !== 'string' ||
    !colorKeys.has(result.color_key)
  ) {
    return { error: 'Tag could not be added. Try again.' };
  }

  revalidatePath('/settings');
  return {
    tag: {
      id: result.id,
      name: result.name,
      color_key: result.color_key as TagColorKey,
    },
    created: result.created === true,
  };
}

export async function setTagColor(
  tagId: string,
  colorKey: TagColorKey,
  revision: number,
): Promise<TagCatalogActionState> {
  if (!uuidPattern.test(tagId) || !colorKeys.has(colorKey) || !Number.isSafeInteger(revision)) {
    return { status: 'error', message: 'Choose a valid tag color.' };
  }

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return { status: 'error', message: 'Sign in to manage tags.' };
  }

  const { data, error } = await supabase.rpc('set_tag_color', {
    p_tag_id: tagId,
    p_color_key: colorKey,
    p_expected_revision: revision,
  });
  if (error?.code === '40001') {
    return {
      status: 'conflict',
      message: 'The tag catalog changed in another session. The latest values are loading.',
    };
  }
  if (error?.code === '23514') return { status: 'error', message: error.message };
  if (error || typeof data !== 'number') {
    return { status: 'error', message: 'Tag color could not be updated.' };
  }

  revalidatePath('/settings');
  revalidatePath('/recipes');
  revalidatePath('/recipes/[id]', 'page');
  revalidatePath('/publications');
  revalidatePath('/publications/[id]', 'page');
  return { status: 'saved', revision: data };
}
