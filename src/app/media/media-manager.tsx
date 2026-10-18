'use client';

import { Camera, ImagePlus, Pencil, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { ClipboardEvent, PointerEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MediaAssetDisplay } from '../../lib/media/data';
import { MAX_IMAGE_UPLOAD_BYTES, MAX_RECIPE_PHOTOS } from '../../lib/media/rules';
import type { PublicationOption } from '../../lib/recipes/data';
import { PublicationCover } from '../publications/publication-cover';
import { uploadMediaFiles } from './upload-files';

type MediaParent = 'recipe' | 'publication';

type MediaManagerProps = {
  parentType: MediaParent;
  parentId: string;
  parentName: string;
  assets: MediaAssetDisplay[];
  publication?: PublicationOption;
};

type ApiError = {
  error?: string;
  cleanupPending?: boolean;
  message?: string;
};

type ActivePointerDrag = {
  sourceId: string;
  sourceIndex: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  targetIndex: number;
};

async function responseError(response: Response, fallback: string) {
  let payload: ApiError = {};
  try {
    payload = (await response.json()) as ApiError;
  } catch {
    return fallback;
  }
  return payload.error || fallback;
}

export function MediaManager({
  parentType,
  parentId,
  parentName,
  assets,
  publication,
}: MediaManagerProps) {
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [removeCoverOnSubmit, setRemoveCoverOnSubmit] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [optimisticPhotoOrder, setOptimisticPhotoOrder] = useState<string[] | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deviceInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const pointerDragRef = useRef<ActivePointerDrag | null>(null);
  const suppressClickRef = useRef(false);
  const keyboardFocusPhotoIdRef = useRef<string | null>(null);
  const recipePhotos = parentType === 'recipe';
  const cover = assets[0] ?? null;
  const remainingPhotos = Math.max(0, MAX_RECIPE_PHOTOS - assets.length);
  const router = useRouter();
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const orderedAssets = optimisticPhotoOrder
    ?.map((id) => assetsById.get(id))
    .filter((asset): asset is MediaAssetDisplay => asset !== undefined);
  const recipePhotoAssets =
    recipePhotos && orderedAssets?.length === assets.length
      ? orderedAssets.map((asset, index) => ({
          ...asset,
          is_primary: index === 0,
        }))
      : assets;
  const primaryRecipePhoto =
    recipePhotoAssets.find((asset) => asset.is_primary) ?? recipePhotoAssets[0] ?? null;

  useLayoutEffect(() => {
    const photoId = keyboardFocusPhotoIdRef.current;
    if (working || !photoId) {
      return;
    }

    const button = Array.from(
      gridRef.current?.querySelectorAll<HTMLButtonElement>('.recipe-photo-grid-select') ?? [],
    ).find(
      (candidate) => candidate.closest<HTMLElement>('[data-photo-id]')?.dataset.photoId === photoId,
    );
    button?.focus();
    keyboardFocusPhotoIdRef.current = null;
  }, [working]);

  useEffect(() => {
    if (!pendingCoverFile) {
      setCoverPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(pendingCoverFile);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingCoverFile]);

  useEffect(() => {
    const fileInput = deviceInputRef.current;
    const preventDialogCancel = (event: Event) => event.stopPropagation();
    fileInput?.addEventListener('cancel', preventDialogCancel);
    return () => {
      fileInput?.removeEventListener('cancel', preventDialogCancel);
    };
  }, []);

  useEffect(() => {
    if (!optimisticPhotoOrder) {
      return;
    }
    const currentIds = assets.map((asset) => asset.id);
    if (
      currentIds.length !== optimisticPhotoOrder.length ||
      optimisticPhotoOrder.some((id) => !currentIds.includes(id))
    ) {
      setOptimisticPhotoOrder(null);
    } else if (currentIds.every((id, index) => id === optimisticPhotoOrder[index])) {
      setOptimisticPhotoOrder(null);
    }
  }, [assets, optimisticPhotoOrder]);

  function openPane() {
    setError('');
    setStatus('');
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('#media-manager-title')?.focus();
  }

  function cancelPane() {
    if (!recipePhotos) {
      setPendingCoverFile(null);
      setRemoveCoverOnSubmit(false);
    }
    setError('');
    dialogRef.current?.close();
  }

  function chooseCoverFile(file: File | null) {
    if (!file) {
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError(`${file.name}: images must be 20 MiB or smaller.`);
      return;
    }
    setPendingCoverFile(file);
    setRemoveCoverOnSubmit(false);
    setError('');
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) {
      return true;
    }
    setWorking(true);
    setError('');
    setStatus('');

    let uploaded = 0;
    try {
      const result = await uploadMediaFiles(
        parentType,
        parentId,
        files,
        (index, total) => setStatus(`Uploading image ${index} of ${total}…`),
        () => {
          uploaded += 1;
        },
      );

      setStatus(
        result.cleanupPending
          ? 'Image saved. Temporary-file cleanup is queued for retry.'
          : uploaded === 1
            ? recipePhotos
              ? 'Photo uploaded.'
              : 'Publication cover saved.'
            : `${uploaded} photos uploaded.`,
      );
      router.refresh();
      return true;
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'Image upload failed. Try again.',
      );
      if (uploaded > 0) {
        router.refresh();
      }
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function changeAsset(asset: MediaAssetDisplay, action: 'delete') {
    setWorking(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(`/api/media/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to remove this image.'));
      }
      const result = (await response.json()) as ApiError;
      setStatus(
        result.cleanupPending
          ? 'Image removed. Storage cleanup is queued for retry.'
          : recipePhotos
            ? 'Photo removed.'
            : 'Publication cover removed.',
      );
      router.refresh();
      return true;
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Unable to remove this image.');
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function reorderPhotos(nextPhotos: MediaAssetDisplay[]) {
    setOptimisticPhotoOrder(nextPhotos.map((asset) => asset.id));
    setWorking(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(`/api/media/recipes/${parentId}/order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: nextPhotos.map((asset) => asset.id) }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to reorder recipe photos.'));
      }
      setStatus('Photo order updated.');
      router.refresh();
      return true;
    } catch (orderError) {
      setOptimisticPhotoOrder(null);
      setError(
        orderError instanceof Error ? orderError.message : 'Unable to reorder recipe photos.',
      );
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function movePhotoTo(index: number, targetIndex: number) {
    if (
      targetIndex < 0 ||
      targetIndex >= recipePhotoAssets.length ||
      targetIndex === index ||
      working
    ) {
      return;
    }
    const ordered = [...recipePhotoAssets];
    const [selected] = ordered.splice(index, 1);
    ordered.splice(targetIndex, 0, selected);
    await reorderPhotos(ordered);
  }

  function gridColumnCount() {
    const grid = gridRef.current;
    if (!grid) {
      return 3;
    }
    return Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').length);
  }

  function handlePhotoKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!event.ctrlKey || !event.key.startsWith('Arrow')) {
      return;
    }
    const columns = gridColumnCount();
    const offset =
      event.key === 'ArrowLeft'
        ? -1
        : event.key === 'ArrowRight'
          ? 1
          : event.key === 'ArrowUp'
            ? -columns
            : columns;
    event.preventDefault();
    event.stopPropagation();
    const targetIndex = index + offset;
    const photo = recipePhotoAssets[index];
    if (!working && photo && targetIndex >= 0 && targetIndex < recipePhotoAssets.length) {
      keyboardFocusPhotoIdRef.current = photo.id;
      void movePhotoTo(index, targetIndex);
    }
  }

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    asset: MediaAssetDisplay,
    index: number,
  ) {
    if (event.button !== 0 || working) {
      return;
    }
    event.preventDefault();
    pointerDragRef.current = {
      sourceId: asset.id,
      sourceIndex: index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      targetIndex: index,
    };
    setDragOffset({ x: 0, y: 0 });
    setDropTargetIndex(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) {
      drag.moved = true;
      setDraggingId(drag.sourceId);
    }
    if (!drag.moved) {
      return;
    }
    setDragOffset({
      x: event.clientX - drag.startX,
      y: event.clientY - drag.startY,
    });
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-photo-index]');
    if (target) {
      const targetIndex = Number(target.dataset.photoIndex);
      if (Number.isInteger(targetIndex) && targetIndex !== drag.targetIndex) {
        drag.targetIndex = targetIndex;
        setDropTargetIndex(targetIndex);
      }
    }
  }

  function finishPointerDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    pointerDragRef.current = null;
    setDropTargetIndex(null);
    if (!drag.moved) {
      setDraggingId(null);
      setDragOffset({ x: 0, y: 0 });
      return;
    }

    const sourceRect = event.currentTarget.getBoundingClientRect();
    const targetItem = gridRef.current?.querySelector<HTMLElement>(
      `[data-photo-index="${drag.targetIndex}"]`,
    );
    const targetRect = targetItem?.getBoundingClientRect();
    if (targetRect) {
      setDragOffset({
        x: sourceRect.left + sourceRect.width / 2 - (targetRect.left + targetRect.width / 2),
        y: sourceRect.top + sourceRect.height / 2 - (targetRect.top + targetRect.height / 2),
      });
    }
    suppressClickRef.current = true;
    void movePhotoTo(drag.sourceIndex, drag.targetIndex);
    requestAnimationFrame(() => {
      setDraggingId(null);
      setDragOffset({ x: 0, y: 0 });
    });
  }

  async function handlePaste(event: ClipboardEvent<HTMLDialogElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length === 0) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (recipePhotos) {
      await uploadFiles(files.slice(0, remainingPhotos));
    } else {
      chooseCoverFile(files[0]);
    }
  }

  async function submitCoverChanges() {
    if (pendingCoverFile) {
      if (await uploadFiles([pendingCoverFile])) {
        setPendingCoverFile(null);
        dialogRef.current?.close();
      }
      return;
    }
    if (removeCoverOnSubmit && cover) {
      if (await changeAsset(cover, 'delete')) {
        setRemoveCoverOnSubmit(false);
        dialogRef.current?.close();
      }
    }
  }

  async function cancelStalledCoverUpload() {
    if (!pendingCoverFile) return;

    setWorking(true);
    setError('');
    try {
      const response = await fetch('/api/media/uploads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentType: 'publication', parentId }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, 'Unable to cancel the incomplete upload.'));
      }
      if (await uploadFiles([pendingCoverFile])) {
        setPendingCoverFile(null);
        dialogRef.current?.close();
      }
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'Unable to cancel the incomplete upload.',
      );
    } finally {
      setWorking(false);
    }
  }

  function handleRecipeFiles(fileList: FileList | null, input: HTMLInputElement) {
    const files = Array.from(fileList ?? []).slice(0, remainingPhotos);
    void uploadFiles(files);
    input.value = '';
  }

  function clearPendingCover() {
    if (cover) {
      setRemoveCoverOnSubmit(true);
    }
    setPendingCoverFile(null);
    setError('');
  }

  const currentCoverUrl = removeCoverOnSubmit
    ? null
    : coverPreviewUrl || cover?.thumbnail_url || null;

  return (
    <div
      className={`media-manager ${recipePhotos ? 'media-manager-photos' : 'media-manager-cover'}`}
    >
      {recipePhotos ? (
        <button
          aria-label="Manage recipe photos"
          className="recipe-photo-manager-trigger"
          disabled={working}
          onClick={openPane}
          title="Manage recipe photos"
          type="button"
        >
          {primaryRecipePhoto ? (
            <Image
              alt=""
              className="recipe-photo-manager-image"
              height={primaryRecipePhoto.height}
              src={primaryRecipePhoto.thumbnail_url}
              unoptimized
              width={primaryRecipePhoto.width}
            />
          ) : (
            <Camera aria-hidden="true" size={18} />
          )}
          {primaryRecipePhoto && (
            <span aria-hidden="true" className="recipe-photo-manager-pencil">
              <Pencil size={15} />
            </span>
          )}
        </button>
      ) : (
        <button
          aria-label={`Manage ${parentName} cover`}
          className="publication-cover-manager-trigger"
          disabled={working}
          onClick={openPane}
          title="Manage publication cover"
          type="button"
        >
          {currentCoverUrl ? (
            <Image
              alt=""
              className="publication-cover-manager-image"
              height={96}
              src={currentCoverUrl}
              unoptimized
              width={72}
            />
          ) : (
            publication && <PublicationCover publication={publication} />
          )}
          <span aria-hidden="true" className="publication-cover-manager-pencil">
            <Pencil size={15} />
          </span>
        </button>
      )}

      <dialog
        aria-labelledby="media-manager-title"
        className="media-manager-dialog"
        onCancel={(event) => {
          event.preventDefault();
          cancelPane();
        }}
        onClose={() => {
          if (!recipePhotos) {
            setPendingCoverFile(null);
            setRemoveCoverOnSubmit(false);
          }
        }}
        onPaste={(event) => void handlePaste(event)}
        ref={dialogRef}
      >
        <div className="media-manager-heading">
          <h2 id="media-manager-title" tabIndex={-1}>
            {recipePhotos ? 'Manage recipe photos' : 'Manage publication cover'}
          </h2>
          {recipePhotos && (working || status) && (
            <p className="media-manager-status media-manager-photo-status-desktop" role="status">
              {working ? status || 'Saving image changes…' : status}
            </p>
          )}
        </div>
        {recipePhotos ? (
          <textarea
            aria-label="Paste an image here"
            className="media-manager-paste-hint media-manager-paste-hint-mobile"
            onChange={(event) => {
              event.currentTarget.value = '';
            }}
            spellCheck={false}
            tabIndex={-1}
            placeholder="Tap and hold here, then choose Paste."
            rows={2}
          />
        ) : (
          <textarea
            aria-label="Paste an image here"
            className="media-manager-paste-hint"
            onChange={(event) => {
              event.currentTarget.value = '';
            }}
            spellCheck={false}
            tabIndex={-1}
            placeholder="Paste an image: press Ctrl+V or Command+V, or tap and hold here and choose Paste."
            rows={2}
          />
        )}

        {recipePhotos ? (
          <>
            <div className="media-manager-actions media-manager-photo-meta">
              <span className="media-manager-count">
                {assets.length} of {MAX_RECIPE_PHOTOS} photos
              </span>
              <p className="media-manager-paste-instruction-desktop">
                Paste an image with Ctrl+V or Command+V.
              </p>
              {recipePhotos && (working || status) && (
                <p className="media-manager-status media-manager-photo-status-mobile" role="status">
                  {working ? status || 'Saving image changes…' : status}
                </p>
              )}
              {error && (
                <p className="media-manager-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            {(recipePhotoAssets.length > 0 || remainingPhotos > 0) && (
              <ul
                aria-label="Recipe photos"
                className="recipe-photo-grid"
                onPointerCancel={() => {
                  pointerDragRef.current = null;
                  setDraggingId(null);
                  setDragOffset({ x: 0, y: 0 });
                  setDropTargetIndex(null);
                }}
                ref={gridRef}
              >
                {recipePhotoAssets.map((asset, index) => (
                  <li
                    className={`recipe-photo-grid-item${asset.is_primary ? ' is-default' : ''}${draggingId === asset.id ? ' is-dragging' : ''}${dropTargetIndex === index && draggingId !== asset.id ? ' is-drop-target' : ''}`}
                    data-photo-id={asset.id}
                    data-photo-index={index}
                    key={asset.id}
                    style={
                      draggingId === asset.id
                        ? {
                            transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) scale(1.04)`,
                          }
                        : undefined
                    }
                  >
                    <button
                      aria-label={`Photo ${index + 1} of ${assets.length}${asset.is_primary ? ', default' : ''}. Click to make default; use Control and arrow keys to reorder.`}
                      className="recipe-photo-grid-select"
                      data-select-photo
                      disabled={working}
                      onClick={() => {
                        if (suppressClickRef.current) {
                          suppressClickRef.current = false;
                          return;
                        }
                        if (index > 0) {
                          void movePhotoTo(index, 0);
                        }
                      }}
                      onKeyDown={(event) => handlePhotoKeyDown(event, index)}
                      onPointerDown={(event) => handlePointerDown(event, asset, index)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={finishPointerDrag}
                      type="button"
                    >
                      <Image
                        alt=""
                        className="recipe-photo-grid-image"
                        draggable={false}
                        height={asset.height}
                        src={asset.thumbnail_url}
                        unoptimized
                        width={asset.width}
                      />
                      {asset.is_primary && (
                        <span className="recipe-photo-default-label">Default</span>
                      )}
                    </button>
                    <button
                      aria-label={`Remove photo ${index + 1}`}
                      className="recipe-photo-remove-icon"
                      disabled={working}
                      onClick={() => void changeAsset(asset, 'delete')}
                      title={`Remove photo ${index + 1}`}
                      type="button"
                    >
                      <X aria-hidden="true" size={12} />
                    </button>
                  </li>
                ))}
                {remainingPhotos > 0 && (
                  <li className="recipe-photo-add-tile">
                    <label className="recipe-photo-add-action" title="Add photo">
                      <ImagePlus aria-hidden="true" size={30} />
                      <span>Add photo</span>
                      <input
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        aria-label="Upload from device"
                        disabled={working}
                        multiple
                        onChange={(event) =>
                          handleRecipeFiles(event.currentTarget.files, event.currentTarget)
                        }
                        ref={deviceInputRef}
                        type="file"
                      />
                    </label>
                  </li>
                )}
              </ul>
            )}
            <div className="media-manager-dialog-footer">
              <button
                className="recipe-secondary-button"
                onClick={() => dialogRef.current?.close()}
                type="button"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="publication-cover-editor-preview">
              {currentCoverUrl ? (
                <Image
                  alt=""
                  className="publication-cover-editor-image"
                  height={240}
                  src={currentCoverUrl}
                  unoptimized
                  width={180}
                />
              ) : (
                publication && <PublicationCover publication={publication} />
              )}
              {(cover || pendingCoverFile) && !removeCoverOnSubmit && (
                <button
                  aria-label="Remove cover image"
                  className="publication-cover-editor-remove"
                  onClick={clearPendingCover}
                  title="Remove cover image"
                  type="button"
                >
                  <X aria-hidden="true" size={17} />
                </button>
              )}
            </div>
            <div className="media-manager-actions publication-cover-editor-actions">
              <label className="media-icon-action" title="Choose cover image">
                <ImagePlus aria-hidden="true" size={20} />
                <input
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  aria-label="Choose cover image"
                  disabled={working}
                  onChange={(event) => {
                    chooseCoverFile(event.currentTarget.files?.[0] ?? null);
                    event.currentTarget.value = '';
                  }}
                  ref={deviceInputRef}
                  type="file"
                />
              </label>
              <div className="publication-cover-editor-buttons">
                <button
                  className="recipe-secondary-button"
                  disabled={working}
                  onClick={cancelPane}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="recipe-primary-button"
                  disabled={working || (!pendingCoverFile && !removeCoverOnSubmit)}
                  onClick={() => void submitCoverChanges()}
                  type="button"
                >
                  {working ? 'Saving…' : 'Submit'}
                </button>
              </div>
            </div>
          </>
        )}

        {!recipePhotos && working && (
          <p className="media-manager-status" role="status">
            {status || 'Saving image changes…'}
          </p>
        )}
        {!recipePhotos && !working && status && (
          <p className="media-manager-status" role="status">
            {status}
          </p>
        )}
        {!recipePhotos && error && (
          <p className="media-manager-error" role="alert">
            {error}
          </p>
        )}
        {!recipePhotos &&
          pendingCoverFile &&
          error.includes('A cover upload is already in progress.') && (
            <button
              className="recipe-secondary-button media-manager-recover-upload"
              disabled={working}
              onClick={() => void cancelStalledCoverUpload()}
              type="button"
            >
              {working ? 'Retrying…' : 'Cancel previous upload and retry'}
            </button>
          )}
      </dialog>

      {!dialogRef.current?.open && status && (
        <p className="visually-hidden" role="status">
          {status}
        </p>
      )}
      {!dialogRef.current?.open && error && (
        <p className="media-manager-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
