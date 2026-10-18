import { redirect } from 'next/navigation';
import { createAdminClient } from '../../lib/supabase/admin';
import { createClient } from '../../lib/supabase/server';
import { PrivateShell } from '../private-shell';
import { GrantAdminForm, InviteForm } from './admin-controls';

function getAdminCredentialMetadata() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    return { format: 'missing', jwtRole: 'unknown' };
  }

  if (key.startsWith('sb_secret_')) {
    return { format: 'supabase-secret', jwtRole: 'opaque' };
  }

  if (key.startsWith('sb_publishable_')) {
    return { format: 'supabase-publishable', jwtRole: 'public' };
  }

  const payload = key.split('.')[1];
  if (!payload) {
    return { format: 'other', jwtRole: 'unknown' };
  }

  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (claims && typeof claims === 'object' && 'role' in claims) {
      const role = claims.role;
      if (role === 'service_role' || role === 'anon' || role === 'authenticated') {
        return { format: 'jwt', jwtRole: role };
      }
    }
    return { format: 'jwt', jwtRole: 'other-or-missing' };
  } catch {
    return { format: 'jwt', jwtRole: 'unparseable' };
  }
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('is_admin, hand_preference')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!account?.is_admin) {
    redirect('/recipes');
  }

  const admin = createAdminClient();
  const [authUsers, accountRows] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('accounts').select('id, is_admin, sign_in_method, created_at').order('created_at'),
  ]);

  if (authUsers.error || accountRows.error) {
    console.error('Unable to load account administration.', {
      adminCredential: getAdminCredentialMetadata(),
      authUsers: authUsers.error
        ? {
            name: authUsers.error.name,
            status: authUsers.error.status,
            code: authUsers.error.code,
          }
        : null,
      accountRows: accountRows.error
        ? {
            name: accountRows.error.name,
            code: accountRows.error.code,
          }
        : null,
    });
    throw new Error('Unable to load account administration.');
  }

  const accountById = new Map(accountRows.data.map((account) => [account.id, account]));
  const users = authUsers.data.users
    .map((authUser) => ({
      id: authUser.id,
      email: authUser.email ?? 'Unknown email',
      account: accountById.get(authUser.id),
    }))
    .filter((user) => user.account);

  return (
    <PrivateShell
      avatarUrl={data.user.user_metadata.avatar_url ?? data.user.user_metadata.picture}
      email={data.user.email ?? 'Unknown email'}
      handPreference={account.hand_preference === 'left' ? 'left' : 'right'}
      navigation={[
        { href: '/publications', label: 'Library' },
        { href: '/settings', label: 'Settings' },
        { href: '/admin', label: 'Administration', current: true },
      ]}
    >
      <main aria-labelledby="page-title">
        <p className="eyebrow">ACCOUNT ACCESS</p>
        <h1 id="page-title">Account administration</h1>
        <section aria-labelledby="invite-title">
          <h2 id="invite-title">Send an invitation</h2>
          <InviteForm />
        </section>
        <section aria-labelledby="accounts-title">
          <h2 id="accounts-title">Accounts</h2>
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Sign-in method</th>
                  <th scope="col">Role</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(({ id, email, account }) => (
                  <tr key={id}>
                    <td>{email}</td>
                    <td>{account?.sign_in_method}</td>
                    <td>{account?.is_admin ? 'Admin' : 'Member'}</td>
                    <td>{account?.is_admin ? null : <GrantAdminForm accountId={id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </PrivateShell>
  );
}
