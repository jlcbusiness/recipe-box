import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { PrivateShell } from '../private-shell';

export default async function PublicationsLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <PrivateShell
      avatarUrl={data.user.user_metadata.avatar_url ?? data.user.user_metadata.picture}
      email={data.user.email ?? 'Unknown email'}
      handPreference={account?.hand_preference === 'left' ? 'left' : 'right'}
      wideContent
      navigation={[
        { href: '/publications', label: 'Library', current: true },
        { href: '/settings', label: 'Settings' },
        ...(account?.is_admin ? [{ href: '/admin', label: 'Administration' }] : []),
      ]}
    >
      {children}
    </PrivateShell>
  );
}
