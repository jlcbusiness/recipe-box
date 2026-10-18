import { createClient } from '@supabase/supabase-js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || process.argv.length !== 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run bootstrap:admin -- owner@example.com');
  process.exitCode = 1;
} else {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!supabaseUrl || !serviceRoleKey || !siteUrl) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and NEXT_PUBLIC_SITE_URL.');
    process.exitCode = 1;
  } else {
    await bootstrapFirstAdmin({ email, serviceRoleKey, siteUrl, supabaseUrl });
  }
}

async function bootstrapFirstAdmin({ email, serviceRoleKey, siteUrl, supabaseUrl }) {
  let baseUrl;
  try {
    baseUrl = new URL(siteUrl);
  } catch {
    console.error('NEXT_PUBLIC_SITE_URL must be a valid HTTPS URL.');
    process.exitCode = 1;
    return;
  }
  const isLocalHttp =
    baseUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(baseUrl.hostname);
  if (baseUrl.protocol !== 'https:' && !isLocalHttp) {
    console.error('NEXT_PUBLIC_SITE_URL must use HTTPS (HTTP is allowed for localhost only).');
    process.exitCode = 1;
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: currentAdmins, error: adminLookupError } = await admin
    .from('accounts')
    .select('id')
    .eq('is_admin', true)
    .limit(1);
  if (adminLookupError) {
    console.error('Could not check administrator status. No invitation was sent.');
    process.exitCode = 1;
    return;
  }
  if (currentAdmins.length > 0) {
    console.error('An administrator already exists. This bootstrap can only run once.');
    process.exitCode = 1;
    return;
  }

  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error('Could not check existing accounts. No invitation was sent.');
      process.exitCode = 1;
      return;
    }
    if (data.users.some((user) => user.email?.toLowerCase() === email)) {
      console.error('That email already has an account. No invitation was sent.');
      process.exitCode = 1;
      return;
    }
    if (data.users.length < 1000) break;
    page += 1;
  }

  const redirectTo = new URL('/auth/confirm', baseUrl).toString();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error || !data.user) {
    console.error('Could not send the administrator invitation.');
    process.exitCode = 1;
    return;
  }

  const rollback = async () => {
    await admin.auth.admin.deleteUser(data.user.id);
  };
  const { error: metadataError } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      ...data.user.app_metadata,
      invitation_pending: true,
      sign_in_method: 'email_password',
    },
  });
  if (metadataError) {
    await rollback();
    console.error('Could not prepare the administrator invitation. No account was kept.');
    process.exitCode = 1;
    return;
  }

  const { data: account, error: accountError } = await admin
    .from('accounts')
    .update({ sign_in_method: 'email_password' })
    .eq('id', data.user.id)
    .select('id')
    .maybeSingle();
  if (accountError || !account) {
    await rollback();
    console.error('Could not prepare the administrator invitation. No account was kept.');
    process.exitCode = 1;
    return;
  }

  const { data: claimed, error: claimError } = await admin.rpc('claim_first_admin', {
    p_user_id: data.user.id,
  });
  if (claimError || claimed !== true) {
    await rollback();
    const reason = claimError?.code ? ` (${claimError.code})` : '';
    console.error(`The first-administrator claim was unavailable${reason}. No account was kept.`);
    process.exitCode = 1;
    return;
  }

  console.log(`First administrator invitation sent to ${email}. Accept it from the email to finish account setup.`);
}