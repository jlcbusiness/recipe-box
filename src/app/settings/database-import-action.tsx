'use client';

import { RefreshCw, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createClient } from '../../lib/supabase/browser';

type ImportAction = '' | 'keep' | 'duplicate' | 'replace';

type ImportCandidate = {
  id: string;
  name: string;
  version: number | null;
};

type ImportConflict = {
  kind: 'recipe' | 'publication';
  incomingId: string;
  incomingName: string;
  candidates: ImportCandidate[];
};

type ImportPreview = {
  counts: Record<string, number>;
  mediaCount: number;
  preferences: string[];
  privacy: { privateRecipes: number; publicRecipes: number };
  conflicts: ImportConflict[];
};

type Selection = { action: ImportAction; targetId: string };
type BusyAction = 'preview' | 'commit' | 'cancel' | null;

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || fallback;
}

function selectionsFor(conflicts: ImportConflict[]): Record<string, Selection> {
  return Object.fromEntries(
    conflicts.map((conflict) => [
      `${conflict.kind}:${conflict.incomingId}`,
      { action: '', targetId: conflict.candidates.length === 1 ? conflict.candidates[0].id : '' },
    ]),
  );
}

export function DatabaseImportAction() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [archivePath, setArchivePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [busy, setBusy] = useState<BusyAction>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const canCommit = Boolean(
    preview?.conflicts.every((conflict) => {
      const selection = selections[`${conflict.kind}:${conflict.incomingId}`];
      const candidate = conflict.candidates.find((item) => item.id === selection?.targetId);
      return Boolean(selection?.action && candidate?.version);
    }),
  );

  function resetSelection() {
    setFile(null);
    setArchivePath(null);
    setPreview(null);
    setSelections({});
    setNeedsRefresh(false);
    if (fileInput.current) fileInput.current.value = '';
    requestAnimationFrame(() => fileInput.current?.focus());
  }

  async function loadPreview(path: string) {
    setBusy('preview');
    setError('');
    setStatus('Validating the database archive...');
    try {
      const response = await fetch('/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to preview this archive.'));
      }
      const result = (await response.json()) as ImportPreview;
      setPreview(result);
      setSelections(selectionsFor(result.conflicts));
      setNeedsRefresh(false);
      setStatus('Preview ready.');
    } catch (previewError) {
      setPreview(null);
      setError(
        previewError instanceof Error ? previewError.message : 'Unable to preview this archive.',
      );
      setStatus('');
    } finally {
      setBusy(null);
    }
  }

  async function prepareImport() {
    if (!file || busy) return;
    setBusy('preview');
    setError('');
    setStatus('Preparing a secure upload...');
    try {
      const grantResponse = await fetch('/api/imports/uploads', { method: 'POST' });
      if (!grantResponse.ok) {
        throw new Error(await responseError(grantResponse, 'Unable to start this import.'));
      }
      const grant = (await grantResponse.json()) as { path: string; token: string };
      setArchivePath(grant.path);
      setStatus('Uploading the database archive...');
      const storage = createClient();
      const { error: uploadError } = await storage.storage
        .from('recipe-exports')
        .uploadToSignedUrl(grant.path, grant.token, file, {
          contentType: 'application/zip',
          upsert: false,
        });
      if (uploadError) {
        throw new Error('Unable to upload this archive. Cancel the import and try again.');
      }
      setBusy(null);
      await loadPreview(grant.path);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'Unable to upload this archive.',
      );
      setStatus('');
      setBusy(null);
    }
  }

  async function cancelImport() {
    if (busy) return;
    setError('');
    if (!archivePath) {
      resetSelection();
      setStatus('Import cancelled.');
      return;
    }

    setBusy('cancel');
    setStatus('Removing the temporary archive...');
    try {
      const response = await fetch('/api/imports/uploads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: archivePath }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to remove the temporary archive.'));
      }
      resetSelection();
      setStatus('Import cancelled.');
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : 'Unable to cancel this import.',
      );
      setStatus('');
    } finally {
      setBusy(null);
    }
  }

  async function commitImport() {
    if (!preview || !archivePath || !canCommit || busy) return;
    setBusy('commit');
    setError('');
    setNeedsRefresh(false);
    setStatus('Importing the reviewed database...');
    const choices = Object.fromEntries(
      preview.conflicts.map((conflict) => {
        const key = `${conflict.kind}:${conflict.incomingId}`;
        const selection = selections[key];
        return [key, { action: selection.action, targetId: selection.targetId }];
      }),
    );
    const rootVersions = preview.conflicts.map((conflict) => {
      const selection = selections[`${conflict.kind}:${conflict.incomingId}`];
      const candidate = conflict.candidates.find((item) => item.id === selection.targetId);
      return {
        kind: conflict.kind,
        incomingId: conflict.incomingId,
        targetId: selection.targetId,
        version: candidate?.version,
      };
    });

    try {
      const response = await fetch('/api/imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: archivePath, choices, rootVersions }),
      });
      if (!response.ok) {
        setNeedsRefresh(response.status === 409);
        throw new Error(await responseError(response, 'Unable to import this archive.'));
      }

      const cleanup = await fetch('/api/imports/uploads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: archivePath }),
      }).catch(() => null);
      const cleanupPending = !cleanup?.ok;
      resetSelection();
      setStatus(
        cleanupPending
          ? 'Import complete. Temporary archive cleanup is queued for retry.'
          : 'Import complete.',
      );
      router.refresh();
    } catch (commitError) {
      setError(
        commitError instanceof Error ? commitError.message : 'Unable to import this archive.',
      );
      setStatus('');
    } finally {
      setBusy(null);
    }
  }

  function updateSelection(key: string, selection: Partial<Selection>) {
    setSelections((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { action: '', targetId: '' }), ...selection },
    }));
  }

  return (
    <div className="database-import-action">
      <label className="database-import-file-label" htmlFor="database-import-file">
        Database archive
      </label>
      <input
        accept=".zip,application/zip"
        disabled={Boolean(archivePath) || busy !== null}
        id="database-import-file"
        onChange={(event) => {
          const selected = event.currentTarget.files?.[0] ?? null;
          setFile(selected);
          setPreview(null);
          setError('');
          setStatus('');
        }}
        ref={fileInput}
        type="file"
      />
      {file && !preview && !archivePath && (
        <button
          className="recipe-secondary-button database-import-button"
          disabled={busy !== null}
          onClick={prepareImport}
          type="button"
        >
          <Upload aria-hidden="true" size={16} />
          <span>Preview import</span>
        </button>
      )}

      {busy === 'preview' && <progress aria-label="Import preparation" />}

      {preview && (
        <section
          aria-labelledby="database-import-preview-title"
          className="database-import-preview"
        >
          <h3 id="database-import-preview-title">Import preview</h3>
          <p>
            {preview.counts.recipes ?? 0} recipes, {preview.counts.publications ?? 0} publications,{' '}
            {preview.mediaCount} images
          </p>
          <p>
            {preview.privacy.privateRecipes} private recipes, {preview.privacy.publicRecipes} public
            recipes
          </p>
          {preview.preferences.length > 0 && (
            <p>Account preferences to update: {preview.preferences.join(', ')}</p>
          )}
          {preview.conflicts.length > 0 ? (
            <ul className="database-import-conflicts" aria-label="Import conflicts">
              {preview.conflicts.map((conflict) => {
                const key = `${conflict.kind}:${conflict.incomingId}`;
                const selection = selections[key] ?? { action: '', targetId: '' };
                return (
                  <li key={key}>
                    <strong>
                      {conflict.kind === 'recipe' ? 'Recipe' : 'Publication'}:{' '}
                      {conflict.incomingName}
                    </strong>
                    {conflict.candidates.length > 1 && (
                      <label>
                        Existing match
                        <select
                          onChange={(event) =>
                            updateSelection(key, { targetId: event.target.value })
                          }
                          value={selection.targetId}
                        >
                          <option value="">Choose a match</option>
                          {conflict.candidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Import choice
                      <select
                        aria-label={`Import choice for ${conflict.incomingName}`}
                        onChange={(event) =>
                          updateSelection(key, { action: event.target.value as ImportAction })
                        }
                        value={selection.action}
                      >
                        <option value="">Choose an action</option>
                        <option value="keep">Keep existing</option>
                        <option value="duplicate">Create duplicate</option>
                        <option value="replace">Replace</option>
                      </select>
                    </label>
                    {selection.action === 'replace' && (
                      <p className="database-import-warning">
                        Replace updates the selected record and its imported details.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No matching recipes or publications were found.</p>
          )}
          {needsRefresh && (
            <button
              className="recipe-secondary-button database-import-button"
              disabled={busy !== null}
              onClick={() => archivePath && void loadPreview(archivePath)}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={16} />
              <span>Refresh preview</span>
            </button>
          )}
          <button
            className="recipe-secondary-button database-import-button"
            disabled={!canCommit || busy !== null}
            onClick={commitImport}
            type="button"
          >
            <Upload aria-hidden="true" size={16} />
            <span>Import database</span>
          </button>
        </section>
      )}

      {(file || archivePath) && (
        <button
          className="database-import-cancel"
          disabled={busy !== null}
          onClick={cancelImport}
          type="button"
        >
          <X aria-hidden="true" size={16} />
          <span>Cancel import</span>
        </button>
      )}
      {status && (
        <p aria-live="polite" className="database-import-feedback" role="status">
          {status}
        </p>
      )}
      {error && (
        <p
          aria-live="assertive"
          className="database-import-feedback database-import-error"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
