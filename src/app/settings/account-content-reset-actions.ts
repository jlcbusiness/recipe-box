'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ACCOUNT_CONTENT_RESET_CHALLENGE_LIFETIME_MS,
  ACCOUNT_CONTENT_RESET_COOKIE,
  ACCOUNT_CONTENT_RESET_PHRASE,
  cancelAccountContentResetChallenge,
  createAccountContentResetChallenge,
  isAccountContentResetChallengeId,
} from '../../lib/account-content-reset';
import { createAdminClient } from '../../lib/supabase/admin';
import { createClient } from '../../lib/supabase/server';

export type AccountContentResetReauthState = {
  error?: string;
  verified?: boolean;
};

export type AccountContentResetCompletion = {
  databaseReset: true;
  contentGeneration: string | null;
  cleanupStatus: 'complete' | 'pending' | 'unknown';
  pendingMedia: number | null;
  pendingExports: number | null;
};

export type AccountContentResetCleanupStatus = Pick<
  AccountContentResetCompletion,
  'cleanupStatus' | 'pendingMedia' | 'pendingExports'
>;

export type AccountContentResetCleanupCheckResult =
  | { status: AccountContentResetCleanupStatus }
  | { error: string };

export type AccountContentResetState = {
  error?: string;
  completion?: AccountContentResetCompletion;
};

async function readAccountContentResetCleanupStatus(
  accountId: string,
): Promise<AccountContentResetCleanupStatus> {
  const admin = createAdminClient();
  const [mediaQueue, exportQueue] = await Promise.all([
    admin
      .from('media_deletion_queue')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
    admin
      .from('export_deletion_queue')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
  ]);
  if (mediaQueue.error || exportQueue.error) {
    throw new Error('Unable to check the reset cleanup queues.');
  }

  const pendingMedia = mediaQueue.count ?? 0;
  const pendingExports = exportQueue.count ?? 0;
  return {
    cleanupStatus: pendingMedia === 0 && pendingExports === 0 ? 'complete' : 'pending',
    pendingMedia,
    pendingExports,
  };
}

export async function checkAccountContentResetCleanup(): Promise<AccountContentResetCleanupCheckResult> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { error: 'Sign in again before checking storage cleanup status.' };
  }

  try {
    return {
      status: await readAccountContentResetCleanupStatus(authData.user.id),
    };
  } catch (error) {
    console.error('Unable to refresh account reset cleanup status.', error);
    return {
      error:
        'Storage cleanup status could not be refreshed. Your last reported status is unchanged.',
    };
  }
}

function setChallengeCookieOptions() {
  return {
    httpOnly: true,
    maxAge: Math.ceil(ACCOUNT_CONTENT_RESET_CHALLENGE_LIFETIME_MS / 1000),
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

export async function reauthenticateForAccountContentReset(
  _previousState: AccountContentResetReauthState | undefined,
  formData: FormData,
): Promise<AccountContentResetReauthState> {
  const password = String(formData.get('current_password') ?? '');
  if (!password) return { error: 'Enter your current password.' };

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { error: 'Sign in again before wiping account data.' };
  }
  if (!authData.user.email) {
    return { error: 'This account does not have a password sign-in address.' };
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('sign_in_method')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (accountError || account?.sign_in_method !== 'email_password') {
    return { error: 'Use the sign-in method registered for this account.' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { error: 'Re-authentication is unavailable right now.' };
  }

  const verifier = createSupabaseClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data: verification, error: verificationError } = await verifier.auth.signInWithPassword({
    email: authData.user.email,
    password,
  });
  if (verificationError || verification.user?.id !== authData.user.id) {
    return { error: 'The current password is incorrect.' };
  }

  let challengeId: string;
  try {
    challengeId = await createAccountContentResetChallenge(
      authData.user.id,
      'email_password',
      true,
    );
  } catch {
    return { error: 'Unable to prepare the account reset confirmation.' };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACCOUNT_CONTENT_RESET_COOKIE, challengeId, setChallengeCookieOptions());
  return { verified: true };
}

export async function beginGoogleAccountContentResetReauth(): Promise<void> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    redirect('/?error=google-sign-in');
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('sign_in_method')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (accountError || account?.sign_in_method !== 'google') {
    redirect('/account/app-data?content_reset_error=provider');
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    redirect('/account/app-data?content_reset_error=unavailable');
  }

  let challengeId: string;
  try {
    challengeId = await createAccountContentResetChallenge(authData.user.id, 'google', false);
  } catch {
    redirect('/account/app-data?content_reset_error=unavailable');
  }

  const cookieStore = await cookies();
  cookieStore.set(ACCOUNT_CONTENT_RESET_COOKIE, challengeId, setChallengeCookieOptions());

  const redirectTo = new URL('/auth/callback', siteUrl);
  redirectTo.searchParams.set('next', '/account/app-data?content_reset_reauthenticated=1');
  const { data: oauth, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      queryParams: { prompt: 'login' },
      redirectTo: redirectTo.toString(),
    },
  });

  if (oauthError || !oauth.url) {
    await cancelAccountContentResetChallenge(authData.user.id, challengeId);
    cookieStore.delete(ACCOUNT_CONTENT_RESET_COOKIE);
    redirect('/account/app-data?content_reset_error=unavailable');
  }

  redirect(oauth.url);
}

