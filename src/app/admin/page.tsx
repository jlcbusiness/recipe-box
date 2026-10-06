import { redirect } from 'next/navigation';
import { createAdminClient } from '../../lib/supabase/admin';
import { createClient } from '../../lib/supabase/server';
import { PrivateShell } from '../private-shell';
import { GrantAdminForm, InviteForm } from './admin-controls';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect('/');
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('is_admin')
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
      email={data.user.email ?? 'Unknown email'}
      navigation={[
        { href: '/recipes', label: 'Recipe Tin' },
        { href: '/publications', label: 'Library' },
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
