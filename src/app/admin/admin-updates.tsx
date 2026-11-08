'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent,
  type FocusEvent as ReactFocusEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
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
import { createAdminUpdate, editAdminUpdate, setAdminUpdateCompletion } from './actions';

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

type QueuedInlineEditor = {
  update: AdminUpdate | null;
  trigger: HTMLElement | null;
  kind?: AdminUpdateKind;
};

type CompletionDialog = {
  update: AdminUpdate;
  version: string;
};

function createDraftEditor(body = '', kind: AdminUpdateKind | null = null): UpdateEditor {
  return {
    id: null,
    revision: null,
    body,
    kind,
    originalBody: null,
    originalKind: null,
  };
}

function createUpdateEditor(update: AdminUpdate, kind = update.kind): UpdateEditor {
  return {
    id: update.id,
    revision: update.revision,
    body: update.body_markdown,
    kind,
    originalBody: update.body_markdown,
    originalKind: update.kind,
  };
}

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function UpdateKindTag({ kind }: { kind: AdminUpdateKind }) {
  return (
    <span className={`admin-update-kind-tag is-${kind}`}>{kind === 'fix' ? 'Fix' : 'Feature'}</span>
  );
}

export function AdminUpdates({ updates }: { updates: AdminUpdate[] }) {
  const router = useRouter();
  const idPrefix = `admin-updates-${useId().replace(/:/gu, '')}`;
  const addTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editorTriggerRef = useRef<HTMLElement | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const inlineEditorSavingRef = useRef(false);
  const queuedInlineEditorRef = useRef<QueuedInlineEditor | null>(null);
  const cancelledInlineEditorKeyRef = useRef<string | null>(null);
  const completionDialogRef = useRef<HTMLDialogElement>(null);
  const completionInputRef = useRef<HTMLInputElement>(null);
  const completionTriggerRef = useRef<HTMLElement | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [editor, setEditor] = useState<UpdateEditor | null>(null);
  const [completion, setCompletion] = useState<CompletionDialog | null>(null);
  const [markIncomplete, setMarkIncomplete] = useState(false);
  const [error, setError] = useState('');
  const [versionError, setVersionError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const editorKey = editor ? (editor.id ?? 'new') : null;

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

    resizeTextarea(textarea);
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
    updates.filter((update) => showDone || update.completed_version === null),
  );

  function rememberFocus(target: HTMLElement | null = null) {
    editorTriggerRef.current =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }

  function openEditor(
    update: AdminUpdate | null = null,
    trigger?: HTMLElement | null,
    kind?: AdminUpdateKind,
  ) {
    const targetId = update?.id ?? null;
    if (pending || inlineEditorSavingRef.current) {
      return;
    }
    if (editor && editor.id !== targetId) {
      queuedInlineEditorRef.current = {
        update,
        trigger:
          trigger ??
          (document.activeElement instanceof HTMLElement ? document.activeElement : null),
        kind,
      };
      setError('');
      setMessage('');
      return;
    }
    if (editor?.id === targetId) {
      if (kind) {
        setEditor((current) => (current?.id === targetId ? { ...current, kind } : current));
      }
      return;
    }

    rememberFocus(trigger ?? null);
    setError('');
    setMessage('');
    setEditor(
      update ? createUpdateEditor(update, kind ?? update.kind) : createDraftEditor('', kind),
    );
  }

  function closeEditor() {
    queuedInlineEditorRef.current = null;
    setEditor(null);
    setError('');
    const trigger = editorTriggerRef.current;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus();
      } else {
        addTextareaRef.current?.focus();
      }
    });
  }

  function openCompletion(update: AdminUpdate) {
    if (pending || inlineEditorSavingRef.current || editor) {
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

  function cancelInlineEditor(updateId: string | null) {
    queuedInlineEditorRef.current = null;
    const key = updateId ?? 'new';
    cancelledInlineEditorKeyRef.current = key;
    closeEditor();
    window.requestAnimationFrame(() => {
      if (cancelledInlineEditorKeyRef.current === key) {
        cancelledInlineEditorKeyRef.current = null;
      }
    });
  }

  function leaveInlineEditor(updateId: string | null) {
    const queuedEditor = queuedInlineEditorRef.current;
    queuedInlineEditorRef.current = null;
    if (queuedEditor) {
      rememberFocus(queuedEditor.trigger);
      setEditor(
        queuedEditor.update
          ? createUpdateEditor(queuedEditor.update, queuedEditor.kind)
          : createDraftEditor('', queuedEditor.kind ?? null),
      );
      return;
    }
    setEditor((activeEditor) => (activeEditor?.id === updateId ? null : activeEditor));
    setError('');
  }

  function saveInlineEditorOnBlur(
    event: ReactFocusEvent<HTMLLIElement>,
    updateId: string | null,
    picklistScope: string,
  ) {
    const key = updateId ?? 'new';
    if (cancelledInlineEditorKeyRef.current === key) {
      cancelledInlineEditorKeyRef.current = null;
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
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
      if (updateId === null && !currentEditor.body.trim() && !currentEditor.kind) {
        leaveInlineEditor(updateId);
        return;
      }

      const bodyError = getAdminUpdateBodyError(currentEditor.body);
      if (bodyError) {
        queuedInlineEditorRef.current = null;
        setError(bodyError);
        return;
      }
      const kind = currentEditor.kind;
      if (!kind) {
        queuedInlineEditorRef.current = null;
        setError('Choose Fix or Feature before saving.');
        return;
      }
      if (updateId !== null && currentEditor.revision === null) {
        queuedInlineEditorRef.current = null;
        setError('This update cannot be saved. Reload the page and try again.');
        return;
      }
      if (
        updateId !== null &&
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
        const result =
          updateId !== null && currentEditor.revision !== null
            ? await editAdminUpdate(updateId, currentEditor.revision, currentEditor.body, kind)
            : await createAdminUpdate(currentEditor.body, kind);
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

  function setUpdateKind(
    update: AdminUpdate | null,
    kind: AdminUpdateKind,
    trigger: HTMLElement | null,
  ) {
    const targetId = update?.id ?? null;
    if (editor?.id === targetId) {
      setEditor((current) => (current?.id === targetId ? { ...current, kind } : current));
      setError('');
      return;
    }
    openEditor(update, trigger, kind);
  }

  function setUpdateBody(update: AdminUpdate | null, body: string) {
    const targetId = update?.id ?? null;
    setEditor((current) => {
      if (current?.id === targetId) {
        return { ...current, body };
      }
      if (current) {
        return current;
      }
      return update ? { ...createUpdateEditor(update), body } : createDraftEditor(body);
    });
    setError('');
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

  function handleInlineKeyDown(event: KeyboardEvent<HTMLLIElement>, updateId: string | null) {
    if (event.key === 'Escape' && !pending) {
      event.preventDefault();
      event.stopPropagation();
      cancelInlineEditor(updateId);
    }
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

  function renderUpdateRow(update: AdminUpdate | null) {
    const updateId = update?.id ?? null;
    const isEditing = editor?.id === updateId;
    const isNew = update === null;
    const scope = `${idPrefix}-kind-${updateId ?? 'new'}`;
    const rowError = isEditing ? error : '';
    const kind = isEditing ? (editor?.kind ?? null) : (update?.kind ?? null);

    return (
      <li
        className={`admin-update-row${isNew ? ' is-new' : ''}`}
        key={update?.id ?? 'new'}
        onBlur={isEditing ? (event) => saveInlineEditorOnBlur(event, updateId, scope) : undefined}
        onKeyDown={isEditing ? (event) => handleInlineKeyDown(event, updateId) : undefined}
      >
        <div className="admin-update-done">
          {update?.completed_version ? (
            <button
              aria-label={`Done in ${update.completed_version}`}
              className="admin-update-version"
              data-update-done={update.id}
              disabled={pending}
              type="button"
              onClick={() => openCompletion(update)}
            >
              {update.completed_version}
            </button>
          ) : update ? (
            <label className="admin-update-checkbox-hit-area">
              <input
                aria-label={`Mark "${update.body_markdown.slice(0, 60)}" done`}
                checked={false}
                data-update-done={update.id}
                disabled={pending}
                type="checkbox"
                onChange={() => openCompletion(update)}
              />
            </label>
          ) : null}
        </div>
        <div className="admin-update-body">
          <textarea
            aria-describedby={rowError ? editorErrorId : undefined}
            aria-invalid={Boolean(rowError) || undefined}
            aria-label={isNew ? 'Add update' : 'Update text'}
            autoCapitalize="sentences"
            className="admin-update-inline-textarea"
            placeholder={isNew ? 'Add update...' : undefined}
            readOnly={!isNew && !isEditing}
            ref={(element) => {
              if (isEditing) {
                editorTextareaRef.current = element;
              }
              if (isNew) {
                addTextareaRef.current = element;
              }
              if (element) {
                resizeTextarea(element);
              }
            }}
            rows={1}
            value={isEditing ? (editor?.body ?? '') : (update?.body_markdown ?? '')}
            onChange={(event) => setUpdateBody(update, event.currentTarget.value)}
            onFocus={(event) => {
              if (!isEditing) {
                openEditor(update, event.currentTarget);
              }
            }}
            onClick={(event) => {
              if (!isEditing && update) {
                openEditor(update, event.currentTarget);
              }
            }}
            onKeyDown={(event) => {
              if (isEditing) {
                if (event.key === 'Escape' && !pending) {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelInlineEditor(updateId);
                } else {
                  handleEditorKeyDown(event);
                }
              } else if (update && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                openEditor(update, event.currentTarget);
              }
            }}
          />
          {rowError && (
            <p className="admin-updates-feedback" id={editorErrorId} role="alert">
              {rowError}
            </p>
          )}
        </div>
        <div className="admin-update-kind">
          <Picklist
            className="admin-update-type-picker"
            disabled={pending}
            label={kind === 'fix' ? 'Fix' : kind === 'feature' ? 'Feature' : '+ Add tag'}
            options={kindOptions}
            scope={scope}
            showArrow={false}
            sizeToContent={false}
            value={(isEditing ? editor?.kind : update?.kind) ?? ''}
            onSelect={(value) => {
              if (isAdminUpdateKind(value)) {
                setUpdateKind(
                  update,
                  value,
                  document.activeElement instanceof HTMLElement ? document.activeElement : null,
                );
              }
            }}
          >
            {kind ? (
              <UpdateKindTag kind={kind} />
            ) : (
              <span className="admin-update-add-tag">+ Add tag</span>
            )}
          </Picklist>
        </div>
      </li>
    );
  }

  return (
    <section aria-labelledby={`${idPrefix}-title`} className="admin-updates">
      <div className="admin-updates-heading">
        <h2 id={`${idPrefix}-title`}>Application updates</h2>
        <button
          aria-label={showDone ? 'Hide done updates' : 'Show done updates'}
          aria-pressed={showDone}
          className="admin-updates-visibility-toggle"
          disabled={pending}
          title={showDone ? 'Hide done updates' : 'Show done updates'}
          type="button"
          onClick={() => setShowDone((shown) => !shown)}
        >
          {showDone ? (
            <EyeOff aria-hidden="true" size={18} />
          ) : (
            <Eye aria-hidden="true" size={18} />
          )}
        </button>
      </div>

      <p className="visually-hidden" role="status">
        {message}
      </p>
      {error && !editor && (
        <p className="admin-updates-feedback" role="alert">
          {error}
        </p>
      )}

      <div className="admin-update-list">
        <div className="admin-update-list-header">
          <span>Done</span>
          <span>Type</span>
        </div>
        <ul aria-label="Update entries" className="admin-update-list-items">
          {renderUpdateRow(null)}
          {visibleUpdates.map((update) => renderUpdateRow(update))}
        </ul>
      </div>

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
                {pending ? 'Submitting...' : 'Submit version'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </section>
  );
}
