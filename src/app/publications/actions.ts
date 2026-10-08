'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { normalizeHttpUrl, normalizeIsbn } from '../../lib/publications/validation';
import type { PublicationOption } from '../../lib/recipes/data';
import { createClient } from '../../lib/supabase/server';

export type PublicationActionState = {
  error?: string;
  publication?: PublicationOption;
};

function formText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function optionalText(formData: FormData, name: string): string | null {
  return formText(formData, name) || null;
}

export async function createPublication(
  _previousState: PublicationActionState | undefined,
  formData: FormData,
): Promise<PublicationActionState> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { error: 'Sign in before creating a publication.' };
  }

  const name = formText(formData, 'name');
  const publicationType = formText(formData, 'publication_type');
  const author = publicationType === 'book' ? optionalText(formData, 'author') : null;
  const edition = publicationType === 'book' ? optionalText(formData, 'edition') : null;
  const isbnValue = publicationType === 'book' ? optionalText(formData, 'isbn') : null;
  const isbn = isbnValue ? normalizeIsbn(isbnValue) : null;
  const retailerUrlValue =
    publicationType === 'book' ? optionalText(formData, 'retailer_url') : null;
  const retailerUrl = retailerUrlValue ? normalizeHttpUrl(retailerUrlValue) : null;
  const siteUrlValue = publicationType === 'site' ? formText(formData, 'site_url') : null;
  const siteUrl = siteUrlValue ? normalizeHttpUrl(siteUrlValue) : null;

  if (!name) {
    return { error: 'Enter a publication name.' };
  }
  if (!['book', 'magazine', 'site'].includes(publicationType)) {
    return { error: 'Choose a publication type.' };
  }
  if (publicationType === 'site' && !siteUrl) {
    return { error: 'Enter the Site URL.' };
  }
  if (isbnValue && !isbn) {
    return { error: 'Enter a valid ISBN-10 or ISBN-13.' };
  }
  if (retailerUrlValue && !retailerUrl) {
    return { error: 'Enter a valid HTTP(S) Retailer URL.' };
  }
  if (siteUrlValue && !siteUrl) {
    return { error: 'Enter a valid HTTP(S) Site URL.' };
  }

  const { data, error } = await supabase.rpc('create_publication', {
    p_name: name,
    p_publication_type: publicationType,
    p_author: author,
    p_edition: edition,
    p_isbn: isbn,
    p_retailer_url: retailerUrl,
    p_issue: null,
    p_site_url: siteUrl,
  });

  if (error?.code === '23505' && publicationType === 'magazine') {
    return { error: 'A Magazine with this title already exists.' };
  }
  if (error || typeof data !== 'string') {
    return { error: 'Unable to create this publication. Check its details and try again.' };
  }

  revalidatePath('/publications');
  revalidatePath('/recipes');

  return {
    publication: {
      id: data,
      name,
      publication_type: publicationType as PublicationOption['publication_type'],
      author,
      edition,
      isbn,
      retailer_url: retailerUrl,
      site_url: siteUrl,
    },
  };
}

export async function trashPublication(formData: FormData): Promise<void> {
  const publicationId = formText(formData, 'publication_id');
  const expectedVersion = Number(formText(formData, 'expected_version'));
  const recipeDisposition = formText(formData, 'recipe_disposition');
  const destinationPublicationId = optionalText(formData, 'destination_publication_id');

  if (
    !publicationId ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !['delete', 'recipe_tin', 'another_publication'].includes(recipeDisposition) ||
    (recipeDisposition === 'another_publication' && !destinationPublicationId) ||
    (recipeDisposition !== 'another_publication' && destinationPublicationId)
  ) {
    redirect('/publications?status=conflict');
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect('/');
  }

  const { error } = await supabase.rpc('trash_publication', {
    p_publication_id: publicationId,
    p_expected_version: expectedVersion,
    p_recipe_disposition: recipeDisposition,
    p_destination_publication_id: destinationPublicationId,
  });
  if (error) {
    redirect(
      error.code === '40001' || error.code === '55000' || error.code === 'P0002'
        ? '/publications?status=conflict'
        : '/publications?status=error',
    );
  }

  revalidatePath('/publications');
  revalidatePath(`/publications/${publicationId}`);
  revalidatePath('/recipes');
  revalidatePath('/recipes/trash');
  redirect('/publications?status=trashed');
}

export async function restorePublication(formData: FormData): Promise<void> {
  const publicationId = formText(formData, 'publication_id');
  const expectedVersion = Number(formText(formData, 'expected_version'));
  if (!publicationId || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    redirect('/recipes/trash?status=conflict');
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect('/');
  }

  const { error } = await supabase.rpc('restore_publication', {
    p_publication_id: publicationId,
    p_expected_version: expectedVersion,
  });
  if (error) {
    redirect('/recipes/trash?status=conflict');
  }

  revalidatePath('/publications');
  revalidatePath(`/publications/${publicationId}`);
  revalidatePath('/recipes');
  revalidatePath('/recipes/trash');
  redirect(`/publications/${publicationId}`);
}
