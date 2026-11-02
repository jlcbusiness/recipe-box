import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  ACCOUNT_CONTENT_RESET_CHALLENGE_LIFETIME_MS,
  type AccountContentResetProvider,
} from './account-content-reset-shared';
import { createAdminClient } from './supabase/admin';

export {
  ACCOUNT_CONTENT_RESET_CHALLENGE_LIFETIME_MS,
  ACCOUNT_CONTENT_RESET_COOKIE,
  ACCOUNT_CONTENT_RESET_PHRASE,
  type AccountContentResetProvider,
} from './account-content-reset-shared';

const challengeIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAccountContentResetChallengeId(value: string): boolean {
  return challengeIdPattern.test(value);
}

export async function createAccountContentResetChallenge(
  accountId: string,
  provider: AccountContentResetProvider,
  verified: boolean,
): Promise<string> {
  const admin = createAdminClient();
  const expiredBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { error: expiredError } = await admin
    .from('account_content_reset_challenges')
    .delete()
    .eq('account_id', accountId)
    .lt('created_at', expiredBefore);
  if (expiredError) {
    throw new Error('Unable to prepare the account reset confirmation.');
  }

  const { error: openError } = await admin
    .from('account_content_reset_challenges')
    .delete()
    .eq('account_id', accountId)
    .is('consumed_at', null);
  if (openError) {
    throw new Error('Unable to prepare the account reset confirmation.');
  }

  const challengeId = randomUUID();
  const now = Date.now();
  const { error } = await admin.from('account_content_reset_challenges').insert({
    id: challengeId,
    account_id: accountId,
    provider,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ACCOUNT_CONTENT_RESET_CHALLENGE_LIFETIME_MS).toISOString(),
    verified_at: verified ? new Date(now).toISOString() : null,
  });
  if (error) {
    throw new Error('Unable to prepare the account reset confirmation.');
  }

  return challengeId;
}

export async function hasVerifiedAccountContentResetChallenge(
  accountId: string,
  challengeId: string,
  provider: AccountContentResetProvider,
): Promise<boolean> {
  if (!isAccountContentResetChallengeId(challengeId)) return false;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('account_content_reset_challenges')
    .select('id')
    .eq('id', challengeId)
    .eq('account_id', accountId)
    .eq('provider', provider)
    .gt('expires_at', new Date().toISOString())
    .not('verified_at', 'is', null)
    .is('consumed_at', null)
    .maybeSingle();
  if (error) {
    throw new Error('Unable to verify the account reset confirmation.');
  }

  return Boolean(data);
}

export async function markGoogleAccountContentResetChallengeVerified(
  accountId: string,
  challengeId: string,
): Promise<boolean> {
  if (!isAccountContentResetChallengeId(challengeId)) return false;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('account_content_reset_challenges')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', challengeId)
    .eq('account_id', accountId)
    .eq('provider', 'google')
    .gt('expires_at', new Date().toISOString())
    .is('verified_at', null)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error('Unable to verify the Google account reset confirmation.');
  }

  return Boolean(data);
}

export async function cancelAccountContentResetChallenge(
  accountId: string,
  challengeId: string,
): Promise<void> {
  if (!isAccountContentResetChallengeId(challengeId)) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from('account_content_reset_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challengeId)
    .eq('account_id', accountId)
    .is('consumed_at', null)
    .is('result', null);
  if (error) {
    throw new Error('Unable to cancel the account reset confirmation.');
  }
}
