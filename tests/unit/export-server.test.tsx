import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExportSnapshot } from '../../src/lib/exports/rules';
import { createExportDownload, processExportCleanup } from '../../src/lib/exports/server';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const snapshot: ExportSnapshot = { accountPreferences: {}, records: {} };

function createAdmin(options: {
  failUpload?: boolean;
  failCleanupQueue?: boolean;
  failSignedUrl?: boolean;
  failTimestampUpdate?: boolean;
  afterUploadChunk?: () => void;
}) {
  const upload = vi.fn(async (path: string, archive: AsyncIterable<Uint8Array>) => {
    if (options.failUpload) {
      return { data: null, error: new Error('storage upload failed') };
    }

    for await (const _chunk of archive) {
      void _chunk;
      options.afterUploadChunk?.();
    }
    return { data: { path }, error: null };
  });
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const createSignedUrl = vi.fn(async () =>
    options.failSignedUrl
      ? { data: null, error: new Error('signed URL unavailable') }
      : {
          data: { signedUrl: 'https://exports.example.test/archive.zip' },
          error: null,
        },
  );
  const insert = vi.fn(async () => ({
    data: null,
    error: options.failCleanupQueue ? new Error('cleanup queue unavailable') : null,
  }));
  const maybeSingle = vi.fn(async () => ({
    data: options.failTimestampUpdate ? null : { id: accountId },
    error: options.failTimestampUpdate ? new Error('timestamp update failed') : null,
  }));
  const accountUpdate = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({ maybeSingle })),
    })),
  }));
  const from = vi.fn((table: string) =>
    table === 'accounts' ? { update: accountUpdate } : { insert },
  );

  return {
    admin: {
      storage: { from: vi.fn(() => ({ upload, remove, createSignedUrl })) },
      from,
    } as unknown as SupabaseClient,
    upload,
    remove,
    createSignedUrl,
    insert,
    accountUpdate,
    maybeSingle,
  };
}

type CleanupTask = {
  id: string;
  account_id: string;
  object_path: string;
  attempts: number;
};

function createCleanupAdmin(tasks: CleanupTask[], failRemoval = false) {
  const limit = vi.fn(async () => ({ data: tasks, error: null }));
  const order = vi.fn(() => ({ limit }));
  const lte = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ lte }));
  const updateEq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const deleteEq = vi.fn(async () => ({ error: null }));
  const deleteTask = vi.fn(() => ({ eq: deleteEq }));
  const remove = vi.fn(async () => ({
    data: null,
    error: failRemoval ? new Error('storage remove failed') : null,
  }));

  return {
    admin: {
      from: vi.fn(() => ({ select, update, delete: deleteTask })),
      storage: { from: vi.fn(() => ({ remove })) },
    } as unknown as SupabaseClient,
    select,
    lte,
    order,
    limit,
    update,
    updateEq,
    deleteTask,
    deleteEq,
    remove,
  };
}

