'use client';

import { type FormEvent, useActionState, useState } from 'react';
import { Picklist, type PicklistOption } from '../picklist';
import {
  type AdminFormState,
  deleteAccount,
  demoteAdmin,
  grantAdmin,
  sendInvitation,
  transferAccountOwner,
} from './actions';

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

type ConfirmedAdminAction = (
  previousState: AdminFormState | undefined,
  formData: FormData,
) => Promise<AdminFormState>;

function ConfirmedAdminActionForm({
  accountId,
  action,
  buttonLabel,
  confirmation,
}: {
  accountId: string;
  action: ConfirmedAdminAction;
  buttonLabel: string;
  confirmation: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <div className="admin-account-action">
      <form
        action={formAction}
        className="admin-account-action-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          if (!window.confirm(confirmation)) {
            event.preventDefault();
          }
        }}
      >
        <input name="accountId" type="hidden" value={accountId} />
        <button disabled={pending} type="submit">
          {pending ? 'Working...' : buttonLabel}
        </button>
      </form>
      {state?.error && <p role="alert">{state.error}</p>}
      {state?.message && <p role="status">{state.message}</p>}
    </div>
  );
}

export function AdminAccountActions({
  accountId,
  email,
  isAdmin,
  isOwner,
  currentAccountId,
  currentIsOwner,
}: {
  accountId: string;
  email: string;
  isAdmin: boolean;
  isOwner: boolean;
  currentAccountId: string;
  currentIsOwner: boolean;
}) {
  const isCurrentAccount = accountId === currentAccountId;
  const canManageTarget = !isOwner && !isCurrentAccount;

  return (
    <div className="admin-account-actions">
      {!isAdmin && canManageTarget && (
        <ConfirmedAdminActionForm
          accountId={accountId}
          action={grantAdmin}
          buttonLabel="Grant admin"
          confirmation={`Grant administrator access to ${email}?`}
        />
      )}
      {currentIsOwner && canManageTarget && isAdmin && (
        <ConfirmedAdminActionForm
          accountId={accountId}
          action={demoteAdmin}
          buttonLabel="Demote"
          confirmation={`Remove administrator access from ${email}?`}
        />
      )}
      {currentIsOwner && canManageTarget && (
        <ConfirmedAdminActionForm
          accountId={accountId}
          action={transferAccountOwner}
          buttonLabel="Make Owner"
          confirmation={`Make ${email} the owner? You will remain an administrator, and your libraries will stay separate.`}
        />
      )}
      {canManageTarget && (!isAdmin || currentIsOwner) && (
        <ConfirmedAdminActionForm
          accountId={accountId}
          action={deleteAccount}
          buttonLabel="Delete"
          confirmation={`Permanently delete ${email} and all of their recipes, publications, and account data? This cannot be undone.`}
        />
      )}
    </div>
  );
}
