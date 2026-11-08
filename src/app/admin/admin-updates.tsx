'use client';

import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { renderAdminUpdateMarkdown } from '../../lib/admin-updates/markdown';
import {
  type AdminUpdate,
  type AdminUpdateKind,
  getAdminUpdateBodyError,
  isAdminUpdateKind,
  isSemverCore,
  normalizeAdminUpdateBody,
  sortAdminUpdates,
} from '../../lib/admin-updates/rules';
import { continueInstructionListOnEnter } from '../../lib/recipes/instruction-markdown';
import { Picklist, type PicklistOption } from '../picklist';
import {
  type AdminFormState,
  archiveAdminUpdate,
  createAdminUpdate,
  editAdminUpdate,
  restoreAdminUpdate,
  setAdminUpdateCompletion,
} from './actions';

const kindOptions: PicklistOption[] = [
  { value: 'fix', label: 'Fix' },
  { value: 'feature', label: 'Feature' },
];

type UpdateEditor = {
  id: string | null;
  revision: number | null;
  body: string;
  kind: AdminUpdateKind | null;
  originalBody: string | null;
  originalKind: AdminUpdateKind | null;
};

type CompletionDialog = {
  update: AdminUpdate;
  version: string;
};

type QueuedInlineEditor = {
  update: AdminUpdate;
  trigger: HTMLElement | null;
};

function createUpdateEditor(update: AdminUpdate): UpdateEditor {
  return {
    id: update.id,
    revision: update.revision,
    body: update.body_markdown,
    kind: update.kind,
    originalBody: update.body_markdown,
    originalKind: update.kind,
  };
}

function UpdateKindTag({ kind }: { kind: AdminUpdateKind }) {
  return (
    <span className={`admin-update-kind-tag is-${kind}`}>{kind === 'fix' ? 'Fix' : 'Feature'}</span>
  );
}

function UpdateBody({ markdown }: { markdown: string }) {
  return <div className="admin-update-markdown">{renderAdminUpdateMarkdown(markdown)}</div>;
}

