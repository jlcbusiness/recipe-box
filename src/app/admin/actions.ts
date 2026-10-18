'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '../../lib/supabase/admin';
import { createClient } from '../../lib/supabase/server';

export type AdminFormState = {
  error?: string;
  message?: string;
};

async function getAdminClient() {
  const sessionClient = await createClient();
  const { data, error } = await sessionClient.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  const { data: account } = await sessionClient
    .from('accounts')
    .select('is_admin')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!account?.is_admin) {
    return null;
  }

  return createAdminClient();
}

export async function sendInvitation(
  _previousState: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const signInMethod = String(formData.get('signInMethod') ?? 'email_password');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }
  if (signInMethod !== 'email_password' && signInMethod !== 'google') {
    return { error: 'Choose a supported sign-in method.' };
  }

  const admin = await getAdminClient();
  if (!admin) {
    return { error: 'You do not have permission to send invitations.' };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    return { error: 'Invitations are not available right now.' };
  }

  const { data: existingUsers, error: lookupError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (lookupError) {
    return { error: 'Unable to check that account. Try again.' };
  }
  if (existingUsers.users.some((user) => user.email?.toLowerCase() === email)) {
    return { error: 'That email already has an account. Ask the person to sign in.' };
  }

  const redirectTo = new URL('/auth/confirm', siteUrl).toString();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error || !data.user) {
    return { error: 'Unable to send an invitation to that address.' };
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      ...data.user.app_metadata,
      invitation_pending: true,
      sign_in_method: signInMethod,
    },
  });

  if (metadataError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: 'Unable to prepare the invitation. Try again.' };
  }

  const { error: accountError } = await admin
    .from('accounts')
    .update({ sign_in_method: signInMethod })
    .eq('id', data.user.id);
  if (accountError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: 'Unable to prepare the invitation. Try again.' };
  }

  revalidatePath('/admin');
  return { message: `Invitation sent to ${email}.` };
}

export async function grantAdmin(formData: FormData): Promise<void> {
  const targetId = String(formData.get('accountId') ?? '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
    return;
  }

  const admin = await getAdminClient();
  if (!admin) {
    return;
  }

  await admin.from('accounts').update({ is_admin: true }).eq('id', targetId);
  revalidatePath('/admin');
}
