'use client';

import { useActionState } from 'react';
import { grantAdmin, sendInvitation } from './actions';

export function InviteForm() {
  const [state, action, pending] = useActionState(sendInvitation, undefined);

  return (
    <form action={action} className="auth-form">
      <label htmlFor="invite-email">Invite email</label>
      <input id="invite-email" name="email" type="email" autoComplete="email" required />
      {state?.error && (
        <p className="auth-feedback" role="alert">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="auth-feedback" data-success="true" role="status">
          {state.message}
        </p>
      )}
      <button disabled={pending} type="submit">
        {pending ? 'Sending...' : 'Send invitation'}
      </button>
    </form>
  );
}

export function GrantAdminForm({ accountId }: { accountId: string }) {
  return (
    <form action={grantAdmin}>
      <input name="accountId" type="hidden" value={accountId} />
      <button type="submit">Grant admin</button>
    </form>
  );
}
