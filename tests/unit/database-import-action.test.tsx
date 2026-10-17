import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, refresh, push } = vi.hoisted(() => ({
  createClient: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock('../../src/lib/supabase/browser', () => ({ createClient }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));

import { DatabaseImportAction, ImportAction } from '../../src/app/settings/database-import-action';

const importPath =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/imports/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.zip';

async function choosePicklistOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

describe('database import action', () => {
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
      storage: {
        from: vi.fn(() => ({ uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }) })),
      },
    });
  });

  it('uploads, previews, requires a conflict choice, commits, and cleans up the archive', async () => {
    const preview = {
      scope: { type: 'database' as const },
      incomingRecipes: [],
      destinationPublications: [],
      counts: { recipes: 1, publications: 1 },
      mediaCount: 0,
      preferences: ['volume_system'],
      privacy: { privateRecipes: 1, publicRecipes: 0 },
      conflicts: [
        {
          kind: 'publication',
          incomingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          incomingName: 'Baking Annual',
          candidates: [
            {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              name: 'Baking Annual',
              version: 3,
            },
          ],
        },
        {
          kind: 'recipe',
          incomingId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          incomingName: 'Lemon cake',
          candidates: [
            {
              id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              name: 'Lemon cake',
              version: 5,
            },
          ],
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ path: importPath, token: 'signed-token' }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ imported: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cancelled: true, cleanupPending: false }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<DatabaseImportAction />);
    fireEvent.click(screen.getByRole('button', { name: 'Import database' }));
    const dialog = screen.getByRole('dialog', { name: 'Import database' });
    fireEvent.change(within(dialog).getByLabelText('Database archive'), {
      target: { files: [new File(['archive'], 'backup.zip', { type: 'application/zip' })] },
    });

    expect(await within(dialog).findByText('1 recipes, 1 publications, 0 images')).toBeTruthy();
    expect(within(dialog).getByText('backup.zip')).toBeTruthy();
    const accountSettingsChoice = within(dialog).getByRole('group', { name: 'Account settings' });
    expect(accountSettingsChoice.textContent).toContain('Volume units');
    expect(
      within(accountSettingsChoice).getByLabelText('Use settings from this archive'),
    ).toBeTruthy();
    expect(within(accountSettingsChoice).getByLabelText('Keep my current settings')).toBeTruthy();
    expect(within(dialog).queryByText(/volume_system/)).toBeNull();
    expect(within(dialog).queryByText(/private recipes/)).toBeNull();
    expect(within(dialog).queryByRole('heading', { name: 'Import preview' })).toBeNull();
    expect(within(dialog).queryByRole('list', { name: 'Import conflicts' })).toBeNull();
    const importButton = within(dialog).getByRole('button', { name: 'Import database' });
    expect((importButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText('Replace existing entries'));
    expect((importButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText('Use settings from this archive'));
    expect((importButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(importButton);

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
      path: importPath,
      choices: {
        'publication:cccccccc-cccc-4ccc-8ccc-cccccccccccc': {
          action: 'replace',
          targetId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        },
        'recipe:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee': {
          action: 'replace',
          targetId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        },
      },
      rootVersions: [
        {
          kind: 'publication',
          incomingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          targetId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          version: 3,
        },
        {
          kind: 'recipe',
          incomingId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          targetId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          version: 5,
        },
      ],
      accountPreferencesAction: 'archive',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toBe('Import complete.');
  });

  it('duplicates a recipe into the selected destination and navigates to it', async () => {
    const recipeId = '99999999-9999-4999-8999-999999999999';
    const importedRecipeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const sourcePublicationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const destinationPublicationId = '88888888-8888-4888-8888-888888888888';
    const otherPublicationId = '77777777-7777-4777-8777-777777777777';
    const preview = {
      scope: { type: 'recipe' as const, id: importedRecipeId },
      incomingRecipes: [{ id: importedRecipeId, name: 'Lemon cake' }],
      sourcePublication: {
        id: sourcePublicationId,
        name: 'Baking Annual',
        destinationId: destinationPublicationId,
        willCreate: false,
      },
      destinationPublications: [
        { id: destinationPublicationId, name: 'Baking Annual', publicationType: 'book' },
        { id: otherPublicationId, name: 'Weeknight Cooking', publicationType: 'magazine' },
      ],
      counts: { recipes: 1, publications: 1 },
      mediaCount: 0,
      preferences: [],
      privacy: { privateRecipes: 1, publicRecipes: 0 },
      conflicts: [
        {
          kind: 'recipe' as const,
          incomingId: importedRecipeId,
          incomingName: 'Lemon cake',
          candidates: [
            { id: '66666666-6666-4666-8666-666666666666', name: 'Lemon cake', version: 4 },
          ],
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ path: importPath, token: 'signed-token' }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ imported: true, destination: { type: 'recipe', id: recipeId } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cancelled: true, cleanupPending: false }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<ImportAction compact scope={{ type: 'recipe' }} triggerLabel="Import recipe" />);
    fireEvent.click(screen.getByRole('button', { name: 'Import recipe' }));
    fireEvent.change(screen.getByLabelText('Recipe archive'), {
      target: { files: [new File(['archive'], 'recipe.zip', { type: 'application/zip' })] },
    });
    const recipeChoice = await screen.findByRole('group', { name: 'Import choice for Lemon cake' });
    fireEvent.click(within(recipeChoice).getByRole('radio', { name: 'Duplicate' }));
    await choosePicklistOption('Destination publication', 'Weeknight Cooking');

    expect(screen.getByText('recipe.zip')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review recipe' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel import' })).toBeNull();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Import recipe' }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/recipes/${recipeId}`));
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
      expectedScope: 'recipe',
      recipeDestinationPublicationIds: {
        [importedRecipeId]: otherPublicationId,
      },
    });
  });

  it('creates a matched recipe in the current publication without offering destinations', async () => {
    const recipeId = '99999999-9999-4999-8999-999999999999';
    const importedRecipeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const sourcePublicationId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const existingPublicationId = '77777777-7777-4777-8777-777777777777';
    const currentPublicationId = '88888888-8888-4888-8888-888888888888';
    const preview = {
      scope: { type: 'recipe' as const, id: importedRecipeId },
      incomingRecipes: [{ id: importedRecipeId, name: 'Lemon cake' }],
      sourcePublication: {
        id: sourcePublicationId,
        name: 'Baking Annual',
        destinationId: existingPublicationId,
        willCreate: false,
      },
      destinationPublications: [
        { id: existingPublicationId, name: 'Baking Annual', publicationType: 'book' },
        { id: currentPublicationId, name: 'Weeknight Cooking', publicationType: 'magazine' },
      ],
      defaultDestinationPublicationId: existingPublicationId,
      counts: { recipes: 1, publications: 1 },
      mediaCount: 0,
      preferences: [],
      privacy: { privateRecipes: 1, publicRecipes: 0 },
      conflicts: [
        {
          kind: 'recipe' as const,
          incomingId: importedRecipeId,
          incomingName: 'Lemon cake',
          candidates: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              name: 'Lemon cake',
              publicationId: existingPublicationId,
              publicationName: 'Baking Annual',
              version: 4,
            },
          ],
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ path: importPath, token: 'signed-token' }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ imported: true, destination: { type: 'recipe', id: recipeId } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cancelled: true, cleanupPending: false }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ImportAction
        compact
        scope={{ type: 'recipe' }}
        targetPublicationId={currentPublicationId}
        triggerLabel="Import recipe"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import recipe' }));
    fireEvent.change(screen.getByLabelText('Recipe archive'), {
      target: { files: [new File(['archive'], 'recipe.zip', { type: 'application/zip' })] },
    });
    const recipeChoice = await screen.findByRole('group', { name: 'Import choice for Lemon cake' });
    expect(
      screen.getByText(
        (_content, element) =>
          element?.textContent?.replace(/\s+/g, ' ').trim() === 'Existing recipe in Baking Annual.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(recipeChoice).getByRole('radio', { name: 'Create here' }));

    expect(
      (within(recipeChoice).getByRole('radio', { name: 'Create here' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.queryByLabelText('Destination publication')).toBeNull();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Import recipe' }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/recipes/${recipeId}`));
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
      recipeDestinationPublicationIds: {
        [importedRecipeId]: currentPublicationId,
      },
    });
  });

  it('replaces the selected ZIP after removing its previous temporary upload', async () => {
    const firstPath = importPath;
    const secondPath =
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/imports/cccccccc-cccc-4ccc-8ccc-cccccccccccc.zip';
    const preview = (recipes: number) => ({
      scope: { type: 'database' as const },
      incomingRecipes: [],
      destinationPublications: [],
      counts: { recipes, publications: 0 },
      mediaCount: 0,
      preferences: [],
      privacy: { privateRecipes: 0, publicRecipes: 0 },
      conflicts: [],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ path: firstPath, token: 'first-token' }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(preview(1)), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cancelled: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ path: secondPath, token: 'second-token' }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(preview(2)), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<DatabaseImportAction />);
    fireEvent.click(screen.getByRole('button', { name: 'Import database' }));
    const archiveInput = screen.getByLabelText('Database archive');
    fireEvent.change(archiveInput, {
      target: { files: [new File(['first'], 'first.zip', { type: 'application/zip' })] },
    });
    expect(await screen.findByText('1 recipes, 0 publications, 0 images')).toBeTruthy();

    const chooseAnother = screen.getByRole('button', { name: 'Import ZIP' });
    expect((chooseAnother as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(chooseAnother);
    fireEvent.change(archiveInput, {
      target: { files: [new File(['second'], 'second.zip', { type: 'application/zip' })] },
    });

    expect(await screen.findByText('second.zip')).toBeTruthy();
    expect(await screen.findByText('2 recipes, 0 publications, 0 images')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls[2]).toMatchObject([
      '/api/imports/uploads',
      {
        method: 'DELETE',
        body: JSON.stringify({ path: firstPath }),
      },
    ]);
  });

  it('requires Replace or Duplicate for scoped recipe conflicts without offering Ignore', async () => {
    const recipeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const preview = {
      scope: { type: 'recipe' as const, id: recipeId },
      incomingRecipes: [{ id: recipeId, name: 'Milk Toast' }],
      sourcePublication: null,
      destinationPublications: [],
      defaultDestinationPublicationId: '77777777-7777-4777-8777-777777777777',
      counts: { recipes: 1, publications: 1 },
      mediaCount: 0,
      preferences: [],
      privacy: { privateRecipes: 1, publicRecipes: 0 },
      conflicts: [
        {
          kind: 'recipe' as const,
          incomingId: recipeId,
          incomingName: 'Milk Toast',
          candidates: [
            { id: '66666666-6666-4666-8666-666666666666', name: 'Milk Toast', version: 2 },
          ],
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ path: importPath, token: 'signed-token' }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ImportAction compact scope={{ type: 'recipe' }} triggerLabel="Import recipe" />);
    fireEvent.click(screen.getByRole('button', { name: 'Import recipe' }));
    fireEvent.change(screen.getByLabelText('Recipe archive'), {
      target: { files: [new File(['archive'], 'milk-toast.zip', { type: 'application/zip' })] },
    });
    const dialog = screen.getByRole('dialog');
    const choice = await within(dialog).findByRole('group', {
      name: 'Import choice for Milk Toast',
    });
    expect(within(choice).getByRole('radio', { name: 'Replace' })).toBeTruthy();
    expect(within(choice).getByRole('radio', { name: 'Duplicate' })).toBeTruthy();
    expect(within(choice).queryByRole('radio', { name: 'Ignore' })).toBeNull();
    const importButton = within(dialog).getByRole('button', { name: 'Import recipe' });
    expect((importButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(choice).getByRole('radio', { name: 'Duplicate' }));
    expect((importButton as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
