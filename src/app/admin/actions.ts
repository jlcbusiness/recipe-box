'use server';

import { revalidatePath } from 'next/cache';
import { processMediaDeletions } from '../../lib/media/server';
import { createAdminClient } from '../../lib/supabase/admin';
import { createClient } from '../../lib/supabase/server';

export type AdminFormState = {
  error?: string;
  message?: string;
};

type AdminContext = {
  actorId: string;
  isOwner: boolean;
  admin: ReturnType<typeof createAdminClient>;
};

const accountIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAdminContext(): Promise<AdminContext | null> {
  const sessionClient = await createClient();
  const { data, error } = await sessionClient.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  const { data: account } = await sessionClient
    .from('accounts')
    .select('is_admin, is_owner')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!account?.is_admin) {
    return null;
  }

  return {
    actorId: data.user.id,
    isOwner: account.is_owner,
    admin: createAdminClient(),
  };
}

async function getTargetAccount(admin: AdminContext['admin'], accountId: string) {
  const { data, error } = await admin
    .from('accounts')
    .select('is_admin, is_owner')
    .eq('id', accountId)
    .maybeSingle();

  return error ? null : data;
}

async function listStorageFiles(
  admin: AdminContext['admin'],
  bucket: string,
  folder: string,
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100, offset });
    if (error) {
      throw new Error('Unable to inspect account files.');
    }

    const entries = data ?? [];
    for (const entry of entries) {
      if (!entry.name || entry.name === '.' || entry.name === '..' || entry.name.includes('/')) {
        throw new Error('Invalid account file path.');
      }

      const path = `${folder}/${entry.name}`;
      if (entry.id === null) {
        paths.push(...(await listStorageFiles(admin, bucket, path)));
      } else {
        paths.push(path);
      }
    }

    if (entries.length < 100) {
      return paths;
    }
    offset += 100;
  }
}

async function deleteAccountExportArchives(admin: AdminContext['admin'], accountId: string) {
  const paths = await listStorageFiles(admin, 'recipe-exports', accountId);
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error } = await admin.storage
      .from('recipe-exports')
      .remove(paths.slice(offset, offset + 100));
    if (error) {
      throw new Error('Unable to remove account export archives.');
    }
  }
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

  const context = await getAdminContext();
  if (!context) {
    return { error: 'You do not have permission to send invitations.' };
  }
  const { admin } = context;

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
    console.error('Invitation setup failed.', {
      stage: 'authMetadata',
      name: metadataError.name,
      status: metadataError.status,
      code: metadataError.code,
    });
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: 'Unable to prepare the invitation. Try again.' };
  }

  const { error: accountError } = await admin
    .from('accounts')
    .update({ sign_in_method: signInMethod })
    .eq('id', data.user.id);
  if (accountError) {
    console.error('Invitation setup failed.', {
      stage: 'accountSignInMethod',
      code: accountError.code,
      message: accountError.message,
    });
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: 'Unable to prepare the invitation. Try again.' };
  }

  revalidatePath('/admin');
  return { message: `Invitation sent to ${email}.` };
}

export async function grantAdmin(
  _previousState: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const targetId = String(formData.get('accountId') ?? '');
  if (!accountIdPattern.test(targetId)) {
    return { error: 'Choose a valid account.' };
  }

  const context = await getAdminContext();
  if (!context) {
    return { error: 'You do not have permission to grant administrator access.' };
  }

  const { data, error } = await context.admin
    .from('accounts')
    .update({ is_admin: true })
    .eq('id', targetId)
    .eq('is_owner', false)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    return { error: 'Unable to grant administrator access to that account.' };
  }

  revalidatePath('/admin');
  return { message: 'Administrator access granted.' };
}

export async function demoteAdmin(
  _previousState: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const targetId = String(formData.get('accountId') ?? '');
  if (!accountIdPattern.test(targetId)) {
    return { error: 'Choose a valid account.' };
  }

  const context = await getAdminContext();
  if (!context?.isOwner) {
    return { error: 'Only the owner can remove administrator access.' };
  }

  const target = await getTargetAccount(context.admin, targetId);
  if (!target) {
    return { error: 'That account could not be found.' };
  }
  if (target.is_owner) {
    return { error: 'The owner must transfer ownership before this account can be demoted.' };
  }
  if (!target.is_admin) {
    return { error: 'That account is not an administrator.' };
  }

  const { data, error } = await context.admin
    .from('accounts')
    .update({ is_admin: false })
    .eq('id', targetId)
    .eq('is_owner', false)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    return { error: 'Unable to remove administrator access from that account.' };
  }

  revalidatePath('/admin');
  return { message: 'Administrator access removed.' };
}

export async function transferAccountOwner(
  _previousState: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const targetId = String(formData.get('accountId') ?? '');
  if (!accountIdPattern.test(targetId)) {
    return { error: 'Choose a valid account.' };
  }

  const context = await getAdminContext();
  if (!context?.isOwner) {
    return { error: 'Only the owner can transfer ownership.' };
  }

  const { data, error } = await context.admin.rpc('transfer_account_owner', {
    p_current_owner_id: context.actorId,
    p_new_owner_id: targetId,
  });
  if (error || data !== true) {
    return { error: 'Unable to transfer ownership to that account.' };
  }

  revalidatePath('/admin');
  return { message: 'Account ownership transferred.' };
}

export async function deleteAccount(
  _previousState: AdminFormState | undefined,
  formData: FormData,
): Promise<AdminFormState> {
  const targetId = String(formData.get('accountId') ?? '');
  if (!accountIdPattern.test(targetId)) {
    return { error: 'Choose a valid account.' };
  }

  const context = await getAdminContext();
  if (!context) {
    return { error: 'You do not have permission to delete accounts.' };
  }
  if (targetId === context.actorId) {
    return { error: 'You cannot delete the account you are currently using.' };
  }

  const target = await getTargetAccount(context.admin, targetId);
  if (!target) {
    return { error: 'That account could not be found.' };
  }
  if (target.is_owner) {
    return { error: 'The owner must transfer ownership before this account can be deleted.' };
  }
  if (target.is_admin && !context.isOwner) {
    return { error: 'Only the owner can delete an administrator account.' };
  }

  try {
    await deleteAccountExportArchives(context.admin, targetId);
  } catch {
    return { error: 'Account files could not be removed, so the account was not deleted.' };
  }

  const { error } = await context.admin.auth.admin.deleteUser(targetId);
  if (error) {
    return { error: 'Unable to delete that account.' };
  }

  revalidatePath('/admin');
  let cleanupPending = false;
  try {
    const { data: queuedMedia, error: queueError } = await context.admin
      .from('media_deletion_queue')
      .select('object_path')
      .eq('account_id', targetId);
    if (queueError) {
      cleanupPending = true;
    } else if (queuedMedia?.length) {
      const cleanup = await processMediaDeletions(
        context.admin,
        queuedMedia.map(({ object_path }) => object_path),
      );
      cleanupPending = cleanup.failed.length > 0 || cleanup.processed < queuedMedia.length;
    }
  } catch {
    cleanupPending = true;
  }

  return {
    message: cleanupPending
      ? 'Account permanently deleted. Some photo files remain queued for cleanup.'
      : 'Account permanently deleted.',
  };
}