export async function cancelAccountContentReset(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const challengeId = cookieStore.get(ACCOUNT_CONTENT_RESET_COOKIE)?.value;

  if (authError || !authData.user) {
    cookieStore.delete(ACCOUNT_CONTENT_RESET_COOKIE);
    return { error: 'Sign in again before continuing.' };
  }

  if (challengeId && isAccountContentResetChallengeId(challengeId)) {
    try {
      await cancelAccountContentResetChallenge(authData.user.id, challengeId);
    } catch {
      cookieStore.delete(ACCOUNT_CONTENT_RESET_COOKIE);
      return { error: 'The reset confirmation could not be canceled. It will expire shortly.' };
    }
  }

  cookieStore.delete(ACCOUNT_CONTENT_RESET_COOKIE);
  return {};
}

export async function resetAccountContent(
  _previousState: AccountContentResetState | undefined,
  formData: FormData,
): Promise<AccountContentResetState> {
  const confirmationPhrase = String(formData.get('confirmation_phrase') ?? '');
  if (confirmationPhrase !== ACCOUNT_CONTENT_RESET_PHRASE) {
    return { error: `Enter ${ACCOUNT_CONTENT_RESET_PHRASE} exactly to continue.` };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { error: 'Sign in again before wiping account data.' };
  }

  const cookieStore = await cookies();
  const challengeId = cookieStore.get(ACCOUNT_CONTENT_RESET_COOKIE)?.value;
  if (!challengeId || !isAccountContentResetChallengeId(challengeId)) {
    return { error: 'Re-authenticate before resetting account content.' };
  }

  const { data: result, error } = await supabase.rpc('reset_account_content', {
    p_challenge_id: challengeId,
    p_confirmation_phrase: confirmationPhrase,
  });
  if (error) {
    return { error: 'The wipe could not be completed. Your account data was not changed.' };
  }

  const resultRecord =
    result !== null && typeof result === 'object' && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null;
  if (resultRecord?.database_reset !== true) {
    return {
      error: 'The reset result could not be verified. Reload App data before trying again.',
    };
  }

  cookieStore.delete(ACCOUNT_CONTENT_RESET_COOKIE);

  let pendingMedia: number | null = null;
  let pendingExports: number | null = null;
  try {
    const cleanupStatus = await readAccountContentResetCleanupStatus(authData.user.id);
    pendingMedia = cleanupStatus.pendingMedia;
    pendingExports = cleanupStatus.pendingExports;
  } catch (error) {
    console.error('Unable to verify account reset cleanup status.', error);
  }

  return {
    completion: {
      databaseReset: true,
      contentGeneration:
        typeof resultRecord.content_generation === 'string'
          ? resultRecord.content_generation
          : null,
      cleanupStatus:
        pendingMedia === null || pendingExports === null
          ? 'unknown'
          : pendingMedia === 0 && pendingExports === 0
            ? 'complete'
            : 'pending',
      pendingMedia,
      pendingExports,
    },
  };
}
