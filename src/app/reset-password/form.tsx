'use client';

import { useActionState } from 'react';
import { updatePassword } from '../actions/auth';

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={action} className="auth-form">
      <label htmlFor="password">New password</label>
      <input
        id="password"
        minLength={8}
        name="password"
        type="password"
        autoComplete="new-password"
        required
      />
      {state?.error && (
        <p className="auth-feedback" role="alert">
          {state.error}
        </p>
      )}
      <button disabled={pending} type="submit">
        {pending ? 'Saving...' : 'Save password'}
      </button>
    </form>
  );
}
