import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  if (!tokenHash || type !== 'invite') {
    return NextResponse.redirect(new URL('/sign-up?error=invalid-invite', url.origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'invite',
  });

  if (error || !data.user?.app_metadata.invitation_pending) {
    await supabase.auth.signOut({ scope: 'local' });
    return NextResponse.redirect(new URL('/sign-up?error=invalid-invite', url.origin));
  }

  return NextResponse.redirect(new URL('/complete-invite', url.origin));
}
