import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  beginGoogleReauth,
  cancelReset,
  checkCleanup,
  clearPrivateOfflineCaches,
  refresh,
  reauthenticate,
  replace,
  resetAccountContent,
} = vi.hoisted(() => ({
  beginGoogleReauth: vi.fn(),
  cancelReset: vi.fn(),
  checkCleanup: vi.fn(),
  clearPrivateOfflineCaches: vi.fn(),
  refresh: vi.fn(),
  reauthenticate: vi.fn(),
  replace: vi.fn(),
  resetAccountContent: vi.fn(),
}));

vi.mock('../../src/app/settings/account-content-reset-actions', () => ({
  beginGoogleAccountContentResetReauth: beginGoogleReauth,
  cancelAccountContentReset: cancelReset,
  checkAccountContentResetCleanup: checkCleanup,
  reauthenticateForAccountContentReset: reauthenticate,
  resetAccountContent,
}));
vi.mock('../../src/lib/offline/cache-client', () => ({ clearPrivateOfflineCaches }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace }) }));

import { AccountContentResetAction } from '../../src/app/settings/account-content-reset-action';

describe('account content reset action', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    clearPrivateOfflineCaches.mockResolvedValue(undefined);
    resetAccountContent.mockResolvedValue({
      completion: {
        databaseReset: true,
        contentGeneration: 'next-generation',
        cleanupStatus: 'pending',
        pendingMedia: 20,
        pendingExports: 1,
      },
    });
    checkCleanup.mockResolvedValue({
      status: {
        cleanupStatus: 'complete',
        pendingMedia: 0,
        pendingExports: 0,
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  });

  it('explains pending cleanup and refreshes the status on request', async () => {
    render(<AccountContentResetAction initialOpen initialReauthReady provider="email_password" />);
    const dialog = screen.getByRole('dialog', { name: 'Wipe all account data?' });
    const phrase = within(dialog).getByLabelText(/Type RESET ALL CONTENT/);
    fireEvent.change(phrase, { target: { value: 'RESET ALL CONTENT' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Wipe all account data' }));

    await waitFor(() =>
      expect(dialog.textContent).toContain(
        'Storage deletion remains queued for 20 managed media items and 1 export archive.',
      ),
    );
    expect(dialog.textContent).toContain('A background job retries storage deletion daily.');
    expect(dialog.textContent).toContain('This is a snapshot and will not update automatically');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Check cleanup status' }));

    await waitFor(() => expect(checkCleanup).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(dialog.textContent).toContain(
        'Account records were wiped. Managed media and export archives have been deleted.',
      ),
    );
    expect(within(dialog).queryByRole('button', { name: 'Check cleanup status' })).toBeNull();
  });
});