describe('export archive failure cleanup', () => {
  it('removes an incomplete archive after Storage upload fails', async () => {
    const mock = createAdmin({ failUpload: true });

    await expect(
      createExportDownload(mock.admin, accountId, snapshot, { type: 'database' }),
    ).rejects.toThrow('Unable to prepare the export. Please try again.');

    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.remove).toHaveBeenCalledOnce();
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.createSignedUrl).not.toHaveBeenCalled();
  });

  it('removes an uploaded archive when cleanup cannot be queued', async () => {
    const mock = createAdmin({ failCleanupQueue: true });

    await expect(
      createExportDownload(mock.admin, accountId, snapshot, { type: 'database' }),
    ).rejects.toThrow('Unable to prepare the export. Please try again.');

    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.insert).toHaveBeenCalledOnce();
    expect(mock.remove).toHaveBeenCalledOnce();
    expect(mock.createSignedUrl).not.toHaveBeenCalled();
  });

  it('leaves a queued archive for cleanup when signed URL creation fails', async () => {
    const mock = createAdmin({ failSignedUrl: true });

    await expect(
      createExportDownload(mock.admin, accountId, snapshot, { type: 'database' }),
    ).rejects.toThrow('Unable to prepare the export. Please try again.');

    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.insert).toHaveBeenCalledOnce();
    expect(mock.createSignedUrl).toHaveBeenCalledOnce();
    expect(mock.accountUpdate).not.toHaveBeenCalled();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('does not report success or remove the queued archive when timestamp recording fails', async () => {
    const mock = createAdmin({ failTimestampUpdate: true });

    await expect(
      createExportDownload(mock.admin, accountId, snapshot, { type: 'database' }),
    ).rejects.toThrow('Unable to prepare the export. Please try again.');

    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.insert).toHaveBeenCalledOnce();
    expect(mock.createSignedUrl).toHaveBeenCalledOnce();
    expect(mock.accountUpdate).toHaveBeenCalledOnce();
    expect(mock.maybeSingle).toHaveBeenCalledOnce();
    expect(mock.remove).not.toHaveBeenCalled();
  });

  it('removes a partial archive when the request is aborted during upload', async () => {
    const controller = new AbortController();
    const mock = createAdmin({ afterUploadChunk: () => controller.abort() });

    await expect(
      createExportDownload(
        mock.admin,
        accountId,
        snapshot,
        { type: 'database' },
        controller.signal,
      ),
    ).rejects.toThrow('Unable to prepare the export. Please try again.');

    expect(mock.upload).toHaveBeenCalledOnce();
    expect(mock.remove).toHaveBeenCalledOnce();
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.createSignedUrl).not.toHaveBeenCalled();
    expect(mock.accountUpdate).not.toHaveBeenCalled();
  });
});

describe('export archive cleanup worker', () => {
  const task: CleanupTask = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    account_id: accountId,
    object_path: `${accountId}/exports/cccccccc-cccc-4ccc-8ccc-cccccccccccc.zip`,
    attempts: 2,
  };

  it('removes due archives and deletes their queue entries', async () => {
    const mock = createCleanupAdmin([task]);

    await expect(processExportCleanup(mock.admin)).resolves.toEqual({ processed: 1, failed: [] });

    expect(mock.lte).toHaveBeenCalledWith('delete_after', expect.any(String));
    expect(mock.order).toHaveBeenCalledWith('delete_after');
    expect(mock.limit).toHaveBeenCalledWith(100);
    expect(mock.remove).toHaveBeenCalledWith([task.object_path]);
    expect(mock.deleteTask).toHaveBeenCalledOnce();
    expect(mock.deleteEq).toHaveBeenCalledWith('id', task.id);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('increments attempts and retains the queue entry when Storage removal fails', async () => {
    const mock = createCleanupAdmin([task], true);

    await expect(processExportCleanup(mock.admin)).resolves.toEqual({
      processed: 0,
      failed: [task.object_path],
    });

    expect(mock.remove).toHaveBeenCalledWith([task.object_path]);
    expect(mock.update).toHaveBeenCalledWith({
      attempts: task.attempts + 1,
      last_error: 'Unable to remove export archive.',
    });
    expect(mock.updateEq).toHaveBeenCalledWith('id', task.id);
    expect(mock.deleteTask).not.toHaveBeenCalled();
  });

  it('does not delete an archive outside the queued account export path', async () => {
    const foreignTask = {
      ...task,
      object_path: `dddddddd-dddd-4ddd-8ddd-dddddddddddd/exports/archive.zip`,
    };
    const mock = createCleanupAdmin([foreignTask]);

    await expect(processExportCleanup(mock.admin)).resolves.toEqual({
      processed: 0,
      failed: [foreignTask.object_path],
    });

    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.update).toHaveBeenCalledWith({
      attempts: task.attempts + 1,
      last_error: 'Unable to remove export archive.',
    });
    expect(mock.deleteTask).not.toHaveBeenCalled();
  });
});
