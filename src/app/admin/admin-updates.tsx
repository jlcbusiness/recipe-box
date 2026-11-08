'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
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
import { useReorderDrag } from '../recipes/use-reorder-drag';
import { ReorderGrip } from '../reorder-grip';
import {
  createAdminUpdate,
  editAdminUpdate,
  reorderAdminUpdates,
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

function getReorderableRows(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '.admin-update-row[data-admin-update-reorderable="true"]',
    ),
  ).filter((row) => row.getBoundingClientRect().height > 0);
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
  const dragPointerYRef = useRef<number | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const isDragActiveRef = useRef(false);
  const pendingReorder = useRef<{ sourceId: string; rowTops: Map<string, number> } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [editor, setEditor] = useState<UpdateEditor | null>(null);
  const [completion, setCompletion] = useState<CompletionDialog | null>(null);
  const [markIncomplete, setMarkIncomplete] = useState(false);
  const [error, setError] = useState('');
  const [versionError, setVersionError] = useState('');
  const [message, setMessage] = useState('');
  const [manualOrder, setManualOrder] = useState(() =>
    sortAdminUpdates(updates)
      .filter((update) => update.completed_version === null)
      .map((update) => update.id),
  );
  const [dropOffsets, setDropOffsets] = useState<Map<string, number>>(() => new Map());
  const [dropCommitPending, setDropCommitPending] = useState(false);
  const [settlingSourceId, setSettlingSourceId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reorderDrag = useReorderDrag();
  const dragPreview = reorderDrag.preview;
  const editorKey = editor ? (editor.id ?? 'new') : null;

  useEffect(() => {
    const nextOrder = sortAdminUpdates(updates)
      .filter((update) => update.completed_version === null)
      .map((update) => update.id);
    setManualOrder(nextOrder);
  }, [updates]);

  useEffect(() => {
    const list = document.querySelector<HTMLElement>('.admin-update-list');
    if (!list || typeof ResizeObserver === 'undefined') {
      return;
    }

    let listWidth = list.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = list.getBoundingClientRect().width;
      if (nextWidth === listWidth) {
        return;
      }
      listWidth = nextWidth;
      list
        .querySelectorAll<HTMLTextAreaElement>('.admin-update-inline-textarea')
        .forEach(resizeTextarea);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

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

  useLayoutEffect(() => {
    if (dragPreview) {
      return;
    }
    const pending = pendingReorder.current;
    if (!pending) {
      return;
    }
    pendingReorder.current = null;

    const offsets = new Map<string, number>();
    for (const row of getReorderableRows()) {
      const updateId = row.dataset.adminUpdateId;
      const oldTop = updateId ? pending.rowTops.get(updateId) : undefined;
      if (updateId && oldTop !== undefined && row.getBoundingClientRect().height > 0) {
        offsets.set(updateId, oldTop - row.getBoundingClientRect().top);
      }
    }
    if (!offsets.size) {
      setDropCommitPending(false);
      return;
    }

    setDropOffsets(offsets);
    setDropCommitPending(false);
    const canAnimate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSettlingSourceId(
      canAnimate && Math.abs(offsets.get(pending.sourceId) ?? 0) > 0.5 ? pending.sourceId : null,
    );
    window.requestAnimationFrame(() => setDropOffsets(new Map()));
  }, [dragPreview]);

  useEffect(
    () => () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
      }
    },
    [],
  );

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

  const sortedUpdates = sortAdminUpdates(updates);
  const incompleteUpdates = sortedUpdates.filter((update) => update.completed_version === null);
  const completedUpdates = sortedUpdates.filter((update) => update.completed_version !== null);
  const incompleteById = new Map(incompleteUpdates.map((update) => [update.id, update]));
  const orderedIncomplete = [
    ...manualOrder.flatMap((id) => {
      const update = incompleteById.get(id);
      return update ? [update] : [];
    }),
    ...incompleteUpdates.filter((update) => !manualOrder.includes(update.id)),
  ];
  const incompletePositions = new Map(
    orderedIncomplete.map((update, index) => [update.id, index + 1]),
  );
  const visibleUpdates = [...orderedIncomplete, ...completedUpdates].filter(
    (update) => showDone || update.completed_version === null,
  );

  function stopAutoScroll() {
    isDragActiveRef.current = false;
    dragPointerYRef.current = null;
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }

  function autoScrollWhileDragging() {
    const pointerY = dragPointerYRef.current;
    if (pointerY === null || !isDragActiveRef.current) {
      autoScrollFrameRef.current = null;
      return;
    }

    const edgeSize = 64;
    const distanceToTop = edgeSize - pointerY;
    const distanceToBottom = pointerY - (window.innerHeight - edgeSize);
    const scrollDelta =
      distanceToTop > 0
        ? -Math.min(16, Math.ceil(distanceToTop / 4))
        : distanceToBottom > 0
          ? Math.min(16, Math.ceil(distanceToBottom / 4))
          : 0;
    if (scrollDelta !== 0) {
      window.scrollBy(0, scrollDelta);
    }

    reorderDrag.move(pointerY);
    autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollWhileDragging);
  }

  function trackDragPointer(clientY: number) {
    if (!isDragActiveRef.current) {
      return;
    }
    dragPointerYRef.current = clientY;
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollWhileDragging);
    }
  }

  function persistManualOrder(nextOrder: string[], sourceId: string) {
    const previousOrder = manualOrder;
    if (
      nextOrder.length === previousOrder.length &&
      nextOrder.every((updateId, index) => updateId === previousOrder[index])
    ) {
      return;
    }

    const rowTops = new Map(
      getReorderableRows().flatMap((row) => {
        const updateId = row.dataset.adminUpdateId;
        return updateId ? [[updateId, row.getBoundingClientRect().top] as const] : [];
      }),
    );
    pendingReorder.current = { sourceId, rowTops };
    setDropCommitPending(true);
    setManualOrder(nextOrder);
    setError('');
    setMessage('');

    const movedUpdate = updates.find((update) => update.id === sourceId);
    const label = normalizeAdminUpdateBody(movedUpdate?.body_markdown ?? 'Update')
      .replace(/\s+/gu, ' ')
      .slice(0, 80);
    const newPosition = nextOrder.indexOf(sourceId) + 1;
    startTransition(async () => {
      const result = await reorderAdminUpdates(nextOrder);
      if (result.error) {
        setManualOrder(previousOrder);
        pendingReorder.current = null;
        setDropOffsets(new Map());
        setDropCommitPending(false);
        setSettlingSourceId(null);
        setError(result.error);
        return;
      }
      setMessage(`${label} moved to position ${newPosition}.`);
      router.refresh();
    });
  }

  function startUpdateDrag(update: AdminUpdate, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || pending || editor) {
      return;
    }
    const rowElements = Array.from(
      event.currentTarget
        .closest('.admin-update-list-items')
        ?.querySelectorAll<HTMLElement>(
          '.admin-update-row[data-admin-update-reorderable="true"]',
        ) ?? [],
    );
    const bounds = rowElements.flatMap((row) => {
      const updateId = row.dataset.adminUpdateId;
      if (!updateId) {
        return [];
      }
      const rect = row.getBoundingClientRect();
      return [
        { id: updateId, top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY },
      ];
    });
    const sourceRow = event.currentTarget.closest<HTMLElement>('.admin-update-row');
    reorderDrag.start(
      update.id,
      event.clientY,
      sourceRow?.getBoundingClientRect().height ?? 48,
      bounds,
    );
    isDragActiveRef.current = true;
    trackDragPointer(event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function finishUpdateDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    stopAutoScroll();
    reorderDrag.move(event.clientY);
    const targetId = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-admin-update-id]')?.dataset.adminUpdateId;
    const drag = reorderDrag.finish(targetId);
    if (drag) {
      persistManualOrder(drag.order, drag.sourceId);
    }
  }

  function moveUpdateByKeyboard(updateId: string, direction: 'up' | 'down') {
    if (pending || editor) {
      return;
    }
    const currentOrder = manualOrder;
    const index = currentOrder.indexOf(updateId);
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) {
      return;
    }
    const nextOrder = [...currentOrder];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    persistManualOrder(nextOrder, updateId);
  }

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

  function persistInlineEditor(updateId: string | null, currentEditor: UpdateEditor) {
    if (inlineEditorSavingRef.current) {
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
      persistInlineEditor(updateId, currentEditor);
    });
  }

  function setUpdateKind(
    update: AdminUpdate | null,
    kind: AdminUpdateKind,
    trigger: HTMLElement | null,
  ) {
    const targetId = update?.id ?? null;
    if (editor?.id === targetId) {
      const updatedEditor = { ...editor, kind };
      setEditor((current) => (current?.id === targetId ? updatedEditor : current));
      setError('');
      if (update === null && editor.body.trim()) {
        persistInlineEditor(targetId, updatedEditor);
      }
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
    const reorderPosition = update ? (incompletePositions.get(update.id) ?? 0) : 0;
    const reorderState =
      update && update.completed_version === null
        ? dragPreview?.sourceId === update.id
          ? 'dragging'
          : Math.abs(dragPreview?.offsets.get(update.id) ?? 0) > 0.5
            ? 'displaced'
            : settlingSourceId === update.id
              ? 'settling'
              : undefined
        : undefined;
    const rowTransform =
      dragPreview && dragPreview.sourceId === update?.id
        ? `translateY(${dragPreview.pointerOffset}px)`
        : update && dragPreview?.offsets.has(update.id)
          ? `translateY(${dragPreview.offsets.get(update.id)}px)`
          : update && dropOffsets.has(update.id)
            ? `translateY(${dropOffsets.get(update.id)}px)`
            : undefined;

    return (
      <li
        className={`admin-update-row${isNew ? ' is-new' : ''}`}
        data-admin-update-id={update?.id}
        data-admin-update-reorderable={
          update && update.completed_version === null ? 'true' : undefined
        }
        data-reorder-state={reorderState}
        key={update?.id ?? 'new'}
        style={{
          transform: rowTransform,
          transition:
            dropCommitPending || (update && dropOffsets.has(update.id)) ? 'none' : undefined,
        }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform' && settlingSourceId === update?.id) {
            setSettlingSourceId(null);
          }
        }}
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
          {update && update.completed_version === null && (
            <button
              aria-label={`Reorder update ${reorderPosition}`}
              className="admin-update-reorder-handle"
              disabled={pending || Boolean(editor) || incompleteUpdates.length < 2}
              title="Drag to reorder. Use Ctrl+Up or Ctrl+Down to move by keyboard."
              type="button"
              onPointerDown={(event) => startUpdateDrag(update, event)}
              onPointerMove={(event) => {
                if (isDragActiveRef.current) {
                  reorderDrag.move(event.clientY);
                  trackDragPointer(event.clientY);
                }
              }}
              onPointerUp={finishUpdateDrag}
              onPointerCancel={(event) => {
                stopAutoScroll();
                reorderDrag.cancel();
                event.currentTarget.focus();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && dragPreview) {
                  event.preventDefault();
                  stopAutoScroll();
                  reorderDrag.cancel();
                  event.currentTarget.focus();
                } else if (event.ctrlKey && event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveUpdateByKeyboard(update.id, 'up');
                } else if (event.ctrlKey && event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveUpdateByKeyboard(update.id, 'down');
                }
              }}
            >
              <ReorderGrip />
            </button>
          )}
        </div>
        <div className="admin-update-body">
          <div className="admin-update-body-content">
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
          </div>
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
            <Eye aria-hidden="true" data-visibility-state="visible" size={18} />
          ) : (
            <EyeOff aria-hidden="true" data-visibility-state="hidden" size={18} />
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
        <ul
          aria-label="Update entries"
          className="admin-update-list-items"
          data-reordering={dragPreview ? 'true' : undefined}
        >
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
