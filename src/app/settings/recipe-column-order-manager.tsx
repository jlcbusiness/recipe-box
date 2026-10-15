'use client';

import { ChevronRight, Eye, EyeOff, GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import {
  getExplorerColumns,
  normalizeHiddenRecipeColumns,
  normalizeRecipeColumnOrder,
} from '../../lib/explorer-state';
import { saveRecipeColumnOrder, saveRecipeHiddenColumns } from '../actions/recipe-column-order';
import { useReorderDrag } from '../recipes/use-reorder-drag';
import styles from './recipe-column-order-manager.module.css';

export function RecipeColumnOrderManager({
  initialOrder,
  initialHiddenColumns,
}: {
  initialOrder: string[];
  initialHiddenColumns: string[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState(() => normalizeRecipeColumnOrder(initialOrder));
  const [hiddenColumns, setHiddenColumns] = useState(() =>
    normalizeHiddenRecipeColumns(initialHiddenColumns),
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState('');
  const [dropOffsets, setDropOffsets] = useState<Map<string, number>>(() => new Map());
  const [dropCommitPending, setDropCommitPending] = useState(false);
  const [settlingSourceId, setSettlingSourceId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const orderRef = useRef(order);
  const hiddenColumnsRef = useRef(hiddenColumns);
  const listRef = useRef<HTMLOListElement>(null);
  const isDragActiveRef = useRef(false);
  const dragPointerYRef = useRef<number | null>(null);
  const listScrollOffsetRef = useRef(0);
  const dragContentBoundsRef = useRef<{
    sourceTop: number;
    contentHeight: number;
    rowHeight: number;
  } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const pendingDrop = useRef<{ sourceId: string; rowTops: Map<string, number> } | null>(null);
  const reorderDrag = useReorderDrag();

  useEffect(() => {
    const nextOrder = normalizeRecipeColumnOrder(initialOrder);
    orderRef.current = nextOrder;
    setOrder(nextOrder);
  }, [initialOrder]);

  useEffect(() => {
    const nextHiddenColumns = normalizeHiddenRecipeColumns(initialHiddenColumns);
    hiddenColumnsRef.current = nextHiddenColumns;
    setHiddenColumns(nextHiddenColumns);
  }, [initialHiddenColumns]);

  useEffect(
    () => () => {
      isDragActiveRef.current = false;
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
      }
    },
    [],
  );

  const columns = getExplorerColumns('recipes-find', order);
  const preview = reorderDrag.preview;
  const sourceIndex = preview ? order.indexOf(preview.sourceId) : -1;
  const targetIndex = preview ? order.indexOf(preview.targetId) : -1;

  useLayoutEffect(() => {
    if (!dropCommitPending || preview) return;
    const pending = pendingDrop.current;
    if (!pending) return;
    pendingDrop.current = null;

    const offsets = new Map<string, number>();
    for (const row of Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-recipe-column-row]') ?? [],
    )) {
      const key = row.dataset.recipeColumnRow;
      const startingTop = key ? pending.rowTops.get(key) : undefined;
      if (key && startingTop !== undefined) {
        offsets.set(key, startingTop - row.getBoundingClientRect().top);
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

  function commitOrder(nextOrder: string[], movedKey: string) {
    if (isPending || nextOrder.every((key, index) => key === orderRef.current[index])) return;
    const previousOrder = orderRef.current;
    const movedColumn = columns.find(({ key }) => key === movedKey);
    pendingDrop.current = {
      sourceId: movedKey,
      rowTops: new Map(
        Array.from(
          listRef.current?.querySelectorAll<HTMLElement>('[data-recipe-column-row]') ?? [],
        ).flatMap((row) => {
          const key = row.dataset.recipeColumnRow;
          return key ? [[key, row.getBoundingClientRect().top] as const] : [];
        }),
      ),
    };
    setDropCommitPending(true);
    orderRef.current = nextOrder;
    setOrder(nextOrder);
    startTransition(async () => {
      const result = await saveRecipeColumnOrder(nextOrder);
      if (result.error) {
        orderRef.current = previousOrder;
        setOrder(previousOrder);
        setStatus(result.error);
        return;
      }
      setStatus(
        `${movedColumn?.label ?? 'Column'} moved to position ${nextOrder.indexOf(movedKey) + 1}.`,
      );
      router.refresh();
    });
  }

  function moveByKeyboard(columnKey: string, direction: 'up' | 'down') {
    const index = orderRef.current.indexOf(columnKey);
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= orderRef.current.length) return;
    const nextOrder = [...orderRef.current];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    commitOrder(nextOrder, columnKey);
  }

  function toggleColumnVisibility(columnKey: string, columnLabel: string) {
    if (isPending || columns.find(({ key }) => key === columnKey)?.required) return;
    const currentHiddenColumns = hiddenColumnsRef.current;
    const isHidden = currentHiddenColumns.includes(columnKey);
    const nextHiddenColumns = isHidden
      ? currentHiddenColumns.filter((key) => key !== columnKey)
      : [...currentHiddenColumns, columnKey];
    hiddenColumnsRef.current = nextHiddenColumns;
    setHiddenColumns(nextHiddenColumns);
    setStatus('');

    startTransition(async () => {
      const result = await saveRecipeHiddenColumns(nextHiddenColumns);
      if (result.error) {
        hiddenColumnsRef.current = currentHiddenColumns;
        setHiddenColumns(currentHiddenColumns);
        setStatus(result.error);
        return;
      }
      setStatus(
        isHidden
          ? `${columnLabel} shown in recipe tables.`
          : `${columnLabel} hidden from recipe tables.`,
      );
      router.refresh();
    });
  }

  function hideOptionalColumns() {
    if (isPending) return;
    const previousHiddenColumns = hiddenColumnsRef.current;
    const nextHiddenColumns = columns.filter(({ required }) => !required).map(({ key }) => key);
    if (
      previousHiddenColumns.length === nextHiddenColumns.length &&
      nextHiddenColumns.every((key) => previousHiddenColumns.includes(key))
    ) {
      return;
    }

    hiddenColumnsRef.current = nextHiddenColumns;
    setHiddenColumns(nextHiddenColumns);
    setStatus('');
    startTransition(async () => {
      const result = await saveRecipeHiddenColumns(nextHiddenColumns);
      if (result.error) {
        hiddenColumnsRef.current = previousHiddenColumns;
        setHiddenColumns(previousHiddenColumns);
        setStatus(result.error);
        return;
      }
      setStatus('All optional recipe columns hidden.');
      router.refresh();
    });
  }

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
    const list = listRef.current;
    const listBounds = list?.getBoundingClientRect();
    if (list && listBounds && pointerY >= listBounds.top && pointerY <= listBounds.bottom) {
      const distanceToTop = edgeSize - (pointerY - listBounds.top);
      const distanceToBottom = pointerY - (listBounds.bottom - edgeSize);
      const listDelta =
        distanceToTop > 0
          ? -Math.min(16, Math.ceil(distanceToTop / 4))
          : distanceToBottom > 0
            ? Math.min(16, Math.ceil(distanceToBottom / 4))
            : 0;
      if (listDelta !== 0) {
        const previousScrollTop = list.scrollTop;
        list.scrollTop += listDelta;
        const actualScrollDelta = list.scrollTop - previousScrollTop;
        listScrollOffsetRef.current += actualScrollDelta;
      }
    }
    reorderDrag.move(pointerY, listScrollOffsetRef.current);
    autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollWhileDragging);
  }

  function trackDragPointer(clientY: number) {
    if (!isDragActiveRef.current) return;
    dragPointerYRef.current = clientY;
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollWhileDragging);
    }
  }

  function startDrag(columnKey: string, clientY: number, handle: HTMLButtonElement) {
    const sourceRow = handle.closest<HTMLElement>('[data-recipe-column-row]');
    const rows = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[data-recipe-column-row]') ?? [],
    );
    const bounds = rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return {
        id: row.dataset.recipeColumnRow ?? '',
        top: rect.top + window.scrollY,
        bottom: rect.bottom + window.scrollY,
      };
    });
    const list = listRef.current;
    const listBounds = list?.getBoundingClientRect();
    const sourceBounds = sourceRow?.getBoundingClientRect();
    listScrollOffsetRef.current = 0;
    isDragActiveRef.current = true;
    dragContentBoundsRef.current =
      list && listBounds && sourceBounds
        ? {
            sourceTop: sourceBounds.top - listBounds.top + list.scrollTop,
            contentHeight: list.scrollHeight,
            rowHeight: sourceBounds.height,
          }
        : null;
    reorderDrag.start(columnKey, clientY, sourceRow?.getBoundingClientRect().height ?? 52, bounds);
  }

  function renderColumn(column: (typeof columns)[number], index: number) {
    const isRequired = Boolean(column.required);
    const isHidden = hiddenColumns.includes(column.key) && !isRequired;
    const isDragging = preview?.sourceId === column.key;
    const isDisplaced = Boolean(
      preview &&
        ((sourceIndex < targetIndex && index > sourceIndex && index <= targetIndex) ||
          (sourceIndex > targetIndex && index >= targetIndex && index < sourceIndex)),
    );
    const reorderState = isDragging
      ? 'dragging'
      : isDisplaced
        ? 'displaced'
        : settlingSourceId === column.key
          ? 'settling'
          : undefined;
    const dragContentBounds = isDragging ? dragContentBoundsRef.current : null;
    const pointerOffset = dragContentBounds
      ? Math.max(
          -dragContentBounds.sourceTop,
          Math.min(
            dragContentBounds.contentHeight -
              dragContentBounds.sourceTop -
              dragContentBounds.rowHeight,
            preview?.pointerOffset ?? 0,
          ),
        )
      : (preview?.pointerOffset ?? 0);
    const transform = preview
      ? isDragging
        ? `translateY(${pointerOffset}px)`
        : isDisplaced
          ? `translateY(${sourceIndex < targetIndex ? -preview.offset : preview.offset}px)`
          : undefined
      : dropOffsets.has(column.key)
        ? `translateY(${dropOffsets.get(column.key)}px)`
        : undefined;

    return (
      <li
        className={styles.row}
        data-recipe-column-row={column.key}
        data-hidden={isHidden || undefined}
        data-reorder-state={reorderState}
        key={column.key}
        style={{
          transform,
          transition: dropCommitPending || dropOffsets.has(column.key) ? 'none' : undefined,
        }}
        onTransitionEnd={(event) => {
          if (event.propertyName === 'transform' && settlingSourceId === column.key) {
            setSettlingSourceId(null);
          }
        }}
      >
        <span aria-hidden="true" className={styles.position}>
          {index + 1}
        </span>
        <button
          aria-label={`Reorder ${column.label}`}
          className={styles.dragArea}
          disabled={isPending}
          title="Drag to reorder. Use Ctrl+Up or Ctrl+Down to move by keyboard."
          type="button"
          onPointerDown={(event) => {
            if (event.button !== 0 || isPending) return;
            startDrag(column.key, event.clientY, event.currentTarget);
            trackDragPointer(event.clientY);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            trackDragPointer(event.clientY);
            reorderDrag.move(event.clientY, listScrollOffsetRef.current);
          }}
          onPointerUp={(event) => {
            stopAutoScroll();
            reorderDrag.move(event.clientY, listScrollOffsetRef.current);
            const targetKey = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>('[data-recipe-column-row]')?.dataset.recipeColumnRow;
            const drag = reorderDrag.finish(targetKey);
            if (drag && drag.sourceId !== drag.targetId) {
              const source = orderRef.current.indexOf(drag.sourceId);
              const target = orderRef.current.indexOf(drag.targetId);
              const nextOrder = [...orderRef.current];
              const [movedKey] = nextOrder.splice(source, 1);
              nextOrder.splice(target, 0, movedKey);
              commitOrder(nextOrder, movedKey);
            }
            event.currentTarget.focus();
          }}
          onPointerCancel={(event) => {
            stopAutoScroll();
            reorderDrag.cancel();
            event.currentTarget.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && preview) {
              event.preventDefault();
              stopAutoScroll();
              reorderDrag.cancel();
            } else if (event.ctrlKey && event.key === 'ArrowUp') {
              event.preventDefault();
              moveByKeyboard(column.key, 'up');
            } else if (event.ctrlKey && event.key === 'ArrowDown') {
              event.preventDefault();
              moveByKeyboard(column.key, 'down');
            }
          }}
        >
          <span className={styles.columnName}>{column.label}</span>
          <GripVertical aria-hidden="true" size={18} />
        </button>
        <button
          aria-label={
            isRequired
              ? `${column.label} is always visible`
              : `${isHidden ? 'Show' : 'Hide'} ${column.label} in recipe tables`
          }
          aria-pressed={!isHidden}
          className={styles.visibilityToggle}
          disabled={isPending || isRequired}
          title={
            isRequired
              ? `${column.label} is always visible`
              : `${isHidden ? 'Show' : 'Hide'} ${column.label} in recipe tables`
          }
          type="button"
          onClick={() => toggleColumnVisibility(column.key, column.label)}
        >
          {isHidden ? (
            <EyeOff aria-hidden="true" size={18} />
          ) : (
            <Eye aria-hidden="true" size={18} />
          )}
        </button>
      </li>
    );
  }

  return (
    <section aria-label="Recipe columns" className={styles.manager}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeading}>
          <button
            aria-controls="recipe-column-order-list"
            aria-expanded={isExpanded}
            className={styles.sectionToggle}
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
          >
            <ChevronRight aria-hidden="true" className={styles.sectionChevron} size={18} />
            <span className={styles.sectionLabel}>Recipe columns</span>
          </button>
        </h2>
        <button
          aria-label="Check None"
          className={styles.checkNone}
          disabled={
            isPending ||
            columns.every(({ key, required }) => required || hiddenColumns.includes(key))
          }
          title="Check None"
          type="button"
          onClick={hideOptionalColumns}
        >
          <EyeOff aria-hidden="true" size={18} />
        </button>
      </div>
      <div hidden={!isExpanded} id="recipe-column-order-list">
        <ol aria-label="Recipe column order" className={styles.list} ref={listRef}>
          {columns.map(renderColumn)}
        </ol>
        {(isPending || status) && (
          <p aria-live="polite" className={styles.status} role="status">
            {isPending ? 'Saving...' : status}
          </p>
        )}
      </div>
    </section>
  );
}
