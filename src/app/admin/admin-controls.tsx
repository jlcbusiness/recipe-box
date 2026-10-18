'use client';

import { useActionState, useState } from 'react';
import { Picklist, type PicklistOption } from '../picklist';
import { grantAdmin, sendInvitation } from './actions';

const signInMethodOptions: PicklistOption[] = [
  { value: 'email_password', label: 'Email and password' },
  { value: 'google', label: 'Google' },
];

export function InviteForm() {
  const [state, action, pending] = useActionState(sendInvitation, undefined);
  const [signInMethod, setSignInMethod] = useState('email_password');

  return (
    <form action={action} className="auth-form">
      <label htmlFor="invite-email">Invite email</label>
      <input id="invite-email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="invite-sign-in-method">Sign-in method</label>
      <input name="signInMethod" type="hidden" value={signInMethod} />
      <Picklist
        className="admin-invite-sign-in-method-picklist"
        disabled={pending}
        id="invite-sign-in-method"
        label="Sign-in method"
        onSelect={setSignInMethod}
        options={signInMethodOptions}
        value={signInMethod}
      />
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
      <button className="admin-invite-submit" disabled={pending} type="submit">
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
