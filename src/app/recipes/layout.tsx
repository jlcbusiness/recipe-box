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
        { href: '/app', label: 'Workspace' },
        { href: '/recipes', label: 'Recipe Tin', current: true },
        ...(account?.is_admin ? [{ href: '/admin', label: 'Administration' }] : []),
      ]}
    >
      {children}
    </PrivateShell>
  );
}
