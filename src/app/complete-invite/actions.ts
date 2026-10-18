'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '../../lib/supabase/admin';
import { createClient } from '../../lib/supabase/server';

export type CompleteInviteState = {
  error?: string;
};

export async function completeInvitation(
  _previousState: CompleteInviteState | undefined,
  formData: FormData,
): Promise<CompleteInviteState> {
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) {
    return { error: 'Use a password with at least 8 characters.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.app_metadata.invitation_pending) {
    return { error: 'This invitation is invalid or has already been used.' };
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) {
    return { error: 'Unable to set the password. Try again.' };
  }

  const admin = createAdminClient();
  const { error: metadataError } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      ...data.user.app_metadata,
      invitation_pending: false,
    },
  });

  if (metadataError) {
    return { error: 'Unable to finish account setup. Try again.' };
  }

  redirect('/app');
}

export async function beginGoogleInvitation(): Promise<CompleteInviteState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (
    error ||
    !data.user?.app_metadata.invitation_pending ||
    data.user.app_metadata.sign_in_method !== 'google'
  ) {
    return { error: 'This Google invitation is invalid or has already been used.' };
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('sign_in_method')
    .eq('id', data.user.id)
    .maybeSingle();
  if (account?.sign_in_method !== 'google') {
    return { error: 'This invitation is not configured for Google sign-in.' };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { error: 'Google sign-in is not available right now.' };
  }

  const redirectTo = new URL('/auth/callback?next=/complete-invite', siteUrl).toString();
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  if (signOutError) {
    return { error: 'Unable to prepare Google sign-in. Try again.' };
  }

  const { data: oauth, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (oauthError || !oauth.url) {
    return { error: 'Unable to start Google sign-in. Try again.' };
  }

  redirect(oauth.url);
}
