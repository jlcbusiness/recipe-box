'use client';

import { RefreshCw, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type RefObject, useId, useRef, useState } from 'react';
import { createClient } from '../../lib/supabase/browser';
import { Picklist, type PicklistOption } from '../picklist';

type ImportAction = '' | 'keep' | 'duplicate' | 'replace';
type DatabaseConflictAction = '' | 'keep' | 'replace';
type DatabasePreferencesAction = '' | 'archive' | 'keep';
type ImportScope = { type: 'database' | 'publication' | 'recipe' };

type ImportCandidate = {
  id: string;
  name: string;
  publicationId?: string | null;
  publicationName?: string | null;
  version: number | null;
};

type ImportConflict = {
  kind: 'recipe' | 'publication';
  incomingId: string;
  incomingName: string;
  candidates: ImportCandidate[];
};

type ImportPreview = {
  scope: { type: 'database' | 'publication' | 'recipe'; id?: string };
  sourcePublication?: {
    id: string;
    name: string;
    destinationId: string | null;
    willCreate: boolean;
    candidateCount: number;
  } | null;
  incomingRecipes: Array<{ id: string; name: string }>;
  destinationPublications: Array<{
    id: string;
    name: string;
    publicationType: string;
  }>;
  defaultDestinationPublicationId: string | null;
  counts: Record<string, number>;
  mediaCount: number;
  preferences: string[];
  privacy: { privateRecipes: number; publicRecipes: number };
  conflicts: ImportConflict[];
};

type Selection = { action: ImportAction; targetId: string };
type MissingPublicationAction = 'create' | 'destinations';

const accountPreferenceLabels: Record<string, string> = {
  volume_system: 'Volume units',
  weight_system: 'Weight units',
  ingredient_presentation: 'Ingredient presentation',
  hand_preference: 'Preferred hand',
  recipe_column_order: 'Recipe column order',
  recipe_hidden_columns: 'Hidden recipe columns',
};
type BusyAction = 'preview' | 'commit' | 'cancel' | null;
const omitRecipeOption = '__omit_recipe__';

type ImportActionProps = {
  scope: ImportScope;
  targetPublicationId?: string;
  triggerLabel?: string;
  compact?: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  triggerHidden?: boolean;
  triggerClassName?: string;
};

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

function sourceDestinationOption(preview: ImportPreview): PicklistOption {
  const source = preview.sourcePublication;
  return {
    value: preview.defaultDestinationPublicationId ?? '',
    label: source
      ? `${source.name}${source.willCreate ? ' (created automatically)' : ''}`
      : 'Recipe Tin',
  };
}

