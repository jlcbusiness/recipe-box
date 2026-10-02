'use client';

import { useActionState } from 'react';
import { completeInvitation } from './actions';

export function CompleteInviteForm() {
  const [state, action, pending] = useActionState(completeInvitation, undefined);

  return (
    <form action={action} className="auth-form">
      <label htmlFor="password">Create password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {state?.error && (
        <p className="auth-feedback" role="alert">
          {state.error}
        </p>
      )}
      <button disabled={pending} type="submit">
        {pending ? 'Setting password...' : 'Set password'}
      </button>
    </form>
  );
}
