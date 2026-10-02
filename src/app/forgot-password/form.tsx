'use client';

import { useActionState } from 'react';
import { requestPasswordReset } from '../actions/auth';

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <form action={action} className="auth-form">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
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
        {pending ? 'Sending...' : 'Send reset link'}
      </button>
    </form>
  );
}
