import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, refresh } = vi.hoisted(() => ({
  createClient: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../src/lib/supabase/browser', () => ({ createClient }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { DatabaseImportAction } from '../../src/app/settings/database-import-action';

const importPath =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/imports/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.zip';

describe('database import action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockReturnValue({
      storage: {
        from: vi.fn(() => ({ uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }) })),
      },
    });
  });

  it('uploads, previews, requires a conflict choice, commits, and cleans up the archive', async () => {
    const preview = {
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
    fireEvent.change(screen.getByLabelText('Database archive'), {
      target: { files: [new File(['archive'], 'backup.zip', { type: 'application/zip' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));

    expect(await screen.findByRole('heading', { name: 'Import preview' })).toBeTruthy();
    const importButton = screen.getByRole('button', { name: 'Import database' });
    expect((importButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Import choice for Baking Annual'), {
      target: { value: 'replace' },
    });
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
      },
      rootVersions: [
        {
          kind: 'publication',
          incomingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          targetId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          version: 3,
        },
      ],
    });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Import complete.'));
  });
});
