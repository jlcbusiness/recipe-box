import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { PrivateShell } from '../private-shell';

export default async function RecipesLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <PrivateShell
      email={data.user.email ?? 'Unknown email'}
      wideContent
      navigation={[
        { href: '/recipes', label: 'Recipe Tin', current: true },
        { href: '/recipes/find', label: 'Find Recipes' },
        { href: '/publications', label: 'Library' },
        { href: '/settings', label: 'Settings' },
        ...(account?.is_admin ? [{ href: '/admin', label: 'Administration' }] : []),
      ]}
    >
      {children}
    </PrivateShell>
  );
}
