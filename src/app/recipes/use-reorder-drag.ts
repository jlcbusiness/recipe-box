'use client';

import { useRef, useState } from 'react';

export type ReorderDragBound = {
  id: string;
  top: number;
  bottom: number;
};

export type ReorderDragPreview = {
  sourceId: string;
  targetId: string;
  offset: number;
  pointerOffset: number;
  slotOffset: number;
};

export function useReorderDrag() {
  const [preview, setPreview] = useState<ReorderDragPreview | null>(null);
  const activeDrag = useRef<{
    sourceId: string;
    targetId: string;
    startDocumentY: number;
    offset: number;
    bounds: Map<string, { top: number; bottom: number }>;
    hasMoved: boolean;
  } | null>(null);

  function start(sourceId: string, clientY: number, offset: number, rowBounds: ReorderDragBound[]) {
    activeDrag.current = {
      sourceId,
      targetId: sourceId,
      startDocumentY: clientY + window.scrollY,
      offset,
      bounds: new Map(rowBounds.map(({ id, top, bottom }) => [id, { top, bottom }])),
      hasMoved: false,
    };
    setPreview({ sourceId, targetId: sourceId, offset, pointerOffset: 0, slotOffset: 0 });
  }

  function move(clientY: number) {
    const current = activeDrag.current;
    if (!current) {
      return;
    }

    current.hasMoved = true;
    const documentY = clientY + window.scrollY;
    current.targetId =
      Array.from(current.bounds).find(
        ([, bounds]) => documentY >= bounds.top && documentY <= bounds.bottom,
      )?.[0] ?? current.sourceId;
    const pointerOffset = documentY - current.startDocumentY;
    const sourceBounds = current.bounds.get(current.sourceId);
    const targetBounds = current.bounds.get(current.targetId);
    const slotOffset =
      current.targetId === current.sourceId || !sourceBounds || !targetBounds
        ? pointerOffset
        : sourceBounds.top < targetBounds.top
          ? targetBounds.bottom - current.offset - sourceBounds.top
          : targetBounds.top - sourceBounds.top;
    setPreview((currentPreview) =>
      currentPreview &&
      currentPreview.targetId === current.targetId &&
      currentPreview.pointerOffset === pointerOffset &&
      currentPreview.slotOffset === slotOffset
        ? currentPreview
        : {
            sourceId: current.sourceId,
            targetId: current.targetId,
            offset: current.offset,
            pointerOffset,
            slotOffset,
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
    return targetId ? { sourceId: current.sourceId, targetId } : null;
  }

  function cancel() {
    activeDrag.current = null;
    setPreview(null);
  }

  return { preview, start, move, finish, cancel };
}
