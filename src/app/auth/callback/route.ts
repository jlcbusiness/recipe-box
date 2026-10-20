import { type NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createClient } from '../../../lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/app';
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/app';

  if (url.searchParams.has('error')) {
    return NextResponse.redirect(new URL('/?error=google-sign-in', url.origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (destination === '/complete-invite') {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        const hasGoogleIdentity = user?.identities?.some(
          (identity) => identity.provider === 'google',
        );
        if (
          !user?.app_metadata.invitation_pending ||
          user.app_metadata.sign_in_method !== 'google' ||
          !hasGoogleIdentity
        ) {
          await supabase.auth.signOut({ scope: 'local' });
          return NextResponse.redirect(new URL('/sign-up?error=invalid-invite', url.origin));
        }

        const admin = createAdminClient();
        const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
          app_metadata: { ...user.app_metadata, invitation_pending: false },
        });
        if (metadataError) {
          return NextResponse.redirect(new URL('/complete-invite?error=retry', url.origin));
        }

        return NextResponse.redirect(new URL('/app', url.origin));
      }

      return NextResponse.redirect(new URL(destination, url.origin));
    }
  }

  return NextResponse.redirect(new URL('/forgot-password?error=invalid-link', url.origin));
}