export function ImportAction({
  scope,
  targetPublicationId,
  triggerLabel,
  compact = false,
  triggerRef,
  returnFocusRef,
  triggerHidden = false,
  triggerClassName = '',
}: ImportActionProps) {
  const router = useRouter();
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileButton = useRef<HTMLButtonElement>(null);
  const internalTrigger = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? internalTrigger;
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [archivePath, setArchivePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [databaseConflictAction, setDatabaseConflictAction] = useState<DatabaseConflictAction>('');
  const [databasePreferencesAction, setDatabasePreferencesAction] =
    useState<DatabasePreferencesAction>('');
  const [destinationPublicationIds, setDestinationPublicationIds] = useState<
    Record<string, string>
  >({});
  const [missingPublicationAction, setMissingPublicationAction] =
    useState<MissingPublicationAction>('create');
  const [busy, setBusy] = useState<BusyAction>(null);
  const [status, setStatus] = useState('');
  const [completionNotice, setCompletionNotice] = useState('');
  const [error, setError] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const label =
    triggerLabel ??
    (scope.type === 'database'
      ? 'Import database'
      : scope.type === 'publication'
        ? 'Import publication'
        : 'Import recipe');
  const archiveLabel =
    scope.type === 'database'
      ? 'Database archive'
      : scope.type === 'publication'
        ? 'Publication archive'
        : 'Recipe archive';
  const ignoredRecipe = Boolean(
    preview?.scope.type === 'recipe' &&
      ((preview.conflicts.some((conflict) => conflict.kind === 'recipe') &&
        preview.conflicts
          .filter((conflict) => conflict.kind === 'recipe')
          .every((conflict) => selections[`recipe:${conflict.incomingId}`]?.action === 'keep')) ||
        (preview.scope.id && destinationPublicationIds[preview.scope.id] === omitRecipeOption)),
  );
  const publicationChoiceAction =
    preview?.scope.type === 'publication' && preview.scope.id
      ? selections[`publication:${preview.scope.id}`]?.action
      : '';
  const unmatchedSourcePublication = Boolean(
    preview?.scope.type === 'publication' && preview.sourcePublication?.candidateCount === 0,
  );
  const hasNoConflicts = preview?.conflicts.length === 0;
  const visibleConflicts = (preview?.conflicts ?? []).filter((conflict) => {
    if (preview?.scope.type === 'database') return false;
    if (conflict.kind !== 'recipe' || preview?.scope.type !== 'publication') return true;
    return !unmatchedSourcePublication && publicationChoiceAction === 'keep';
  });
  const ambiguousAutomaticRecipeReplace = Boolean(
    preview?.scope.type === 'publication' &&
      publicationChoiceAction === 'replace' &&
      preview.conflicts.some(
        (conflict) => conflict.kind === 'recipe' && conflict.candidates.length !== 1,
      ),
  );
  const destinationsReady = Boolean(
    unmatchedSourcePublication &&
      missingPublicationAction === 'destinations' &&
      preview?.incomingRecipes.every((recipe) => {
        const destinationId = destinationPublicationIds[recipe.id];
        return (
          destinationId === omitRecipeOption ||
          preview.destinationPublications.some((publication) => publication.id === destinationId)
        );
      }),
  );
  const canCommit = Boolean(
    preview &&
      (preview.scope.type !== 'database' ||
        preview.conflicts.length === 0 ||
        databaseConflictAction !== '') &&
      (preview.scope.type !== 'database' ||
        preview.preferences.length === 0 ||
        databasePreferencesAction !== '') &&
      !ignoredRecipe &&
      !ambiguousAutomaticRecipeReplace &&
      visibleConflicts.every((conflict) => {
        const selection = selections[`${conflict.kind}:${conflict.incomingId}`];
        const candidate = conflict.candidates.find((item) => item.id === selection?.targetId);
        return Boolean(selection?.action && candidate?.version);
      }) &&
      (!unmatchedSourcePublication || missingPublicationAction === 'create' || destinationsReady),
  );

  function resetSelection(keepDialogOpen = false) {
    setFile(null);
    setArchivePath(null);
    setPreview(null);
    setSelections({});
    setDatabaseConflictAction('');
    setDatabasePreferencesAction('');
    setDestinationPublicationIds({});
    setMissingPublicationAction('create');
    setNeedsRefresh(false);
    setCompletionNotice('');
    if (fileInput.current) fileInput.current.value = '';
    if (compact && !keepDialogOpen) dialog.current?.close();
    requestAnimationFrame(() => {
      if (compact && !keepDialogOpen) {
        (returnFocusRef?.current ?? trigger.current)?.focus();
      } else {
        fileButton.current?.focus();
      }
    });
  }

  async function loadPreview(path: string) {
    setBusy('preview');
    setError('');
    setStatus(`Validating the ${scope.type} archive...`);
    try {
      const response = await fetch('/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          expectedScope: scope.type,
        }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to preview this archive.'));
      }
      const result = (await response.json()) as ImportPreview;
      setPreview(result);
      setSelections(selectionsFor(result.conflicts));
      setDatabaseConflictAction('');
      setDatabasePreferencesAction('');
      const defaultDestination =
        targetPublicationId ?? result.defaultDestinationPublicationId ?? '';
      setDestinationPublicationIds(
        Object.fromEntries(result.incomingRecipes.map((recipe) => [recipe.id, defaultDestination])),
      );
      setMissingPublicationAction('create');
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

  async function prepareImport(
    selectedFile: File,
    previousArchivePath: string | null = archivePath,
  ) {
    if (busy) return;
    setBusy('preview');
    setError('');
    setStatus(
      previousArchivePath
        ? 'Removing the previous temporary archive...'
        : 'Preparing a secure upload...',
    );
    try {
      if (previousArchivePath) {
        const cleanupResponse = await fetch('/api/imports/uploads', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: previousArchivePath }),
        });
        if (!cleanupResponse.ok) {
          throw new Error(
            await responseError(cleanupResponse, 'Unable to remove the previous archive.'),
          );
        }
        setArchivePath(null);
        setStatus('Preparing a secure upload...');
      }
      const grantResponse = await fetch('/api/imports/uploads', { method: 'POST' });
      if (!grantResponse.ok) {
        throw new Error(await responseError(grantResponse, 'Unable to start this import.'));
      }
      const grant = (await grantResponse.json()) as { path: string; token: string };
      setArchivePath(grant.path);
      setStatus(`Uploading the ${scope.type} archive...`);
      const storage = createClient();
      const { error: uploadError } = await storage.storage
        .from('recipe-exports')
        .uploadToSignedUrl(grant.path, grant.token, selectedFile, {
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
    setStatus(`Importing ${scope.type}...`);
    const includeRecipeChoices =
      preview.scope.type !== 'publication' || publicationChoiceAction === 'keep';
    const choices = Object.fromEntries(
      preview.conflicts
        .filter((conflict) => conflict.kind !== 'recipe' || includeRecipeChoices)
        .map((conflict) => {
          const key = `${conflict.kind}:${conflict.incomingId}`;
          const selection = selections[key];
          return [
            key,
            preview.scope.type === 'database'
              ? {
                  action: databaseConflictAction === 'replace' ? 'replace' : 'keep',
                  targetId: conflict.candidates[0].id,
                }
              : { action: selection.action, targetId: selection.targetId },
          ];
        }),
    );
    const includeAutomaticRecipeVersions =
      preview.scope.type === 'publication' && publicationChoiceAction === 'replace';
    const rootVersions = preview.conflicts
      .filter(
        (conflict) =>
          conflict.kind !== 'recipe' || includeRecipeChoices || includeAutomaticRecipeVersions,
      )
      .map((conflict) => {
        const selection = selections[`${conflict.kind}:${conflict.incomingId}`];
        const targetId =
          preview.scope.type === 'database' ? conflict.candidates[0].id : selection.targetId;
        const candidate = conflict.candidates.find((item) => item.id === targetId);
        return {
          kind: conflict.kind,
          incomingId: conflict.incomingId,
          targetId,
          version: candidate?.version,
        };
      });
    const recipeDestinationPublicationIds = Object.fromEntries(
      Object.entries(destinationPublicationIds).filter(([recipeId, destinationId]) => {
        if (!destinationId || destinationId === omitRecipeOption) return false;
        if (preview.scope.type === 'recipe') return true;
        if (unmatchedSourcePublication && missingPublicationAction === 'destinations') return true;
        return (
          preview.scope.type === 'publication' &&
          publicationChoiceAction === 'keep' &&
          selections[`recipe:${recipeId}`]?.action === 'duplicate'
        );
      }),
    );
    const omitRecipeIds = Object.entries(destinationPublicationIds)
      .filter(([, destinationId]) => destinationId === omitRecipeOption)
      .map(([recipeId]) => recipeId);

    try {
      const response = await fetch('/api/imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: archivePath,
          expectedScope: scope.type,
          choices,
          rootVersions,
          recipeDestinationPublicationIds,
          omitRecipeIds,
          ...(preview.scope.type === 'database' && preview.preferences.length > 0
            ? { accountPreferencesAction: databasePreferencesAction }
            : {}),
          omitSourcePublication:
            unmatchedSourcePublication && missingPublicationAction === 'destinations',
        }),
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
      const result = (await response.json().catch(() => null)) as {
        ignored?: boolean;
        destination?: { type: 'publication' | 'recipe'; id: string } | null;
      } | null;
      const completionMessage = result?.ignored
        ? 'Recipe ignored. No changes were made.'
        : cleanupPending
          ? 'Import complete. Temporary archive cleanup is queued for retry.'
          : 'Import complete.';
      resetSelection();
      if (scope.type === 'database') {
        setStatus('');
        setCompletionNotice(completionMessage);
      } else {
        setStatus(completionMessage);
      }
      if (result?.destination?.id) {
        router.push(
          result.destination.type === 'publication'
            ? `/publications/${result.destination.id}`
            : `/recipes/${result.destination.id}`,
        );
      } else {
        router.refresh();
      }
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

  const importContent = (
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
          <span>{file ? 'Import ZIP' : 'Choose ZIP'}</span>
        </button>
        {file && <span className="database-import-filename">{file.name}</span>}
        {preview && (
          <span className="database-import-counts">
            {preview.counts.recipes ?? 0} recipes, {preview.counts.publications ?? 0} publications,{' '}
            {preview.mediaCount} images
          </span>
        )}
      </div>
      <input
        aria-label={archiveLabel}
        accept=".zip,application/zip"
        className="database-import-file-input"
        disabled={busy !== null}
        id={inputId}
        onChange={(event) => {
          const selected = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = '';
          if (!selected) return;
          const previousArchivePath = archivePath;
          setFile(selected);
          setPreview(null);
          setSelections({});
          setDatabaseConflictAction('');
          setDatabasePreferencesAction('');
          setDestinationPublicationIds({});
          setMissingPublicationAction('create');
          setNeedsRefresh(false);
          setCompletionNotice('');
          setError('');
          setStatus('');
          void prepareImport(selected, previousArchivePath);
        }}
        ref={fileInput}
        type="file"
      />
      {busy === 'preview' && <progress aria-label="Import preparation" />}

      {preview && (
        <section aria-label="Import details" className="database-import-preview">
          {preview.preferences.length > 0 &&
            (preview.scope.type === 'database' ? (
              <fieldset className="database-import-global-choice">
                <legend>Account settings</legend>
                <label>
                  <input
                    checked={databasePreferencesAction === 'archive'}
                    name={`${inputId}-database-preferences-action`}
                    onChange={() => setDatabasePreferencesAction('archive')}
                    type="radio"
                    value="archive"
                  />
                  Use settings from this archive
                </label>
                <label>
                  <input
                    checked={databasePreferencesAction === 'keep'}
                    name={`${inputId}-database-preferences-action`}
                    onChange={() => setDatabasePreferencesAction('keep')}
                    type="radio"
                    value="keep"
                  />
                  Keep my current settings
                </label>
                <p>
                  This choice applies to{' '}
                  {preview.preferences
                    .map(
                      (preference) =>
                        accountPreferenceLabels[preference] ?? preference.replaceAll('_', ' '),
                    )
                    .join(', ')}
                  .
                </p>
              </fieldset>
            ) : (
              <p className="database-import-preferences">
                Account settings are only changed by a database import.
              </p>
            ))}
          {preview.scope.type === 'database' && preview.conflicts.length > 0 && (
            <fieldset className="database-import-global-choice">
              <legend>Existing recipes and publications</legend>
              <label>
                <input
                  checked={databaseConflictAction === 'replace'}
                  name={`${inputId}-database-conflict-action`}
                  onChange={() => setDatabaseConflictAction('replace')}
                  type="radio"
                  value="replace"
                />
                Replace existing entries
              </label>
              <label>
                <input
                  checked={databaseConflictAction === 'keep'}
                  name={`${inputId}-database-conflict-action`}
                  onChange={() => setDatabaseConflictAction('keep')}
                  type="radio"
                  value="keep"
                />
                Ignore existing entries
              </label>
              <p>This choice applies to every matching recipe and publication in the database.</p>
            </fieldset>
          )}
          {unmatchedSourcePublication && preview.sourcePublication && (
            <fieldset className="database-import-source-choice">
              <legend>{preview.sourcePublication.name} was not found</legend>
              <label>
                <input
                  checked={missingPublicationAction === 'create'}
                  name={`${inputId}-missing-publication`}
                  onChange={() => setMissingPublicationAction('create')}
                  type="radio"
                  value="create"
                />
                Create New
              </label>
              <label>
                <input
                  checked={missingPublicationAction === 'destinations'}
                  name={`${inputId}-missing-publication`}
                  onChange={() => setMissingPublicationAction('destinations')}
                  type="radio"
                  value="destinations"
                />
                Don&apos;t - Choose Recipe Destinations
              </label>
            </fieldset>
          )}
          {visibleConflicts.length > 0 ? (
            <ul className="database-import-conflicts" aria-label="Import conflicts">
              {visibleConflicts.map((conflict) => {
                const key = `${conflict.kind}:${conflict.incomingId}`;
                const selection = selections[key] ?? { action: '', targetId: '' };
                const selectedCandidate = conflict.candidates.find(
                  (item) => item.id === selection.targetId,
                );
                const createHere = Boolean(
                  conflict.kind === 'recipe' &&
                    targetPublicationId &&
                    selectedCandidate &&
                    selectedCandidate.publicationId !== targetPublicationId,
                );
                return (
                  <li key={key}>
                    <strong>
                      {conflict.kind === 'recipe' ? 'Recipe' : 'Publication'}:{' '}
                      {conflict.incomingName}
                    </strong>
                    {conflict.kind === 'recipe' && selectedCandidate && (
                      <p>Existing recipe in {selectedCandidate.publicationName ?? 'Unfiled'}.</p>
                    )}
                    {conflict.candidates.length > 1 && (
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
                              label: `${candidate.name}${conflict.kind === 'recipe' ? ` - ${candidate.publicationName ?? 'Unfiled'}` : ''}`,
                            })),
                          ]}
                          sizeToContent={false}
                          value={selection.targetId}
                        />
                      </div>
                    )}
                    {conflict.kind === 'recipe' && preview.scope.type === 'recipe' ? (
                      <fieldset
                        aria-label={`Import choice for ${conflict.incomingName}`}
                        className="database-import-recipe-choice"
                      >
                        <legend>Import choice</legend>
                        <label>
                          <input
                            checked={selection.action === 'replace'}
                            name={`${inputId}-${key}-action`}
                            onChange={() => updateSelection(key, { action: 'replace' })}
                            type="radio"
                            value="replace"
                          />
                          <span>Replace</span>
                        </label>
                        <label>
                          <input
                            checked={selection.action === 'duplicate'}
                            name={`${inputId}-${key}-action`}
                            onChange={() => updateSelection(key, { action: 'duplicate' })}
                            type="radio"
                            value="duplicate"
                          />
                          <span>{createHere ? 'Create here' : 'Duplicate'}</span>
                        </label>
                      </fieldset>
                    ) : (
                      <div className="database-import-field">
                        <span>Import choice</span>
                        <Picklist
                          className="database-import-picklist"
                          label={`Import choice for ${conflict.incomingName}`}
                          menuClassName="database-import-picklist-menu"
                          onSelect={(action) =>
                            updateSelection(key, { action: action as ImportAction })
                          }
                          options={[
                            { value: '', label: 'Choose an action' },
                            ...(conflict.kind === 'recipe'
                              ? [
                                  { value: 'replace', label: 'Replace' },
                                  {
                                    value: 'duplicate',
                                    label: createHere ? 'Create here' : 'Duplicate',
                                  },
                                  { value: 'keep', label: 'Ignore' },
                                ]
                              : [
                                  { value: 'keep', label: 'Keep existing' },
                                  { value: 'duplicate', label: 'Create duplicate' },
                                  { value: 'replace', label: 'Replace' },
                                ]),
                          ]}
                          sizeToContent={false}
                          value={selection.action}
                        />
                      </div>
                    )}
                    {conflict.kind === 'recipe' &&
                      selection.action === 'duplicate' &&
                      !createHere && (
                        <div className="database-import-field">
                          <span>
                            {preview.scope.type === 'recipe'
                              ? 'Destination publication'
                              : `Destination publication for ${conflict.incomingName}`}
                          </span>
                          <Picklist
                            className="database-import-picklist"
                            label={
                              preview.scope.type === 'recipe'
                                ? 'Destination publication'
                                : `Destination publication for ${conflict.incomingName}`
                            }
                            menuClassName="database-import-picklist-menu"
                            onSelect={(value) =>
                              setDestinationPublicationIds((current) => ({
                                ...current,
                                [conflict.incomingId]: value,
                              }))
                            }
                            options={[
                              sourceDestinationOption(preview),
                              ...(preview.scope.type === 'recipe'
                                ? []
                                : [{ value: omitRecipeOption, label: "Don't import recipe" }]),
                              ...preview.destinationPublications
                                .filter(
                                  (publication) =>
                                    publication.id !== preview.defaultDestinationPublicationId,
                                )
                                .map((publication) => ({
                                  value: publication.id,
                                  label: publication.name,
                                })),
                            ]}
                            sizeToContent={false}
                            value={destinationPublicationIds[conflict.incomingId] ?? ''}
                          />
                        </div>
                      )}
                    {selection.action === 'replace' && (
                      <p className="database-import-warning">
                        Replace updates the selected record and its imported details.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : preview.scope.type === 'recipe' ? (
            <div className="database-import-destination">
              <span>Destination publication</span>
              <Picklist
                className="database-import-picklist"
                label="Destination publication"
                menuClassName="database-import-picklist-menu"
                onSelect={(value) =>
                  preview.scope.id &&
                  setDestinationPublicationIds((current) => ({
                    ...current,
                    [preview.scope.id as string]: value,
                  }))
                }
                options={[
                  sourceDestinationOption(preview),
                  ...(preview.scope.type === 'recipe'
                    ? []
                    : [{ value: omitRecipeOption, label: "Don't import recipe" }]),
                  ...preview.destinationPublications
                    .filter(
                      (publication) => publication.id !== preview.defaultDestinationPublicationId,
                    )
                    .map((publication) => ({ value: publication.id, label: publication.name })),
                ]}
                sizeToContent={false}
                value={(preview.scope.id && destinationPublicationIds[preview.scope.id]) ?? ''}
              />
            </div>
          ) : unmatchedSourcePublication && missingPublicationAction === 'destinations' ? (
            <div className="database-import-recipe-destinations">
              {preview.incomingRecipes.map((recipe) => (
                <div className="database-import-field" key={recipe.id}>
                  <span>Destination publication for {recipe.name}</span>
                  <Picklist
                    className="database-import-picklist"
                    label={`Destination publication for ${recipe.name}`}
                    menuClassName="database-import-picklist-menu"
                    onSelect={(value) =>
                      setDestinationPublicationIds((current) => ({
                        ...current,
                        [recipe.id]: value,
                      }))
                    }
                    options={[
                      { value: '', label: 'Choose a destination' },
                      { value: omitRecipeOption, label: "Don't import recipe" },
                      ...preview.destinationPublications.map((publication) => ({
                        value: publication.id,
                        label: publication.name,
                      })),
                    ]}
                    sizeToContent={false}
                    value={destinationPublicationIds[recipe.id] ?? ''}
                  />
                </div>
              ))}
            </div>
          ) : unmatchedSourcePublication ? null : hasNoConflicts ? (
            <p>No matching recipes or publications were found.</p>
          ) : null}
          {ambiguousAutomaticRecipeReplace && (
            <p className="database-import-warning" role="alert">
              A recipe has multiple matches. Choose Keep Existing to review recipe actions.
            </p>
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
          {ignoredRecipe ? (
            <p aria-live="polite" className="database-import-no-changes">
              No recipe changes will be made.
            </p>
          ) : (
            <button
              className="recipe-secondary-button database-import-button"
              disabled={!canCommit || busy !== null}
              onClick={commitImport}
              type="button"
            >
              <Upload aria-hidden="true" size={16} />
              <span>{label}</span>
            </button>
          )}
        </section>
      )}

      {!compact && (file || archivePath) && (
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

  return (
    <>
      {compact && (
        <button
          aria-hidden={triggerHidden || undefined}
          aria-label={label}
          className={`database-import-trigger recipe-secondary-button ${triggerClassName}`.trim()}
          onClick={() => {
            setCompletionNotice('');
            dialog.current?.showModal();
          }}
          ref={trigger}
          tabIndex={triggerHidden ? -1 : undefined}
          title={label}
          type="button"
        >
          <Upload aria-hidden="true" size={16} />
          <span>{label}</span>
        </button>
      )}
      {compact ? (
        <dialog
          aria-labelledby={`${inputId}-dialog-title`}
          className="database-import-dialog"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) void cancelImport();
          }}
          ref={dialog}
        >
          <div className="database-import-dialog-heading">
            <h2 id={`${inputId}-dialog-title`}>{label}</h2>
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
          {importContent}
        </dialog>
      ) : (
        importContent
      )}
      {compact && completionNotice && (
        <p aria-live="polite" className="database-import-feedback" role="status">
          {completionNotice}
        </p>
      )}
    </>
  );
}

export function DatabaseImportAction() {
  return <ImportAction compact scope={{ type: 'database' }} />;
}
