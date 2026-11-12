'use server';

import { revalidatePath } from 'next/cache';
import {
  normalizePublicUsername,
  validatePublicUsername,
} from '../../lib/accounts/public-username-rules';
import { createClient } from '../../lib/supabase/server';

export type PublicUsernameActionState = {
  status?: 'saved' | 'error';
  message?: string;
  publicUsername?: string;
  fieldError?: boolean;
};

export async function savePublicUsername(
  _previousState: PublicUsernameActionState,
  formData: FormData,
): Promise<PublicUsernameActionState> {
  const rawUsername = String(formData.get('public_username') ?? '');
  const validationError = validatePublicUsername(rawUsername);
  if (validationError) {
    return { status: 'error', message: validationError, fieldError: true };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { status: 'error', message: 'Sign in to update your public username.' };
  }

  const { data, error } = await supabase.rpc('set_public_username', {
    p_public_username: normalizePublicUsername(rawUsername),
  });

  if (error?.code === '23505') {
    return {
      status: 'error',
      message: 'That username is already in use. Try another.',
      fieldError: true,
    };
  }
  if (error?.code === '23514' || error?.code === 'PT422') {
    return {
      status: 'error',
      message: validationError ?? 'Use a valid public username.',
      fieldError: true,
    };
  }
  if (error || typeof data !== 'string') {
    return { status: 'error', message: 'Your public username could not be saved. Try again.' };
  }

  revalidatePath('/account/username');
  return { status: 'saved', message: 'Username saved.', publicUsername: data };
}
