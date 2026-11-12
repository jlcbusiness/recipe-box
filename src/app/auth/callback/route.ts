import { type NextRequest, NextResponse } from 'next/server';
import {
  ACCOUNT_CONTENT_RESET_COOKIE,
  markGoogleAccountContentResetChallengeVerified,
} from '../../../lib/account-content-reset';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createClient } from '../../../lib/supabase/server';

function contentResetErrorResponse(origin: string) {
  const response = NextResponse.redirect(
    new URL('/account/app-data?content_reset_error=google', origin),
  );
  response.cookies.delete(ACCOUNT_CONTENT_RESET_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/app';
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/app';
  const isContentResetReauth = destination === '/account/app-data?content_reset_reauthenticated=1';

  if (url.searchParams.has('error')) {
    if (isContentResetReauth) return contentResetErrorResponse(url.origin);
    return NextResponse.redirect(new URL('/?error=google-sign-in', url.origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (isContentResetReauth) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        const challengeId = request.cookies.get(ACCOUNT_CONTENT_RESET_COOKIE)?.value;
        if (authError || !authData.user || !challengeId) {
          await supabase.auth.signOut({ scope: 'local' });
          return contentResetErrorResponse(url.origin);
        }

        try {
          const verified = await markGoogleAccountContentResetChallengeVerified(
            authData.user.id,
            challengeId,
          );
          if (!verified) {
            await supabase.auth.signOut({ scope: 'local' });
            return contentResetErrorResponse(url.origin);
          }
        } catch {
          await supabase.auth.signOut({ scope: 'local' });
          return contentResetErrorResponse(url.origin);
        }

        return NextResponse.redirect(
          new URL('/account/app-data?content_reset_reauthenticated=1', url.origin),
        );
      }

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

  if (isContentResetReauth) return contentResetErrorResponse(url.origin);
  return NextResponse.redirect(new URL('/forgot-password?error=invalid-link', url.origin));
}