export function AdminUpdates({ updates }: { updates: AdminUpdate[] }) {
  const router = useRouter();
  const idPrefix = `admin-updates-${useId().replace(/:/gu, '')}`;
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const inlineEditorSavingRef = useRef(false);
  const queuedInlineEditorRef = useRef<QueuedInlineEditor | null>(null);
  const cancelledInlineEditorIdRef = useRef<string | null>(null);
  const completionDialogRef = useRef<HTMLDialogElement>(null);
  const completionInputRef = useRef<HTMLInputElement>(null);
  const completionTriggerRef = useRef<HTMLElement | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<UpdateEditor | null>(null);
  const [completion, setCompletion] = useState<CompletionDialog | null>(null);
  const [markIncomplete, setMarkIncomplete] = useState(false);
  const [error, setError] = useState('');
  const [versionError, setVersionError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const editorKey = editor ? (editor.id ?? 'new') : null;
  const isAdding = editor?.id === null;

  useEffect(() => {
    if (editorKey && !pending) {
      editorTextareaRef.current?.focus();
    }
  }, [editorKey, pending]);

  const editorBody = editor?.body;
  useLayoutEffect(() => {
    const textarea = editorTextareaRef.current;
    if (!textarea || editorBody === undefined) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
    const caret = pendingCaretRef.current;
    if (caret !== null) {
      textarea.setSelectionRange(caret, caret);
      pendingCaretRef.current = null;
    }
  }, [editorBody]);

  const completionUpdateId = completion?.update.id;
  useEffect(() => {
    const dialog = completionDialogRef.current;
    if (!completionUpdateId || !dialog) {
      return;
    }
    dialog.showModal();
    completionInputRef.current?.focus();
    return () => {
      if (dialog.open) {
        dialog.close();
      }
      const trigger = completionTriggerRef.current;
      requestAnimationFrame(() => {
        if (trigger?.isConnected) {
          trigger.focus();
        }
      });
    };
  }, [completionUpdateId]);

  const visibleUpdates = sortAdminUpdates(
    updates.filter((update) => showArchived || !update.is_archived),
  );

  function rememberFocus(target: HTMLElement | null = null) {
    editorTriggerRef.current =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }

  function openEditor(update?: AdminUpdate, trigger?: HTMLElement | null) {
    if (update && editor && editor.id !== null && editor.id !== update.id) {
      queuedInlineEditorRef.current = {
        update,
        trigger:
          trigger ??
          (document.activeElement instanceof HTMLElement ? document.activeElement : null),
      };
      setError('');
      setMessage('');
      return;
    }
    if (pending || inlineEditorSavingRef.current) {
      return;
    }
    rememberFocus(trigger);
    setError('');
    setMessage('');
    setEditor(
      update
        ? createUpdateEditor(update)
        : {
            id: null,
            revision: null,
            body: '',
            kind: null,
            originalBody: null,
            originalKind: null,
          },
    );
  }

  function closeEditor() {
    setEditor(null);
    setError('');
    const trigger = editorTriggerRef.current;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus();
      } else {
        addButtonRef.current?.focus();
      }
    });
  }

  function openCompletion(update: AdminUpdate) {
    if (pending || inlineEditorSavingRef.current || (editor && editor.id !== null)) {
      return;
    }
    completionTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setVersionError('');
    setMarkIncomplete(false);
    setCompletion({ update, version: update.completed_version ?? '' });
  }

  function closeCompletion() {
    setCompletion(null);
    setMarkIncomplete(false);
    setVersionError('');
  }

  function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.id !== null) {
      return;
    }
    const bodyError = getAdminUpdateBodyError(editor.body);
    if (bodyError) {
      setError(bodyError);
      return;
    }
    if (!editor.kind) {
      setError('Choose Fix or Feature before submitting.');
      return;
    }

    setError('');
    setMessage('');
    startTransition(async () => {
      const result =
        editor.id && editor.revision !== null
          ? await editAdminUpdate(editor.id, editor.revision, editor.body, editor.kind)
          : await createAdminUpdate(editor.body, editor.kind);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? 'Update saved.');
      closeEditor();
      router.refresh();
    });
  }

  function cancelInlineEditor(updateId: string) {
    queuedInlineEditorRef.current = null;
    cancelledInlineEditorIdRef.current = updateId;
    closeEditor();
    window.requestAnimationFrame(() => {
      if (cancelledInlineEditorIdRef.current === updateId) {
        cancelledInlineEditorIdRef.current = null;
      }
    });
  }

  function leaveInlineEditor(updateId: string) {
    const queuedEditor = queuedInlineEditorRef.current;
    queuedInlineEditorRef.current = null;
    if (queuedEditor) {
      rememberFocus(queuedEditor.trigger);
      setEditor(createUpdateEditor(queuedEditor.update));
      return;
    }
    setEditor((activeEditor) => (activeEditor?.id === updateId ? null : activeEditor));
  }

  function saveInlineEditorOnBlur(
    event: ReactFocusEvent<HTMLFieldSetElement>,
    updateId: string,
    picklistScope: string,
  ) {
    if (cancelledInlineEditorIdRef.current === updateId) {
      cancelledInlineEditorIdRef.current = null;
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (event.currentTarget.contains(relatedTarget as Node | null)) {
      return;
    }
    if (
      relatedTarget instanceof Element &&
      relatedTarget.closest('[data-picklist-scope]')?.getAttribute('data-picklist-scope') ===
        picklistScope
    ) {
      return;
    }

    const editorElement = event.currentTarget;
    queueMicrotask(() => {
      if (
        !editorElement.isConnected ||
        editorElement.contains(document.activeElement) ||
        inlineEditorSavingRef.current
      ) {
        return;
      }

      const currentEditor = editor;
      if (!currentEditor || currentEditor.id !== updateId) {
        return;
      }

      const bodyError = getAdminUpdateBodyError(currentEditor.body);
      if (bodyError) {
        queuedInlineEditorRef.current = null;
        setError(bodyError);
        return;
      }
      if (currentEditor.revision === null || currentEditor.kind === null) {
        queuedInlineEditorRef.current = null;
        setError('This update cannot be saved. Reload the page and try again.');
        return;
      }

      if (
        normalizeAdminUpdateBody(currentEditor.body) === currentEditor.originalBody &&
        currentEditor.kind === currentEditor.originalKind
      ) {
        setError('');
        leaveInlineEditor(updateId);
        return;
      }

      inlineEditorSavingRef.current = true;
      setError('');
      startTransition(async () => {
        const result = await editAdminUpdate(
          updateId,
          currentEditor.revision,
          currentEditor.body,
          currentEditor.kind,
        );
        inlineEditorSavingRef.current = false;
        if (result.error) {
          queuedInlineEditorRef.current = null;
          setError(result.error);
          return;
        }
        setMessage(result.message ?? 'Update saved.');
        leaveInlineEditor(updateId);
        router.refresh();
      });
    });
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      const textarea = event.currentTarget;
      const continuation = continueInstructionListOnEnter(
        textarea.value,
        textarea.selectionStart,
        textarea.selectionEnd,
      );
      if (continuation) {
        event.preventDefault();
        pendingCaretRef.current = continuation.caret;
        setEditor((current) => (current ? { ...current, body: continuation.markdown } : current));
      }
    }
  }

  function runListAction(action: () => Promise<AdminFormState>) {
    if (pending || inlineEditorSavingRef.current || (editor && editor.id !== null)) {
      return;
    }
    setError('');
    setMessage('');
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? 'Update saved.');
      router.refresh();
    });
  }

  function submitCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completion) {
      return;
    }
    const version = markIncomplete ? null : completion.version.trim();
    if (version !== null && !isSemverCore(version)) {
      setVersionError(
        'Enter a standard version number in major.minor.patch format, such as 1.2.3.',
      );
      return;
    }

    setVersionError('');
    startTransition(async () => {
      const result = await setAdminUpdateCompletion(
        completion.update.id,
        completion.update.revision,
        version,
      );
      if (result.error) {
        setVersionError(result.error);
        return;
      }
      setMessage(result.message ?? 'Completion updated.');
      closeCompletion();
      router.refresh();
    });
  }

  const editorErrorId = `${idPrefix}-editor-error`;
  const versionErrorId = `${idPrefix}-version-error`;

  function handleUpdateBodyClick(event: ReactMouseEvent<HTMLFieldSetElement>, update: AdminUpdate) {
    if (event.target instanceof Element && event.target.closest('a')) {
      return;
    }
    if (editor && editor.id !== null && editor.id !== update.id) {
      openEditor(update, editButtonRefs.current.get(update.id));
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }
    openEditor(update, editButtonRefs.current.get(update.id));
  }

  return (
    <section aria-labelledby={`${idPrefix}-title`} className="admin-updates">
      <div className="admin-updates-heading">
        <div>
          <h2 id={`${idPrefix}-title`}>Application updates</h2>
          <p>Shared release work for administrators.</p>
        </div>
        {!isAdding && (
          <button
            className="admin-updates-primary"
            disabled={pending || Boolean(editor && editor.id !== null)}
            ref={addButtonRef}
            type="button"
            onClick={() => {
              if (!inlineEditorSavingRef.current) {
                openEditor();
              }
            }}
          >
            Add update
          </button>
        )}
      </div>

      {message && (
        <p className="admin-updates-feedback is-success" role="status">
          {message}
        </p>
      )}
      {error && !editor && (
        <p className="admin-updates-feedback" role="alert">
          {error}
        </p>
      )}

      {isAdding && editor ? (
        <form
          aria-busy={pending}
          className="admin-update-editor"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !pending) {
              event.preventDefault();
              closeEditor();
            }
          }}
          onSubmit={submitEditor}
        >
          <div className="admin-update-editor-heading">
            <h3>Add update</h3>
            <Picklist
              className="admin-update-type-picker"
              disabled={pending}
              label={
                editor.kind === 'fix' ? 'Fix' : editor.kind === 'feature' ? 'Feature' : '+ Add tag'
              }
              options={kindOptions}
              showArrow={false}
              sizeToContent={false}
              value={editor.kind ?? ''}
              onSelect={(value) => {
                if (isAdminUpdateKind(value)) {
                  setEditor((current) => (current ? { ...current, kind: value } : current));
                  setError('');
                }
              }}
            >
              {editor.kind ? (
                <UpdateKindTag kind={editor.kind} />
              ) : (
                <span className="admin-update-add-tag">+ Add tag</span>
              )}
            </Picklist>
          </div>

          <div className="admin-update-editor-grid">
            <div className="admin-update-editor-field">
              <label htmlFor={`${idPrefix}-body`}>Update text</label>
              <textarea
                aria-describedby={error ? editorErrorId : undefined}
                aria-invalid={Boolean(error) || undefined}
                autoCapitalize="sentences"
                id={`${idPrefix}-body`}
                ref={editorTextareaRef}
                value={editor.body}
                onChange={(event) => {
                  const body = event.currentTarget.value;
                  setEditor((current) => (current ? { ...current, body } : current));
                  setError('');
                }}
                onKeyDown={handleEditorKeyDown}
              />
              <div className="admin-update-editor-meta">
                <span>Markdown supported; raw HTML and images are not.</span>
                <span>{Array.from(normalizeAdminUpdateBody(editor.body)).length}/5,000</span>
              </div>
              {error && (
                <p className="admin-updates-feedback" id={editorErrorId} role="alert">
                  {error}
                </p>
              )}
            </div>
            <section aria-label="Preview" className="admin-update-preview-panel">
              <h4>Preview</h4>
              <div className="admin-update-preview">
                {editor.body.trim() ? (
                  <UpdateBody markdown={editor.body} />
                ) : (
                  <p className="admin-update-preview-empty">Your preview will appear here.</p>
                )}
              </div>
            </section>
          </div>

          <div className="admin-update-editor-actions">
            <button disabled={pending} type="button" onClick={closeEditor}>
              Cancel
            </button>
            <button className="admin-updates-primary" disabled={pending} type="submit">
              {pending ? 'Submitting…' : 'Submit update'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="admin-updates-list-controls">
            <button
              aria-pressed={showArchived}
              className="admin-updates-secondary"
              disabled={pending}
              type="button"
              onClick={() => {
                if (!inlineEditorSavingRef.current && !(editor && editor.id !== null)) {
                  setShowArchived((shown) => !shown);
                }
              }}
            >
              {showArchived ? 'Hide archived updates' : 'Show archived updates'}
            </button>
          </div>
          {visibleUpdates.length ? (
            <div className="admin-updates-table-scroll">
              <table className="admin-updates-table">
                <thead>
                  <tr>
                    <th scope="col">Done</th>
                    <th scope="col">Update</th>
                    <th scope="col">Actions</th>
                    <th scope="col">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUpdates.map((update) => (
                    <tr className={update.is_archived ? 'is-archived' : undefined} key={update.id}>
                      <td data-column="done" data-label="Done">
                        {update.completed_version ? (
                          <button
                            aria-label={`Done in ${update.completed_version}`}
                            className="admin-update-version"
                            data-update-done={update.id}
                            disabled={pending}
                            type="button"
                            onClick={openCompletion.bind(null, update)}
                          >
                            {update.completed_version}
                          </button>
                        ) : (
                          <label className="admin-update-checkbox-hit-area">
                            <input
                              aria-label="Mark update done"
                              checked={false}
                              data-update-done={update.id}
                              disabled={pending}
                              type="checkbox"
                              onChange={() => openCompletion(update)}
                            />
                          </label>
                        )}
                      </td>
                      <td
                        className="admin-update-text-cell"
                        data-column="update"
                        data-label="Update"
                      >
                        {editor?.id === update.id ? (
                          <fieldset
                            aria-busy={pending}
                            aria-label="Edit update"
                            className="admin-update-inline-editor"
                            onBlur={(event) =>
                              saveInlineEditorOnBlur(
                                event,
                                update.id,
                                `${idPrefix}-kind-${update.id}`,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Escape' && !pending) {
                                event.preventDefault();
                                event.stopPropagation();
                                cancelInlineEditor(update.id);
                              }
                            }}
                          >
                            <div className="admin-update-inline-editor-heading">
                              <Picklist
                                className="admin-update-type-picker"
                                disabled={pending}
                                label={
                                  editor.kind === 'fix'
                                    ? 'Fix'
                                    : editor.kind === 'feature'
                                      ? 'Feature'
                                      : '+ Add tag'
                                }
                                options={kindOptions}
                                scope={`${idPrefix}-kind-${update.id}`}
                                showArrow={false}
                                sizeToContent={false}
                                value={editor.kind ?? ''}
                                onSelect={(value) => {
                                  if (isAdminUpdateKind(value)) {
                                    setEditor((current) =>
                                      current?.id === update.id
                                        ? { ...current, kind: value }
                                        : current,
                                    );
                                    setError('');
                                  }
                                }}
                              >
                                {editor.kind ? (
                                  <UpdateKindTag kind={editor.kind} />
                                ) : (
                                  <span className="admin-update-add-tag">+ Add tag</span>
                                )}
                              </Picklist>
                              <span>Move focus outside to save; press Escape to discard.</span>
                            </div>
                            <textarea
                              aria-describedby={error ? editorErrorId : undefined}
                              aria-invalid={Boolean(error) || undefined}
                              aria-label="Update text"
                              autoCapitalize="sentences"
                              className="admin-update-inline-textarea"
                              disabled={pending}
                              ref={editorTextareaRef}
                              rows={1}
                              value={editor.body}
                              onChange={(event) => {
                                const body = event.currentTarget.value;
                                setEditor((current) =>
                                  current?.id === update.id ? { ...current, body } : current,
                                );
                                setError('');
                              }}
                              onKeyDown={handleEditorKeyDown}
                            />
                            {error && (
                              <p className="admin-updates-feedback" id={editorErrorId} role="alert">
                                {error}
                              </p>
                            )}
                          </fieldset>
                        ) : (
                          <>
                            {/* biome-ignore lint/a11y/useKeyWithClickEvents: The row's Edit update button is the keyboard equivalent of this pointer shortcut. */}
                            <fieldset
                              aria-label="Edit update text"
                              className="admin-update-text-edit-target"
                              title="Click to edit this update"
                              onClick={(event) => handleUpdateBodyClick(event, update)}
                            >
                              <UpdateBody markdown={update.body_markdown} />
                            </fieldset>
                          </>
                        )}
                        {update.is_archived && (
                          <span className="admin-update-archived-label">Archived</span>
                        )}
                      </td>
                      <td
                        className="admin-update-actions-cell"
                        data-column="actions"
                        data-label="Actions"
                      >
                        <div className="admin-update-actions">
                          <button
                            disabled={pending}
                            ref={(element) => {
                              if (element) {
                                editButtonRefs.current.set(update.id, element);
                              } else {
                                editButtonRefs.current.delete(update.id);
                              }
                            }}
                            type="button"
                            onClick={() => {
                              if (editor?.id === update.id) {
                                editorTextareaRef.current?.focus();
                              } else {
                                openEditor(update);
                              }
                            }}
                          >
                            {editor?.id === update.id ? 'Editing update' : 'Edit update'}
                          </button>
                          {update.is_archived ? (
                            <button
                              disabled={pending}
                              type="button"
                              onClick={() =>
                                runListAction(() => restoreAdminUpdate(update.id, update.revision))
                              }
                            >
                              Restore update
                            </button>
                          ) : (
                            <button
                              disabled={pending}
                              type="button"
                              onClick={() =>
                                runListAction(() => archiveAdminUpdate(update.id, update.revision))
                              }
                            >
                              Archive update
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="admin-update-kind-cell" data-column="type" data-label="Type">
                        <UpdateKindTag kind={update.kind} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-updates-empty" role="status">
              showArchived ? 'No updates to show.' : 'No updates yet. Add one to get started.'
            </p>
          )}
        </>
      )}

      {completion && (
        <dialog
          aria-labelledby={`${idPrefix}-completion-title`}
          className="admin-update-completion-dialog"
          ref={completionDialogRef}
          onCancel={(event) => {
            event.preventDefault();
            closeCompletion();
          }}
        >
          <form aria-busy={pending} onSubmit={submitCompletion}>
            <h2 id={`${idPrefix}-completion-title`}>
              {completion.update.completed_version ? 'Update completion' : 'Complete update'}
            </h2>
            <label htmlFor={`${idPrefix}-version`}>Version</label>
            <input
              aria-describedby={versionError ? versionErrorId : undefined}
              aria-invalid={Boolean(versionError) || undefined}
              autoComplete="off"
              id={`${idPrefix}-version`}
              ref={completionInputRef}
              type="text"
              value={completion.version}
              onChange={(event) => {
                const version = event.currentTarget.value;
                setCompletion((current) => (current ? { ...current, version } : current));
                setVersionError('');
              }}
            />
            {versionError && (
              <p className="admin-updates-feedback" id={versionErrorId} role="alert">
                {versionError}
              </p>
            )}
            {completion.update.completed_version && (
              <label className="admin-update-reopen-option">
                <input
                  checked={markIncomplete}
                  disabled={pending}
                  type="checkbox"
                  onChange={(event) => setMarkIncomplete(event.currentTarget.checked)}
                />
                Mark incomplete
              </label>
            )}
            <div className="admin-update-editor-actions">
              <button disabled={pending} type="button" onClick={closeCompletion}>
                Cancel
              </button>
              <button className="admin-updates-primary" disabled={pending} type="submit">
                {pending ? 'Submitting…' : 'Submit version'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </section>
  );
}
