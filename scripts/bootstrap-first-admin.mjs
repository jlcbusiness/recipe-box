import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export async function bootstrapFirstAdmin({
  createSupabaseClient = createClient,
  email,
  serviceRoleKey,
  siteUrl,
  supabaseUrl,
}) {
  let baseUrl;
  try {
    baseUrl = new URL(siteUrl);
  } catch {
    return { ok: false, message: 'NEXT_PUBLIC_SITE_URL must be a valid HTTPS URL.' };
  }
  const isLocalHttp =
    baseUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(baseUrl.hostname);
  if (baseUrl.protocol !== 'https:' && !isLocalHttp) {
    return {
      ok: false,
      message: 'NEXT_PUBLIC_SITE_URL must use HTTPS (HTTP is allowed for localhost only).',
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const admin = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: currentAdmins, error: adminLookupError } = await admin
    .from('accounts')
    .select('id')
    .eq('is_admin', true)
    .limit(1);
  if (adminLookupError) {
    return { ok: false, message: 'Could not check administrator status. No invitation was sent.' };
  }
  if (currentAdmins.length > 0) {
    return {
      ok: false,
      message: 'An administrator already exists. This bootstrap can only run once.',
    };
  }

  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      return { ok: false, message: 'Could not check existing accounts. No invitation was sent.' };
    }
    if (data.users.some((user) => user.email?.toLowerCase() === normalizedEmail)) {
      return { ok: false, message: 'That email already has an account. No invitation was sent.' };
    }
    if (data.users.length < 1000) break;
    page += 1;
  }

  const redirectTo = new URL('/auth/confirm', baseUrl).toString();
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo },
  );
  if (inviteError || !invitation.user) {
    return { ok: false, message: 'Could not send the administrator invitation.' };
  }

  const rollback = async () => {
    try {
      const { error } = await admin.auth.admin.deleteUser(invitation.user.id);
      return !error;
    } catch {
      return false;
    }
  };
  const rollbackMessage = async () =>
    (await rollback())
      ? 'No account was kept.'
      : 'Cleanup could not be confirmed; inspect Supabase Auth and Accounts before retrying.';

  const { error: metadataError } = await admin.auth.admin.updateUserById(invitation.user.id, {
    app_metadata: {
      ...invitation.user.app_metadata,
      invitation_pending: true,
      sign_in_method: 'email_password',
    },
  });
  if (metadataError) {
    return {
      ok: false,
      message: `Could not prepare the administrator invitation. ${await rollbackMessage()}`,
    };
  }

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .update({ sign_in_method: 'email_password' })
    .eq('id', invitation.user.id)
    .select('id')
    .maybeSingle();
  if (accountError || !account) {
    return {
      ok: false,
      message: `Could not prepare the administrator invitation. ${await rollbackMessage()}`,
    };
  }

  const { data: claimed, error: claimError } = await admin.rpc('claim_first_admin', {
    p_user_id: invitation.user.id,
  });
  if (claimError || claimed !== true) {
    const reason = claimError?.code ? ` (${claimError.code})` : '';
    return {
      ok: false,
      message: `The first-administrator claim was unavailable${reason}. ${await rollbackMessage()}`,
    };
  }

  return {
    ok: true,
    message: `First administrator invitation sent to ${normalizedEmail}. Accept it from the email to finish account setup.`,
  };
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || process.argv.length !== 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run bootstrap:admin -- owner@example.com');
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!supabaseUrl || !serviceRoleKey || !siteUrl) {
    console.error(
      'Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and NEXT_PUBLIC_SITE_URL.',
    );
    process.exitCode = 1;
    return;
  }

  const result = await bootstrapFirstAdmin({ email, serviceRoleKey, siteUrl, supabaseUrl });
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
