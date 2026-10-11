'use client';

import { ArrowDownAZ, ChevronRight, GripVertical, Merge, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import type { PicklistCategory } from '../../lib/recipes/data';
import { manageRecipePicklist } from '../actions/recipe-picklists';
import { Picklist } from '../picklist';
import { useReorderDrag } from '../recipes/use-reorder-drag';
import styles from './recipe-picklist-manager.module.css';

const categories: { id: PicklistCategory; label: string }[] = [
  { id: 'food_type', label: 'Food Type' },
  { id: 'meal_type', label: 'Meal Type' },
  { id: 'cuisine', label: 'Cuisine' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'verdict', label: 'Verdict' },
  { id: 'enthusiasm', label: 'Enthusiasm' },
  { id: 'informal_unit', label: 'Informal Unit' },
  { id: 'unmeasured_phrase', label: 'Unmeasured Phrase' },
];

type ManagedValue = {
  id: string;
  category: PicklistCategory;
  value: string;
  display_value: string;
  sort_order: number;
  is_protected: boolean;
};

type ReferenceCount = { recipes: number; measurements: number };
type ManagerMode = 'merge' | 'delete';

export function RecipePicklistManager({
  initialValues,
  initialRevisions,
  referenceCounts,
}: {
  initialValues: ManagedValue[];
  initialRevisions: Partial<Record<PicklistCategory, number>>;
  referenceCounts: Record<string, ReferenceCount>;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<PicklistCategory>('food_type');
  const [isExpanded, setIsExpanded] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [revisions, setRevisions] = useState(initialRevisions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<ManagerMode>('merge');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addValue, setAddValue] = useState('');
  const [mergeCounterpartId, setMergeCounterpartId] = useState('');
  const [mergeKeepId, setMergeKeepId] = useState<string | null>(null);
  const [replacementId, setReplacementId] = useState('');
  const [clearOptional, setClearOptional] = useState(false);
  const [panePosition, setPanePosition] = useState<{
    top: number | null;
    bottom: number | null;
    left: number;
    maxHeight: number;
  } | null>(null);
  const [status, setStatus] = useState('');
  const [dropOffsets, setDropOffsets] = useState<Map<string, number>>(() => new Map());
  const [dropCommitPending, setDropCommitPending] = useState(false);
  const [settlingSourceId, setSettlingSourceId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const addInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const pendingDrop = useRef<{ sourceId: string; rowTops: Map<string, number> } | null>(null);
  const editHistoryEntry = useRef(false);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const reorderDrag = useReorderDrag();

  useEffect(() => {
    setValues(initialValues);
    setRevisions(initialRevisions);
  }, [initialRevisions, initialValues]);

  const categoryLabel = categories.find((item) => item.id === category)?.label ?? category;
  const rows = values
    .filter((item) => item.category === category)
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));
  const selectedValue = rows.find((item) => item.id === selectedId) ?? null;
  const selectedReferences = selectedValue
    ? (referenceCounts[selectedValue.id] ?? { recipes: 0, measurements: 0 })
    : { recipes: 0, measurements: 0 };
  const requiresReplacement =
    (category === 'informal_unit' || category === 'unmeasured_phrase') &&
    selectedReferences.measurements > 0;
  const preview = reorderDrag.preview;
  const sourceIndex = preview ? rows.findIndex((item) => item.id === preview.sourceId) : -1;
  const targetIndex = preview ? rows.findIndex((item) => item.id === preview.targetId) : -1;

  const closePane = useCallback(
    (restoreFocus = true) => {
      const previousId = selectedId;
      setSelectedId(null);
      setPanePosition(null);
      setMode('merge');
      if (restoreFocus && previousId) {
        requestAnimationFrame(() => rowButtons.current.get(previousId)?.focus());
      }
    },
    [selectedId],
  );
  const removeEditHistoryEntry = useCallback(() => {
    if (!editHistoryEntry.current) return;
    editHistoryEntry.current = false;
    window.history.back();
  }, []);

  useEffect(() => {
    if (!editingId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;
    function cancelRenameOnBack() {
      editHistoryEntry.current = false;
      renameInputRef.current?.blur();
      setEditingId(null);
    }
    function cancelRenameOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !renameInputRef.current?.contains(target)) {
        removeEditHistoryEntry();
        setEditingId(null);
      }
    }
    window.addEventListener('popstate', cancelRenameOnBack);
    document.addEventListener('pointerdown', cancelRenameOnOutsidePointer);
    return () => {
      window.removeEventListener('popstate', cancelRenameOnBack);
      document.removeEventListener('pointerdown', cancelRenameOnOutsidePointer);
    };
  }, [editingId, removeEditHistoryEntry]);

  useEffect(() => {
    if (!selectedId) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || paneRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest('[data-picklist-scope="recipe-picklist-manager"]')
      ) {
        return;
      }
      closePane(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [closePane, selectedId]);

  useLayoutEffect(() => {
    if (!selectedId) return;
    const pane = paneRef.current;
    const row = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-picklist-row]') ?? [],
    ).find((item) => item.dataset.picklistRow === selectedId);
    if (!pane || !row) return;
    const activePane = pane;
    const activeRow = row;

    function updatePanePosition() {
      if (!window.matchMedia('(max-width: 760px)').matches) {
        setPanePosition(null);
        return;
      }

      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const rowBounds = activeRow.getBoundingClientRect();
      const paneBounds = activePane.getBoundingClientRect();
      const spaceAbove = Math.max(0, rowBounds.top - viewportTop - 8);
      const spaceBelow = Math.max(0, viewportBottom - rowBounds.bottom - 8);
      const placeBelow = spaceBelow >= spaceAbove;
      const availableHeight = Math.max(120, (placeBelow ? spaceBelow : spaceAbove) - 16);
      const maxHeight = availableHeight;
      const top = placeBelow ? rowBounds.bottom + 8 : null;
      const bottom = placeBelow ? null : viewportBottom - rowBounds.top + 8;
      const left = Math.max(
        viewportLeft + 8,
        Math.min(
          rowBounds.right - paneBounds.width,
          viewportLeft + viewportWidth - paneBounds.width - 8,
        ),
      );

      setPanePosition((current) =>
        current?.top === top &&
        current.bottom === bottom &&
        current.left === left &&
        current.maxHeight === maxHeight
          ? current
          : { top, bottom, left, maxHeight },
      );
    }

    updatePanePosition();
    window.addEventListener('resize', updatePanePosition);
    window.addEventListener('scroll', updatePanePosition, true);
    window.visualViewport?.addEventListener('resize', updatePanePosition);
    window.visualViewport?.addEventListener('scroll', updatePanePosition);
    return () => {
      window.removeEventListener('resize', updatePanePosition);
      window.removeEventListener('scroll', updatePanePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePanePosition);
      window.visualViewport?.removeEventListener('scroll', updatePanePosition);
    };
  }, [selectedId]);

  useLayoutEffect(() => {
    if (!dropCommitPending || preview) return;
    const pending = pendingDrop.current;
    if (!pending) return;
    pendingDrop.current = null;

    const offsets = new Map<string, number>();
    for (const row of Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-picklist-row]') ?? [],
    )) {
      const rowId = row.dataset.picklistRow;
      const startingTop = rowId ? pending.rowTops.get(rowId) : undefined;
      if (rowId && startingTop !== undefined) {
        offsets.set(rowId, startingTop - row.getBoundingClientRect().top);
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
  }, [dropCommitPending, preview]);

  useEffect(() => {
    if (!selectedId) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePane();
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [closePane, selectedId]);

  function beginRename(value: ManagedValue) {
    window.history.pushState(null, '', window.location.href);
    editHistoryEntry.current = true;
    setEditingId(value.id);
    setEditValue(value.display_value);
  }

  function cancelRename(removeHistoryEntry = true) {
    if (removeHistoryEntry) removeEditHistoryEntry();
    setEditingId(null);
  }

  function openPane(value: ManagedValue, nextMode: ManagerMode) {
    setSelectedId(value.id);
    setMode(nextMode);
    setMergeCounterpartId('');
    setMergeKeepId(value.id);
    setReplacementId('');
    setClearOptional(false);
  }

  function submitMutation(
    action: string,
    fields: { name: string; value: string }[],
    successMessage: string,
    afterSaved?: () => void,
    refreshAfterSave = true,
  ) {
    const formData = new FormData();
    formData.set('action', action);
    formData.set('category', category);
    formData.set('revision', String(revisions[category] ?? 0));
    for (const field of fields) formData.append(field.name, field.value);

    startTransition(async () => {
      const result = await manageRecipePicklist({}, formData);
      setStatus(result.status === 'saved' ? successMessage : (result.message ?? ''));
      if (result.status === 'saved' || result.status === 'conflict') {
        if (result.status === 'saved') {
          const revision = (revisions[category] ?? 0) + 1;
          setRevisions((current) => ({ ...current, [category]: revision }));
          afterSaved?.();
        }
        if (result.status === 'conflict' || refreshAfterSave) router.refresh();
      } else {
        router.refresh();
      }
      if (result.status === 'saved') {
        if (action === 'delete') closePane();
        if (action === 'add') {
          setAddValue('');
          addInputRef.current?.blur();
        }
        if (action === 'merge') closePane();
      }
    });
  }

  function addEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!addValue.trim()) return;
    submitMutation('add', [{ name: 'value', value: addValue }], `${categoryLabel} added.`);
  }

  function saveRename(event: FormEvent<HTMLFormElement>, valueId: string) {
    event.preventDefault();
    const currentValue = rows.find((item) => item.id === valueId);
    if (!currentValue || !editValue.trim()) return;
    submitMutation(
      'rename',
      [
        { name: 'value_id', value: valueId },
        { name: 'value', value: editValue },
      ],
      `${categoryLabel} renamed.`,
      () => {
        setValues((current) =>
          current.map((item) =>
            item.id === valueId ? { ...item, display_value: editValue.trim() } : item,
          ),
        );
        removeEditHistoryEntry();
        setEditingId(null);
        requestAnimationFrame(() => rowButtons.current.get(valueId)?.focus());
      },
    );
  }

  function saveOrder(
    orderedRows: ManagedValue[],
    movedId: string,
    direction: 'up' | 'down',
    animate = false,
    successMessage?: string,
  ) {
    const movedValue = orderedRows.find((item) => item.id === movedId);
    if (!movedValue) return;
    if (animate) {
      pendingDrop.current = {
        sourceId: movedId,
        rowTops: new Map(
          Array.from(
            listRef.current?.querySelectorAll<HTMLElement>('[data-picklist-row]') ?? [],
          ).flatMap((row) => {
            const rowId = row.dataset.picklistRow;
            return rowId ? [[rowId, row.getBoundingClientRect().top] as const] : [];
          }),
        ),
      };
      setDropCommitPending(true);
    }
    const orderById = new Map(orderedRows.map((item, index) => [item.id, index]));
    setValues((current) =>
      current.map((item) =>
        item.category === category
          ? { ...item, sort_order: orderById.get(item.id) ?? item.sort_order }
          : item,
      ),
    );
    submitMutation(
      'reorder',
      orderedRows.map((item) => ({ name: 'ordered_id', value: item.id })),
      successMessage ?? `${movedValue.display_value} moved ${direction}.`,
      undefined,
      false,
    );
  }

  function moveByKeyboard(value: ManagedValue, direction: 'up' | 'down') {
    const index = rows.findIndex((item) => item.id === value.id);
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= rows.length) return;
    const orderedRows = [...rows];
    [orderedRows[index], orderedRows[nextIndex]] = [orderedRows[nextIndex], orderedRows[index]];
    saveOrder(orderedRows, value.id, direction, true);
  }

  function sortAlphabetically() {
    if (rows.length < 2) return;
    const confirmed = window.confirm(
      `Sort ${categoryLabel} A–Z? This will replace the current order.`,
    );
    if (!confirmed) return;
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const orderedRows = [...rows].sort((left, right) =>
      collator.compare(left.display_value, right.display_value),
    );
    if (orderedRows.every((item, index) => item.id === rows[index]?.id)) {
      setStatus(`${categoryLabel} is already sorted A–Z.`);
      return;
    }
    const firstSortedValue = orderedRows[0];
    if (firstSortedValue) {
      saveOrder(orderedRows, firstSortedValue.id, 'up', false, `${categoryLabel} sorted A–Z.`);
    }
  }

  function startDrag(value: ManagedValue, clientY: number, handle: HTMLButtonElement) {
    const sourceRow = handle.closest<HTMLElement>('[data-picklist-row]');
    const visibleRows = Array.from(
      handle.closest('ol')?.querySelectorAll<HTMLElement>('[data-picklist-row]') ?? [],
    );
    const bounds = visibleRows.map((row) => {
      const rect = row.getBoundingClientRect();
      return {
        id: row.dataset.picklistRow ?? '',
        top: rect.top + window.scrollY,
        bottom: rect.bottom + window.scrollY,
      };
    });
    reorderDrag.start(value.id, clientY, sourceRow?.getBoundingClientRect().height ?? 48, bounds);
  }

  function renderRow(value: ManagedValue, index: number) {
    const isDragging = preview?.sourceId === value.id;
    const isDisplaced = Boolean(
      preview &&
        ((sourceIndex < targetIndex && index > sourceIndex && index <= targetIndex) ||
          (sourceIndex > targetIndex && index >= targetIndex && index < sourceIndex)),
    );
    const reorderState = isDragging
      ? 'dragging'
      : isDisplaced
        ? 'displaced'
        : settlingSourceId === value.id
          ? 'settling'
          : undefined;
    const transform = preview
      ? isDragging
        ? `translateY(${preview.pointerOffset}px)`
        : isDisplaced
          ? `translateY(${sourceIndex < targetIndex ? -preview.offset : preview.offset}px)`
          : undefined
      : dropOffsets.has(value.id)
        ? `translateY(${dropOffsets.get(value.id)}px)`
        : undefined;

    return (
      <li
        className={styles.row}
        data-picklist-row={value.id}
        data-reorder-state={reorderState}
        key={value.id}
        style={{
          transform,
          transition: dropCommitPending || dropOffsets.has(value.id) ? 'none' : undefined,
        }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform' && settlingSourceId === value.id) {
            setSettlingSourceId(null);
          }
        }}
      >
        <span aria-hidden="true" className={styles.position}>
          {index + 1}
        </span>
        {editingId === value.id ? (
          <form className={styles.inlineEditor} onSubmit={(event) => saveRename(event, value.id)}>
            <input
              aria-label={`Rename ${value.display_value}`}
              className={styles.inlineInput}
              maxLength={80}
              ref={renameInputRef}
              required
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelRename();
                }
              }}
              onBlur={() => cancelRename()}
            />
          </form>
        ) : (
          <button
            aria-label={`Edit ${value.display_value}`}
            className={styles.valueButton}
            disabled={isPending}
            ref={(element) => {
              if (element) rowButtons.current.set(value.id, element);
              else rowButtons.current.delete(value.id);
            }}
            type="button"
            onClick={() => beginRename(value)}
          >
            <span>{value.display_value}</span>
            {value.is_protected && <span className={styles.protected}>Protected</span>}
          </button>
        )}
        <div className={styles.rowActions}>
          {editingId === value.id ? (
            <button
              aria-label={`Cancel rename ${value.display_value}`}
              className={styles.iconButton}
              title="Cancel rename"
              type="button"
              onClick={() => cancelRename()}
            >
              <X aria-hidden="true" size={18} />
            </button>
          ) : (
            <>
              <button
                aria-disabled={isPending || Boolean(selectedId) || Boolean(editingId)}
                aria-label={`Reorder ${value.display_value}`}
                className={styles.dragHandle}
                title="Drag to reorder. Use Ctrl+Up or Ctrl+Down to move by keyboard."
                type="button"
                onPointerDown={(event) => {
                  if (event.button !== 0 || isPending || selectedId || editingId) return;
                  startDrag(value, event.clientY, event.currentTarget);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => reorderDrag.move(event.clientY)}
                onPointerUp={(event) => {
                  const handle = event.currentTarget;
                  const targetId = document
                    .elementFromPoint(event.clientX, event.clientY)
                    ?.closest<HTMLElement>('[data-picklist-row]')?.dataset.picklistRow;
                  const drag = reorderDrag.finish(targetId);
                  if (drag && drag.sourceId !== drag.targetId) {
                    const first = rows.findIndex((item) => item.id === drag.sourceId);
                    const last = rows.findIndex((item) => item.id === drag.targetId);
                    const orderedRows = [...rows];
                    const [moved] = orderedRows.splice(first, 1);
                    orderedRows.splice(last, 0, moved);
                    saveOrder(orderedRows, moved.id, last < first ? 'up' : 'down', true);
                  }
                  handle.focus();
                }}
                onPointerCancel={(event) => {
                  reorderDrag.cancel();
                  event.currentTarget.focus();
                }}
                onKeyDown={(event) => {
                  if (isPending || selectedId || editingId) return;
                  if (event.key === 'Escape' && reorderDrag.preview) {
                    event.preventDefault();
                    reorderDrag.cancel();
                    event.currentTarget.focus();
                  } else if (event.ctrlKey && event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveByKeyboard(value, 'up');
                  } else if (event.ctrlKey && event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveByKeyboard(value, 'down');
                  }
                }}
              >
                <GripVertical aria-hidden="true" size={18} />
              </button>
              <button
                aria-label={`Merge ${value.display_value}`}
                className={styles.iconButton}
                disabled={isPending || value.is_protected}
                title="Merge with another value"
                type="button"
                onClick={() => openPane(value, 'merge')}
              >
                <Merge aria-hidden="true" size={18} />
              </button>
              <button
                aria-label={`Delete ${value.display_value}`}
                className={styles.iconButton}
                disabled={isPending || value.is_protected}
                title="Delete value"
                type="button"
                onClick={() => openPane(value, 'delete')}
              >
                <Trash2 aria-hidden="true" size={18} />
              </button>
            </>
          )}
        </div>
      </li>
    );
  }

  function renderPane() {
    if (!selectedValue) return null;
    const paneLabel =
      mode === 'merge' ? `Merge ${categoryLabel} values` : `Delete ${categoryLabel} value`;
    const mergeCounterpart = rows.find((item) => item.id === mergeCounterpartId);
    const mergeKeepValue = rows.find((item) => item.id === mergeKeepId);
    const mergeOptions = rows
      .filter((item) => item.id !== selectedValue.id && !item.is_protected)
      .map((item) => ({ value: item.id, label: item.display_value }));

    return (
      <section
        aria-label={paneLabel}
        aria-labelledby="picklist-pane-title"
        className={`${styles.pane} ${mode === 'merge' ? styles.mergePane : ''}`}
        ref={paneRef}
        style={
          panePosition
            ? {
                top: panePosition.top ?? 'auto',
                bottom: panePosition.bottom ?? 'auto',
                left: panePosition.left,
                right: 'auto',
                maxHeight: panePosition.maxHeight,
              }
            : undefined
        }
      >
        <div className={styles.paneHeading}>
          <h3 id="picklist-pane-title">{paneLabel}</h3>
          <button
            aria-label="Close"
            className={styles.iconButton}
            type="button"
            onClick={() => closePane()}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {mode === 'merge' && (
          <div className={styles.form}>
            <div className={styles.field}>
              <span>{`Merge ${selectedValue.display_value} with`}</span>
              <Picklist
                className={styles.mergePicklist}
                label={`Merge ${selectedValue.display_value} with`}
                measureLabel={categoryLabel}
                menuClassName={styles.mergePicklistMenu}
                options={mergeOptions}
                sizeToContent={false}
                scope="recipe-picklist-manager"
                value={mergeCounterpartId}
                onSelect={(valueId) => {
                  setMergeCounterpartId(valueId);
                  setMergeKeepId(null);
                }}
              >
                {mergeCounterpart?.display_value ?? 'Choose an item'}
              </Picklist>
            </div>
            <fieldset className={styles.keepChoices}>
              <legend>Keep as</legend>
              <button
                aria-pressed={mergeKeepId === selectedValue.id}
                className={styles.keepButton}
                disabled={!mergeCounterpart || isPending}
                type="button"
                onClick={() => setMergeKeepId(selectedValue.id)}
              >
                {selectedValue.display_value}
              </button>
              <button
                aria-pressed={mergeKeepId === mergeCounterpart?.id}
                className={styles.keepButton}
                disabled={!mergeCounterpart || isPending}
                type="button"
                onClick={() => mergeCounterpart && setMergeKeepId(mergeCounterpart.id)}
              >
                {mergeCounterpart?.display_value ?? 'Other item'}
              </button>
            </fieldset>
            <button
              className={styles.saveButton}
              disabled={isPending || !mergeCounterpart || !mergeKeepValue}
              type="button"
              onClick={() =>
                submitMutation(
                  'merge',
                  [
                    {
                      name: 'source_id',
                      value:
                        mergeKeepValue?.id === selectedValue.id
                          ? mergeCounterpartId
                          : selectedValue.id,
                    },
                    { name: 'target_id', value: mergeKeepValue?.id ?? '' },
                  ],
                  `${categoryLabel} values merged.`,
                )
              }
            >
              Merge
            </button>
          </div>
        )}

        {mode === 'delete' && (
          <div className={styles.form}>
            <p className={styles.note}>
              Used by {selectedReferences.recipes}{' '}
              {selectedReferences.recipes === 1 ? 'recipe' : 'recipes'}
              {selectedReferences.measurements > 0 &&
                ` and ${selectedReferences.measurements} measurement${selectedReferences.measurements === 1 ? '' : 's'}`}
              .
            </p>
            <p className={styles.note}>
              {selectedReferences.recipes === 0
                ? 'This value is not used by any recipes and can be deleted without a replacement.'
                : requiresReplacement
                  ? 'A replacement is required to keep these measurements valid.'
                  : 'Choose a replacement to preserve these recipe references, or clear the optional references.'}
            </p>
            {selectedReferences.recipes > 0 && (
              <div className={styles.field}>
                <span>Replace with</span>
                <Picklist
                  className={styles.replacementPicklist}
                  label="Replace with"
                  measureLabel={categoryLabel}
                  options={rows
                    .filter((item) => item.id !== selectedValue.id && !item.is_protected)
                    .map((item) => ({ value: item.id, label: item.display_value }))}
                  sizeToContent={false}
                  scope="recipe-picklist-manager"
                  value={replacementId}
                  onSelect={setReplacementId}
                >
                  {rows.find((item) => item.id === replacementId)?.display_value ??
                    'Choose replacement'}
                </Picklist>
              </div>
            )}
            {!requiresReplacement && selectedReferences.recipes > 0 && (
              <label className={styles.checkRow}>
                <input
                  checked={clearOptional}
                  type="checkbox"
                  onChange={(event) => setClearOptional(event.target.checked)}
                />
                <span>
                  {category === 'meal_type' || category === 'cuisine' || category === 'equipment'
                    ? 'Remove this optional tag from recipes'
                    : 'Clear optional recipe references'}
                </span>
              </label>
            )}
            <button
              className={styles.deleteButton}
              disabled={isPending || (requiresReplacement && !replacementId)}
              type="button"
              onClick={() =>
                submitMutation(
                  'delete',
                  [
                    { name: 'value_id', value: selectedValue.id },
                    { name: 'replacement_id', value: replacementId },
                    { name: 'clear_optional', value: String(clearOptional) },
                  ],
                  `${categoryLabel} deleted.`,
                )
              }
            >
              Delete value
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="recipe-picklists-title"
      className="settings-section settings-picklists-section"
    >
      <h2 className={styles.sectionHeading}>
        <button
          aria-controls="recipe-picklists-editor"
          aria-expanded={isExpanded}
          className={styles.sectionToggle}
          id="recipe-picklists-title"
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <ChevronRight aria-hidden="true" className={styles.sectionChevron} size={18} />
          <span className={styles.sectionLabel}>Picklists</span>
        </button>
      </h2>
      <div hidden={!isExpanded} id="recipe-picklists-editor">
        <div className={styles.manager}>
          <div className={styles.toolbar}>
            <label className={styles.categoryField}>
              <span>Picklist category</span>
              <select
                value={category}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && !event.currentTarget.matches(':open')) {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
                onChange={(event) => {
                  setCategory(event.target.value as PicklistCategory);
                  setSelectedId(null);
                  cancelRename();
                  setStatus('');
                }}
              >
                {categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-label="Sort A–Z"
              className={styles.sortButton}
              disabled={isPending || rows.length < 2}
              title="Sort A–Z"
              type="button"
              onClick={sortAlphabetically}
            >
              <ArrowDownAZ aria-hidden="true" size={18} />
            </button>
          </div>
          <div className={styles.columns}>
            <div className={styles.listColumn}>
              <ol aria-label={categoryLabel} className={styles.list} ref={listRef}>
                {rows.map(renderRow)}
              </ol>
              <form className={styles.addRow} onSubmit={addEntry}>
                <span aria-hidden="true" className={styles.position} />
                <input
                  aria-label={`Add ${categoryLabel}`}
                  className={styles.addInput}
                  maxLength={80}
                  placeholder={`add ${categoryLabel.toLowerCase()}`}
                  ref={addInputRef}
                  value={addValue}
                  onChange={(event) => setAddValue(event.target.value)}
                />
              </form>
            </div>
            {renderPane()}
          </div>
          <p aria-live="polite" className={styles.status} role="status">
            {isPending ? 'Saving...' : status}
          </p>
        </div>
      </div>
    </section>
  );
}
