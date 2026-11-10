import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('../../src/lib/supabase/browser', () => ({ createClient }));

import { PublicRecipeSaveAction } from '../../src/app/recipes/public-recipe-save-action';

const publicId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const copiedRecipeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('public recipe save action', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
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
    createClient.mockReturnValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null }),
      },
    });
  });

  it('does not expose save or sign-in actions without a verified user', async () => {
    createClient.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    render(<PublicRecipeSaveAction publicId={publicId} recipeName="Citrus cake" />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /save to recipe tin/i })).toBeNull();
      expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
    });
  });

  it('treats a missing auth session as an anonymous visit', async () => {
    const missingSession = Object.assign(new Error('No session found'), {
      name: 'AuthSessionMissingError',
    });
    createClient.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: missingSession }) },
    });

    render(<PublicRecipeSaveAction publicId={publicId} recipeName="Citrus cake" />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /save to recipe tin/i })).toBeNull();
      expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('saves the public recipe and links to the new private copy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ alreadySaved: false, recipeId: copiedRecipeId }), {
        status: 201,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<PublicRecipeSaveAction publicId={publicId} recipeName="Citrus cake" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Save to Recipe Tin' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public-recipes/${publicId}/copy`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(
      (await screen.findByRole('link', { name: 'Open your saved copy' })).getAttribute('href'),
    ).toBe(`/recipes/${copiedRecipeId}`);
    expect(
      screen.getByRole('button', { name: 'Saved to Recipe Tin' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByRole('status')
        .closest('.recipe-public-save-feedback')
        ?.classList.contains('is-success'),
    ).toBe(true);
  });

  it('asks before opening an existing copy and lets the user cancel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          alreadySaved: true,
          recipeId: copiedRecipeId,
          isTrashed: false,
          recipeVersion: 4,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<PublicRecipeSaveAction publicId={publicId} recipeName="Citrus cake" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Save to Recipe Tin' }));

    const dialog = await screen.findByRole('dialog', { name: 'Already in your Recipe Tin' });
    expect(within(dialog).getByText(/already saved.*citrus cake/i)).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Open saved copy' }).getAttribute('href')).toBe(
      `/recipes/${copiedRecipeId}`,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(dialog.hasAttribute('open')).toBe(false));
  });

  it('shows server failures instead of reporting a successful save', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'The public recipe could not be saved.' }), {
        status: 503,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<PublicRecipeSaveAction publicId={publicId} recipeName="Citrus cake" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Save to Recipe Tin' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The public recipe could not be saved.',
    );
  });

  it('explains when the deployed copy endpoint is unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<!doctype html>', { status: 404 }));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);
    render(<PublicRecipeSaveAction publicId={publicId} recipeName="Citrus cake" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Save to Recipe Tin' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Saving public recipes is not available on this version of Recipe Box.',
    );
    expect(consoleError).toHaveBeenCalledWith(
      'Public recipe copy endpoint returned a non-JSON response.',
      { status: 404, code: 'SyntaxError' },
    );
  });
});
