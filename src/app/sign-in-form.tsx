'use client';

import { useActionState } from 'react';
import { signIn } from './actions/auth';

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="auth-form">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state?.error && <p role="alert">{state.error}</p>}
      <button disabled={pending} type="submit">
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
