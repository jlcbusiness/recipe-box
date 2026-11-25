'use client';

import { Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type RefObject, useId, useRef, useState } from 'react';
import { createClient } from '../../lib/supabase/browser';
import { Picklist } from '../picklist';

type Choice = '' | 'keep' | 'duplicate';
type Candidate = {
  id: string;
  name: string;
  publicationId: string | null;
  publicationName: string;
  version: number | null;
};
type Conflict = {
  kind: 'recipe';
  incomingId: string;
  incomingName: string;
  candidates: Candidate[];
};
type Preview = {
  incomingRecipes: Array<{ id: string; name: string }>;
  destinationPublication: { id: string; name: string; publicationType: string };
  conflicts: Conflict[];
};
type Selection = { action: Choice; targetId: string };
type BusyAction = 'upload' | 'preview' | 'commit' | 'cancel' | null;

async function responseError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || fallback;
}

export function RecipeJsonImportAction({
  publicationId,
  triggerRef,
  returnFocusRef,
  triggerHidden = false,
  triggerClassName = '',
}: {
  publicationId: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  triggerHidden?: boolean;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileButton = useRef<HTMLButtonElement>(null);
  const internalTrigger = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? internalTrigger;
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadPath, setUploadPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [busy, setBusy] = useState<BusyAction>(null);
  const [status, setStatus] = useState('');
  const [completionNotice, setCompletionNotice] = useState('');
  const [error, setError] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const canCommit = Boolean(
    preview?.conflicts.every((conflict) => {
      const selection = selections[`recipe:${conflict.incomingId}`];
      const candidate = conflict.candidates.find((item) => item.id === selection?.targetId);
      return Boolean(selection?.action && candidate?.version);
    }),
  );

  function closeDialog() {
    dialog.current?.close();
    requestAnimationFrame(() => (returnFocusRef.current ?? trigger.current)?.focus());
  }

  function resetSelection() {
    setFile(null);
    setUploadPath(null);
    setPreview(null);
    setSelections({});
    setNeedsRefresh(false);
    setStatus('');
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function loadPreview(path: string) {
    setBusy('preview');
    setError('');
    setStatus('Validating recipe JSON...');
    try {
      const response = await fetch('/api/imports/json/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, targetPublicationId: publicationId }),
      });
      if (!response.ok) {
        if (response.status === 409) setNeedsRefresh(true);
        throw new Error(await responseError(response, 'Unable to preview this JSON file.'));
      }
      const result = (await response.json()) as Preview;
      setPreview(result);
      setSelections(
        Object.fromEntries(
          result.conflicts.map((conflict) => [
            `recipe:${conflict.incomingId}`,
            {
              action: '',
              targetId: conflict.candidates.length === 1 ? conflict.candidates[0].id : '',
            },
          ]),
        ),
      );
      setNeedsRefresh(false);
      setStatus('Preview ready.');
    } catch (previewError) {
      setPreview(null);
      setError(
        previewError instanceof Error ? previewError.message : 'Unable to preview this JSON file.',
      );
      setStatus('');
    } finally {
      setBusy(null);
    }
  }

  async function prepareImport(selectedFile: File) {
    if (busy) return;
    setBusy('upload');
    setError('');
    setStatus('Preparing a secure upload...');
    try {
      const extension = /\.jsonc?$/iu.exec(selectedFile.name)?.[0]?.slice(1).toLowerCase();
      if (!extension) throw new Error('Choose a .json or .jsonc file.');
      if (selectedFile.size > 64 * 1024 * 1024) {
        throw new Error('The JSON file exceeds the 64 MiB size limit.');
      }
      if (uploadPath) {
        const cleanupResponse = await fetch('/api/imports/uploads', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: uploadPath }),
        });
        if (!cleanupResponse.ok) {
          throw new Error(
            await responseError(cleanupResponse, 'Unable to remove the previous file.'),
          );
        }
        setUploadPath(null);
      }

      const grantResponse = await fetch('/api/imports/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'recipe-json', extension }),
      });
      if (!grantResponse.ok) {
        throw new Error(await responseError(grantResponse, 'Unable to start this JSON import.'));
      }
      const grant = (await grantResponse.json()) as { path: string; token: string };
      setUploadPath(grant.path);
      setStatus('Uploading recipe JSON...');
      const storage = createClient();
      const { error: uploadError } = await storage.storage
        .from('recipe-exports')
        .uploadToSignedUrl(grant.path, grant.token, selectedFile, {
          contentType: 'application/json',
          upsert: false,
        });
      if (uploadError) {
        throw new Error('Unable to upload this JSON file. Cancel the import and try again.');
      }
      setBusy(null);
      await loadPreview(grant.path);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'Unable to upload this JSON file.',
      );
      setStatus('');
      setBusy(null);
    }
  }

  async function cancelImport() {
    if (busy) return;
    setError('');
    if (!uploadPath) {
      resetSelection();
      closeDialog();
      setCompletionNotice('Import cancelled.');
      return;
    }
    setBusy('cancel');
    setStatus('Removing the temporary JSON file...');
    try {
      const response = await fetch('/api/imports/uploads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: uploadPath }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to remove the temporary JSON file.'));
      }
      resetSelection();
      closeDialog();
      setCompletionNotice('Import cancelled.');
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
    if (!preview || !uploadPath || !canCommit || busy) return;
    setBusy('commit');
    setError('');
    setNeedsRefresh(false);
    setStatus('Importing recipes...');
    const choices = Object.fromEntries(
      preview.conflicts.map((conflict) => {
        const key = `recipe:${conflict.incomingId}`;
        const selection = selections[key];
        return [key, { action: selection.action, targetId: selection.targetId }];
      }),
    );
    const rootVersions = preview.conflicts.map((conflict) => {
      const selection = selections[`recipe:${conflict.incomingId}`];
      const candidate = conflict.candidates.find((item) => item.id === selection.targetId);
      return {
        incomingId: conflict.incomingId,
        targetId: selection.targetId,
        version: candidate?.version,
      };
    });

    try {
      const response = await fetch('/api/imports/json/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: uploadPath,
          targetPublicationId: publicationId,
          choices,
          rootVersions,
        }),
      });
      if (!response.ok) {
        if (response.status === 409) setNeedsRefresh(true);
        throw new Error(await responseError(response, 'Unable to import this JSON file.'));
      }
      const result = (await response.json()) as {
        importedCount: number;
        keptCount: number;
      };
      const cleanup = await fetch('/api/imports/uploads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: uploadPath }),
      }).catch(() => null);
      const completion =
        result.importedCount === 0
          ? 'No changes were made; all matching recipes were kept.'
          : `Imported ${result.importedCount} recipe(s). Kept ${result.keptCount} existing recipe(s).`;
      resetSelection();
      closeDialog();
      setCompletionNotice(
        cleanup?.ok ? completion : `${completion} Temporary-file cleanup is queued for retry.`,
      );
      router.refresh();
    } catch (commitError) {
      setError(
        commitError instanceof Error ? commitError.message : 'Unable to import this JSON file.',
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
    <>
      <button
        aria-hidden={triggerHidden || undefined}
        aria-label="Import JSON file"
        className={`database-import-trigger recipe-secondary-button ${triggerClassName}`.trim()}
        onClick={() => {
          setCompletionNotice('');
          dialog.current?.showModal();
          requestAnimationFrame(() => fileButton.current?.focus());
        }}
        ref={trigger}
        tabIndex={triggerHidden ? -1 : undefined}
        title="Import JSON file"
        type="button"
      >
        <Upload aria-hidden="true" size={16} />
        <span>Import JSON file</span>
      </button>
      <dialog
        aria-labelledby={`${inputId}-dialog-title`}
        className="database-import-dialog recipe-json-import-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) void cancelImport();
        }}
        ref={dialog}
      >
        <div className="database-import-dialog-heading">
          <h2 id={`${inputId}-dialog-title`}>Import JSON file</h2>
          <button
            aria-label="Close import dialog"
            className="database-import-dialog-close"
            disabled={busy !== null}
            onClick={cancelImport}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="database-import-action">
          <div className="database-import-file-row">
            <button
              className="recipe-secondary-button database-import-file-button"
              disabled={busy !== null}
              onClick={() => {
                if (fileInput.current) fileInput.current.value = '';
                fileInput.current?.click();
              }}
              ref={fileButton}
              type="button"
            >
              <Upload aria-hidden="true" size={16} />
              <span>{file ? 'Choose another JSON file' : 'Choose JSON file'}</span>
            </button>
            {file && <span className="database-import-filename">{file.name}</span>}
            {preview && (
              <span className="database-import-counts">
                {preview.incomingRecipes.length} recipes
              </span>
            )}
          </div>
          <input
            accept=".json,.jsonc,application/json,application/jsonc"
            aria-label="Recipe JSON file"
            className="database-import-file-input"
            disabled={busy !== null}
            id={inputId}
            onChange={(event) => {
              const selected = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = '';
              if (!selected) return;
              setFile(selected);
              setPreview(null);
              setSelections({});
              setNeedsRefresh(false);
              setCompletionNotice('');
              void prepareImport(selected);
            }}
            ref={fileInput}
            type="file"
          />
          {busy && <progress aria-label="JSON import preparation" />}

          {preview && (
            <section aria-label="Import details" className="database-import-preview">
              <p>
                Add {preview.incomingRecipes.length} recipe(s) to{' '}
                {preview.destinationPublication.name}.
              </p>
              <ol className="recipe-json-import-recipe-list" aria-label="Incoming recipes">
                {preview.incomingRecipes.map((recipe) => (
                  <li key={recipe.id}>{recipe.name}</li>
                ))}
              </ol>
              {preview.conflicts.length > 0 ? (
                <ul className="database-import-conflicts" aria-label="Existing recipe matches">
                  {preview.conflicts.map((conflict) => {
                    const key = `recipe:${conflict.incomingId}`;
                    const selection = selections[key] ?? { action: '', targetId: '' };
                    const selectedCandidate = conflict.candidates.find(
                      (candidate) => candidate.id === selection.targetId,
                    );
                    return (
                      <li key={key}>
                        <strong>{conflict.incomingName}</strong>
                        {conflict.candidates.length > 1 ? (
                          <div className="database-import-field">
                            <span>Existing match</span>
                            <Picklist
                              className="database-import-picklist"
                              label={`Existing match for ${conflict.incomingName}`}
                              menuClassName="database-import-picklist-menu"
                              onSelect={(targetId) => updateSelection(key, { targetId })}
                              options={[
                                { value: '', label: 'Choose a match' },
                                ...conflict.candidates.map((candidate) => ({
                                  value: candidate.id,
                                  label: `${candidate.name} - ${candidate.publicationName}`,
                                })),
                              ]}
                              sizeToContent={false}
                              value={selection.targetId}
                            />
                          </div>
                        ) : (
                          selectedCandidate && (
                            <p>Existing recipe in {selectedCandidate.publicationName}.</p>
                          )
                        )}
                        <fieldset
                          aria-label={`Import choice for ${conflict.incomingName}`}
                          className="database-import-recipe-choice"
                        >
                          <legend>Import choice</legend>
                          <label>
                            <input
                              checked={selection.action === 'keep'}
                              name={`${inputId}-${conflict.incomingId}-action`}
                              onChange={() => updateSelection(key, { action: 'keep' })}
                              type="radio"
                              value="keep"
                            />
                            <span>Keep existing</span>
                          </label>
                          <label>
                            <input
                              checked={selection.action === 'duplicate'}
                              name={`${inputId}-${conflict.incomingId}-action`}
                              onChange={() => updateSelection(key, { action: 'duplicate' })}
                              type="radio"
                              value="duplicate"
                            />
                            <span>Create duplicate</span>
                          </label>
                        </fieldset>
                        {selection.action === 'duplicate' && (
                          <p>
                            The duplicate will be added to {preview.destinationPublication.name}.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>No existing recipe-name matches were found.</p>
              )}
              {needsRefresh && (
                <button
                  className="recipe-secondary-button database-import-button"
                  disabled={busy !== null}
                  onClick={() => uploadPath && void loadPreview(uploadPath)}
                  type="button"
                >
                  Refresh preview
                </button>
              )}
              <button
                className="recipe-secondary-button database-import-button"
                disabled={!canCommit || busy !== null}
                onClick={commitImport}
                type="button"
              >
                <Upload aria-hidden="true" size={16} />
                <span>Import JSON</span>
              </button>
            </section>
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
      </dialog>
      {completionNotice && (
        <p aria-live="polite" className="database-import-feedback" role="status">
          {completionNotice}
        </p>
      )}
    </>
  );
}
