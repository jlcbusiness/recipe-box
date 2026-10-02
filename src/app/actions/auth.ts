'use server';

import { redirect } from 'next/navigation';
import { isSelfSignupAllowed } from '../../lib/auth/signup-mode';
import { createClient } from '../../lib/supabase/server';

export type AuthFormState = {
  error?: string;
};

export type RecoveryFormState = {
  error?: string;
  message?: string;
};

export async function signIn(
  _previousState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Enter your email and password.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'Email or password is incorrect.' };
  }

  redirect('/app');
}

export async function signUp(
  _previousState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  if (!isSelfSignupAllowed()) {
    return { error: 'Self sign-up is closed. Ask an admin for an invitation.' };
  }

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || password.length < 8) {
    return { error: 'Enter an email and a password with at least 8 characters.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: 'Unable to create an account with those details.' };
  }

  if (!data.session) {
    return { error: 'Check your email to finish creating your account.' };
  }

  redirect('/app');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

export async function requestPasswordReset(
  _previousState: RecoveryFormState | undefined,
  formData: FormData,
): Promise<RecoveryFormState> {
  const email = String(formData.get('email') ?? '').trim();

  if (!email) {
    return { error: 'Enter your email address.' };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { error: 'Password recovery is not available right now.' };
  }

  const redirectTo = new URL('/auth/callback?next=/reset-password', siteUrl).toString();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    return { error: 'Unable to send reset instructions right now. Try again shortly.' };
  }

  return { message: 'If an account exists for that email, reset instructions have been sent.' };
}

export async function updatePassword(
  _previousState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get('password') ?? '');

  if (password.length < 8) {
    return { error: 'Use a password with at least 8 characters.' };
  }

  const supabase = await createClient();
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return { error: 'This password reset link is invalid or has expired.' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: 'Unable to update the password right now. Try again shortly.' };
  }

  redirect('/app');
}
