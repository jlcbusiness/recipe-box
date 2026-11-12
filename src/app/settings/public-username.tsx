'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { savePublicUsername } from './public-username-actions';

export function PublicUsernameSettings({ publicUsername }: { publicUsername: string | null }) {
  const [state, formAction, isPending] = useActionState(savePublicUsername, {});
  const inputId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [value, setValue] = useState(publicUsername ?? '');
  const hasFieldError = state.status === 'error' && state.fieldError;

  useEffect(() => {
    if (state.status === 'saved' && state.publicUsername) {
      setValue(state.publicUsername);
    }
  }, [state]);

  return (
    <section aria-labelledby="public-username-title" className="settings-section">
      <h2 id="public-username-title">Username</h2>
      <form action={formAction} className="public-username-settings-form">
        <label htmlFor={inputId}>Username</label>
        <p id={descriptionId}>
          This name appears as plain-text attribution on recipes you publish. It is not your sign-in
          email and does not create a public profile.
        </p>
        <div className="public-username-settings-controls">
          <input
            aria-describedby={`${descriptionId}${hasFieldError ? ` ${errorId}` : ''}`}
            aria-invalid={hasFieldError || undefined}
            autoComplete="off"
            id={inputId}
            maxLength={30}
            minLength={3}
            name="public_username"
            onChange={(event) => setValue(event.target.value)}
            required
            spellCheck={false}
            value={value}
          />
          <button className="recipe-secondary-button" disabled={isPending} type="submit">
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
        {state.status === 'error' && (
          <p
            aria-live="assertive"
            className={hasFieldError ? 'public-username-error' : undefined}
            id={hasFieldError ? errorId : undefined}
            role="alert"
          >
            {state.message}
          </p>
        )}
        {state.status === 'saved' && (
          <p aria-live="polite" role="status">
            {state.message}
          </p>
        )}
      </form>
    </section>
  );
}
