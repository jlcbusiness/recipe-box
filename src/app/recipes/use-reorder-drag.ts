'use client';

import { useRef, useState } from 'react';

export type ReorderDragBound = {
  id: string;
  targetId?: string;
  top: number;
  bottom: number;
  isHeader?: boolean;
  isEmpty?: boolean;
  isTarget?: boolean;
};

export type ReorderDragPreview = {
  sourceId: string;
  targetId: string;
  offset: number;
  pointerOffset: number;
  offsets: Map<string, number>;
};

export function useReorderDrag() {
  const [preview, setPreview] = useState<ReorderDragPreview | null>(null);
  const activeDrag = useRef<{
    sourceId: string;
    targetId: string;
    startDocumentY: number;
    offset: number;
    order: string[];
    projectedOrder: string[];
    bounds: Map<
      string,
      {
        targetId: string;
        top: number;
        bottom: number;
        isHeader: boolean;
        isEmpty: boolean;
        isTarget: boolean;
      }
    >;
    targetIsHeader: boolean;
    targetIsEmpty: boolean;
    hasMoved: boolean;
  } | null>(null);

  function start(sourceId: string, clientY: number, offset: number, rowBounds: ReorderDragBound[]) {
    activeDrag.current = {
      sourceId,
      targetId: sourceId,
      startDocumentY: clientY + window.scrollY,
      offset,
      order: rowBounds.map(({ id }) => id),
      projectedOrder: rowBounds.map(({ id }) => id),
      bounds: new Map(
        rowBounds.map(({ id, targetId, top, bottom, isHeader, isEmpty, isTarget }) => [
          id,
          {
            targetId: targetId ?? id,
            top,
            bottom,
            isHeader: isHeader ?? false,
            isEmpty: isEmpty ?? false,
            isTarget: isTarget ?? true,
          },
        ]),
      ),
      targetIsHeader: false,
      targetIsEmpty: false,
      hasMoved: false,
    };
    setPreview({
      sourceId,
      targetId: sourceId,
      offset,
      pointerOffset: 0,
      offsets: new Map(),
    });
  }

  function move(clientY: number, scrollOffset = 0) {
    const current = activeDrag.current;
    if (!current) {
      return;
    }

    current.hasMoved = true;
    const documentY = clientY + window.scrollY + scrollOffset;
    const hitBounds = Array.from(current.bounds.values()).find(
      (bounds) => bounds.isTarget && documentY >= bounds.top && documentY <= bounds.bottom,
    );
    current.targetId = hitBounds?.targetId ?? current.sourceId;
    const pointerOffset = documentY - current.startDocumentY;
    const targetIsHeader = hitBounds?.isHeader ?? false;
    const targetIsEmpty = hitBounds?.isEmpty ?? false;
    current.targetIsHeader = targetIsHeader;
    current.targetIsEmpty = targetIsEmpty;
    const projectedOrder = [...current.order];
    const sourceIndex = projectedOrder.indexOf(current.sourceId);
    if (sourceIndex >= 0) {
      projectedOrder.splice(sourceIndex, 1);
    }
    const targetIndex = projectedOrder.indexOf(current.targetId);
    if (targetIndex >= 0) {
      const insertAfterTarget =
        !targetIsHeader &&
        !targetIsEmpty &&
        sourceIndex >= 0 &&
        sourceIndex < current.order.indexOf(current.targetId);
      projectedOrder.splice(targetIndex + (insertAfterTarget ? 1 : 0), 0, current.sourceId);
    } else if (sourceIndex >= 0) {
      projectedOrder.splice(sourceIndex, 0, current.sourceId);
    }
    current.projectedOrder = projectedOrder;

    const offsets = new Map<string, number>();
    const firstItem = current.order[0];
    let nextTop = firstItem ? current.bounds.get(firstItem)?.top : undefined;
    for (const itemId of projectedOrder) {
      const bounds = current.bounds.get(itemId);
      if (!bounds || nextTop === undefined) {
        continue;
      }
      offsets.set(itemId, nextTop - bounds.top);
      nextTop += bounds.bottom - bounds.top;
    }
    setPreview((currentPreview) =>
      currentPreview &&
      currentPreview.targetId === current.targetId &&
      currentPreview.pointerOffset === pointerOffset
        ? currentPreview
        : {
            sourceId: current.sourceId,
            targetId: current.targetId,
            offset: current.offset,
            pointerOffset,
            offsets,
          },
    );
  }

  function finish(fallbackTargetId?: string) {
    const current = activeDrag.current;
    if (!current) {
      return null;
    }

    const targetId = current.hasMoved ? current.targetId : fallbackTargetId;
    activeDrag.current = null;
    setPreview(null);
    if (!targetId) {
      return null;
    }
    const sourceIndex = current.order.indexOf(current.sourceId);
    const targetIndex = current.order.indexOf(targetId);
    const insertBeforeTarget =
      current.targetIsHeader || current.targetIsEmpty || sourceIndex > targetIndex;
    const insertAfterTarget =
      !current.targetIsHeader && !current.targetIsEmpty && sourceIndex < targetIndex;
    return {
      sourceId: current.sourceId,
      targetId,
      insertBeforeTarget,
      insertAfterTarget,
      order: current.projectedOrder,
    };
  }

  function cancel() {
    activeDrag.current = null;
    setPreview(null);
  }

  return { preview, start, move, finish, cancel };
}
