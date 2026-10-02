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
