'use client';

import { Camera, ClipboardPaste, Crop, ImagePlus, Pencil, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ClipboardEvent, PointerEvent } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MediaAssetDisplay } from '../../lib/media/data';
import {
  type CropRect,
  type CropRotation,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_RECIPE_PHOTOS,
  normalizeCropRect,
} from '../../lib/media/rules';
import type { PublicationOption } from '../../lib/recipes/data';
import { PublicationCover } from '../publications/publication-cover';
import { FramedMediaImage } from './framed-media-image';
import { ImageCropEditor } from './image-crop-editor';
import { uploadMediaFiles } from './upload-files';

type MediaParent = 'recipe' | 'publication';

type MediaManagerProps = {
  parentType: MediaParent;
  parentId: string;
  parentName: string;
  assets: MediaAssetDisplay[];
  publication?: PublicationOption;
  expectedVersion?: number;
  referencedPhotoSteps?: Record<string, number[]>;
  onPhotoDeleted?: (assetId: string) => void;
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

type CropEditingTarget = {
  asset: MediaAssetDisplay | null;
  crop: CropRect | null;
  height: number;
  src: string;
  width: number;
};

type PendingCoverFraming = {
  assetId: string | null;
  crop: CropRect | null;
  height: number;
  width: number;
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
  expectedVersion,
  referencedPhotoSteps = {},
  onPhotoDeleted,
}: MediaManagerProps) {
  const [working, setWorking] = useState(false);
  const [currentExpectedVersion, setCurrentExpectedVersion] = useState(expectedVersion);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [coverUploadRecoveryAvailable, setCoverUploadRecoveryAvailable] = useState(false);
  const [removeCoverOnSubmit, setRemoveCoverOnSubmit] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [cropEditing, setCropEditing] = useState<CropEditingTarget | null>(null);
  const [pendingCoverFraming, setPendingCoverFraming] = useState<PendingCoverFraming | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [optimisticPhotoOrder, setOptimisticPhotoOrder] = useState<string[] | null>(null);
  const [pendingPhotoRemoval, setPendingPhotoRemoval] = useState<{
    asset: MediaAssetDisplay;
    stepNumbers: number[];
  } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deviceInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    setCurrentExpectedVersion(expectedVersion);
  }, [expectedVersion]);

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
    const fileInputs = [deviceInputRef.current, cameraInputRef.current].filter(
      (input): input is HTMLInputElement => input !== null,
    );
    const preventDialogCancel = (event: Event) => event.stopPropagation();
    for (const input of fileInputs) {
      input.addEventListener('cancel', preventDialogCancel);
    }
    return () => {
      for (const input of fileInputs) {
        input.removeEventListener('cancel', preventDialogCancel);
      }
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
      setPendingCoverFraming(null);
      setCoverUploadRecoveryAvailable(false);
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
    setPendingCoverFraming(null);
    setCoverUploadRecoveryAvailable(false);
    setRemoveCoverOnSubmit(false);
    setError('');
  }

  async function uploadFiles(files: File[]): Promise<string[] | null> {
    if (files.length === 0) {
      return [];
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
      setCoverUploadRecoveryAvailable(false);
      router.refresh();
      return result.assetIds;
    } catch (uploadError) {
      if (
        !recipePhotos &&
        uploadError instanceof Error &&
        uploadError.message.includes('A cover upload is already in progress.')
      ) {
        setCoverUploadRecoveryAvailable(true);
      }
      setError(
        uploadError instanceof Error ? uploadError.message : 'Image upload failed. Try again.',
      );
      if (uploaded > 0) {
        router.refresh();
      }
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function saveAssetCrop(assetId: string, crop: CropRect | null) {
    if (!currentExpectedVersion) {
      setError('Reload the record before saving image framing.');
      return false;
    }

    const response = await fetch(`/api/media/assets/${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'crop',
        crop,
        expected_version: currentExpectedVersion,
      }),
    });
    if (!response.ok) {
      setError(await responseError(response, 'Unable to save image framing.'));
      return false;
    }
    const result = (await response.json()) as { version?: unknown };
    if (typeof result.version === 'number') {
      setCurrentExpectedVersion(result.version);
    }
    return true;
  }

  function openRecipeCropEditor(asset: MediaAssetDisplay) {
    setError('');
    setCropEditing({
      asset,
      crop: asset.crop,
      height: asset.height,
      src: asset.full_url,
      width: asset.width,
    });
  }

  async function openCoverCropEditor() {
    setError('');
    if (pendingCoverFile && coverPreviewUrl) {
      try {
        const image = await createImageBitmap(pendingCoverFile);
        const width = image.width;
        const height = image.height;
        image.close();
        setCropEditing({
          asset: null,
          crop: pendingCoverFraming?.assetId === null ? pendingCoverFraming.crop : null,
          height,
          src: coverPreviewUrl,
          width,
        });
      } catch {
        setError('This image cannot be opened in the framing editor.');
      }
      return;
    }
    if (cover) {
      setCropEditing({
        asset: cover,
        crop: pendingCoverFraming?.assetId === cover.id ? pendingCoverFraming.crop : cover.crop,
        height: cover.height,
        src: cover.full_url,
        width: cover.width,
      });
    }
  }

  async function applyCropEditing(
    coordinates: { left: number; top: number; width: number; height: number },
    rotation: CropRotation,
  ) {
    if (!cropEditing) {
      return;
    }
    let crop: CropRect | null;
    try {
      crop = normalizeCropRect(coordinates, cropEditing.width, cropEditing.height, rotation);
    } catch {
      setError('Crop coordinates are invalid.');
      return;
    }

    if (recipePhotos && cropEditing.asset) {
      setWorking(true);
      setError('');
      setStatus('');
      try {
        if (await saveAssetCrop(cropEditing.asset.id, crop)) {
          setCropEditing(null);
          setStatus('Photo framing saved.');
          router.refresh();
        }
      } catch {
        setError('Unable to save photo framing. Try again.');
      } finally {
        setWorking(false);
      }
      return;
    }

    setPendingCoverFraming({
      assetId: cropEditing.asset?.id ?? null,
      crop,
      height: cropEditing.height,
      width: cropEditing.width,
    });
    setCropEditing(null);
    setStatus('Framing ready to submit.');
    setError('');
  }

  async function changeAsset(asset: MediaAssetDisplay, action: 'delete') {
    setWorking(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(`/api/media/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(recipePhotos ? { expected_version: expectedVersion } : {}),
        }),
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
      if (recipePhotos) {
        onPhotoDeleted?.(asset.id);
      }
      router.refresh();
      return true;
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Unable to remove this image.');
      return false;
    } finally {
      setWorking(false);
    }
  }

  function requestPhotoRemoval(asset: MediaAssetDisplay) {
    const stepNumbers = referencedPhotoSteps[asset.id] ?? [];
    if (stepNumbers.length > 0) {
      setPendingPhotoRemoval({ asset, stepNumbers });
      return;
    }
    void changeAsset(asset, 'delete');
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

  async function pasteFromClipboard() {
    setError('');
    if (!navigator.clipboard?.read) {
      setError('Clipboard image access is unavailable. Use Add photo to choose an image.');
      return;
    }

    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'image/heif': 'heif',
    };
    try {
      const files: File[] = [];
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((itemType) => itemType in extensions);
        if (!type) {
          continue;
        }
        files.push(
          new File(
            [await item.getType(type)],
            `pasted-photo-${files.length + 1}.${extensions[type]}`,
            {
              type,
            },
          ),
        );
      }
      if (files.length === 0) {
        setError(
          'The clipboard does not contain a supported image. Use Add photo to choose a file.',
        );
        return;
      }
      if (recipePhotos) {
        await uploadFiles(files.slice(0, remainingPhotos));
      } else {
        chooseCoverFile(files[0] ?? null);
      }
    } catch {
      setError(
        'Unable to read an image from the clipboard. Check browser permission or use Add photo.',
      );
    }
  }

  async function submitCoverChanges() {
    if (pendingCoverFile) {
      const [assetId] = (await uploadFiles([pendingCoverFile])) ?? [];
      if (!assetId) {
        return;
      }
      setPendingCoverFile(null);
      if (pendingCoverFraming) {
        setPendingCoverFraming({ ...pendingCoverFraming, assetId });
        if (!(await saveAssetCrop(assetId, pendingCoverFraming.crop))) {
          setStatus('Cover saved. Framing still needs to be saved.');
          router.refresh();
          return;
        }
      }
      setPendingCoverFraming(null);
      dialogRef.current?.close();
      return;
    }
    if (pendingCoverFraming) {
      const assetId = pendingCoverFraming.assetId ?? cover?.id;
      if (!assetId) {
        setError('Choose a cover image before saving framing.');
        return;
      }
      setWorking(true);
      setError('');
      try {
        if (!(await saveAssetCrop(assetId, pendingCoverFraming.crop))) {
          return;
        }
        setPendingCoverFraming(null);
        setStatus('Cover framing saved.');
        router.refresh();
        dialogRef.current?.close();
      } catch {
        setError('Unable to save cover framing. Try again.');
      } finally {
        setWorking(false);
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
      const [assetId] = (await uploadFiles([pendingCoverFile])) ?? [];
      if (assetId) {
        setPendingCoverFile(null);
        if (pendingCoverFraming) {
          setPendingCoverFraming({ ...pendingCoverFraming, assetId });
          if (!(await saveAssetCrop(assetId, pendingCoverFraming.crop))) {
            setStatus('Cover saved. Framing still needs to be saved.');
            router.refresh();
            return;
          }
        }
        setPendingCoverFraming(null);
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
    setPendingCoverFraming(null);
    setCoverUploadRecoveryAvailable(false);
    setError('');
  }

  const currentCoverUrl = removeCoverOnSubmit
    ? null
    : coverPreviewUrl || cover?.thumbnail_url || null;
  const currentCoverCrop =
    pendingCoverFraming && pendingCoverFraming.assetId === cover?.id
      ? pendingCoverFraming.crop
      : (cover?.crop ?? null);

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
            <FramedMediaImage
              alt=""
              className="recipe-photo-manager-image"
              crop={primaryRecipePhoto.crop}
              height={primaryRecipePhoto.height}
              src={primaryRecipePhoto.thumbnail_url}
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
          {currentCoverUrl && pendingCoverFile && pendingCoverFraming?.assetId === null ? (
            <FramedMediaImage
              alt=""
              className="publication-cover-manager-image"
              crop={pendingCoverFraming.crop}
              height={pendingCoverFraming.height}
              src={currentCoverUrl}
              width={pendingCoverFraming.width}
            />
          ) : currentCoverUrl && cover ? (
            <FramedMediaImage
              alt=""
              className="publication-cover-manager-image"
              crop={currentCoverCrop ?? null}
              height={cover.height}
              src={currentCoverUrl}
              width={cover.width}
            />
          ) : currentCoverUrl ? (
            <img
              alt=""
              className="publication-cover-manager-image"
              height={96}
              src={currentCoverUrl}
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
        aria-label={cropEditing ? 'Adjust image framing' : undefined}
        aria-labelledby={cropEditing ? undefined : 'media-manager-title'}
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
        {!cropEditing && (
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
        )}
        {cropEditing ? (
          <>
            <ImageCropEditor
              crop={cropEditing.crop}
              height={cropEditing.height}
              onApply={(coordinates, rotation) => void applyCropEditing(coordinates, rotation)}
              onCancel={() => setCropEditing(null)}
              src={cropEditing.src}
              width={cropEditing.width}
            />
            {error && (
              <p className="media-manager-error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            {recipePhotos ? (
              <button
                aria-label="Paste image from clipboard"
                className="media-manager-paste-hint-mobile media-manager-paste-action-mobile"
                disabled={working || remainingPhotos === 0}
                onClick={() => void pasteFromClipboard()}
                type="button"
              >
                <ClipboardPaste aria-hidden="true" size={18} />
                <span>Paste image from clipboard</span>
              </button>
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
                    <p
                      className="media-manager-status media-manager-photo-status-mobile"
                      role="status"
                    >
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
                          <FramedMediaImage
                            alt=""
                            className="recipe-photo-grid-image"
                            crop={asset.crop}
                            height={asset.height}
                            src={asset.thumbnail_url}
                            width={asset.width}
                          />
                          {asset.is_primary && (
                            <span className="recipe-photo-default-label">Default</span>
                          )}
                        </button>
                        <button
                          aria-label={`Adjust framing for photo ${index + 1}`}
                          className="recipe-photo-frame-icon"
                          disabled={working}
                          onClick={() => openRecipeCropEditor(asset)}
                          title="Adjust photo framing"
                          type="button"
                        >
                          <Crop aria-hidden="true" size={15} />
                        </button>
                        <button
                          aria-label={`Remove photo ${index + 1}`}
                          className="recipe-photo-remove-icon"
                          disabled={working}
                          onClick={() => requestPhotoRemoval(asset)}
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
                    {remainingPhotos > 0 && (
                      <li className="recipe-photo-add-tile recipe-photo-camera-tile">
                        <label className="recipe-photo-add-action" title="Take photo">
                          <Camera aria-hidden="true" size={30} />
                          <span>Take photo</span>
                          <input
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                            aria-label="Take photo with camera"
                            capture="environment"
                            disabled={working}
                            onChange={(event) =>
                              handleRecipeFiles(event.currentTarget.files, event.currentTarget)
                            }
                            ref={cameraInputRef}
                            type="file"
                          />
                        </label>
                      </li>
                    )}
                  </ul>
                )}
                {pendingPhotoRemoval && (
                  <section
                    aria-describedby="referenced-photo-removal-description"
                    aria-labelledby="referenced-photo-removal-title"
                    className="media-manager-reference-confirmation"
                    role="alertdialog"
                  >
                    <h3 id="referenced-photo-removal-title">Remove referenced photo?</h3>
                    <p id="referenced-photo-removal-description">
                      This photo is referenced in instruction step
                      {pendingPhotoRemoval.stepNumbers.length === 1 ? ' ' : 's '}
                      {pendingPhotoRemoval.stepNumbers.join(', ')}. Removing it also removes those
                      references.
                    </p>
                    {error && <p role="alert">{error}</p>}
                    <div className="media-manager-reference-confirmation-actions">
                      <button
                        className="recipe-secondary-button"
                        disabled={working}
                        onClick={() => setPendingPhotoRemoval(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="recipe-primary-button"
                        disabled={working}
                        onClick={() => {
                          const pending = pendingPhotoRemoval;
                          setPendingPhotoRemoval(null);
                          if (pending) {
                            void changeAsset(pending.asset, 'delete');
                          }
                        }}
                        type="button"
                      >
                        {working ? 'Removing…' : 'Remove photo and references'}
                      </button>
                    </div>
                  </section>
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
                  {currentCoverUrl && pendingCoverFile && pendingCoverFraming?.assetId === null ? (
                    <FramedMediaImage
                      alt=""
                      className="publication-cover-editor-image"
                      crop={pendingCoverFraming.crop}
                      height={pendingCoverFraming.height}
                      src={currentCoverUrl}
                      width={pendingCoverFraming.width}
                    />
                  ) : currentCoverUrl && cover ? (
                    <FramedMediaImage
                      alt=""
                      className="publication-cover-editor-image"
                      crop={currentCoverCrop ?? null}
                      height={cover.height}
                      src={currentCoverUrl}
                      width={cover.width}
                    />
                  ) : currentCoverUrl ? (
                    <img
                      alt=""
                      className="publication-cover-editor-image"
                      height={240}
                      src={currentCoverUrl}
                      width={180}
                    />
                  ) : (
                    publication && <PublicationCover publication={publication} />
                  )}
                  {(cover || pendingCoverFile) && !removeCoverOnSubmit && (
                    <>
                      <button
                        aria-label="Adjust cover framing"
                        className="publication-cover-editor-frame"
                        onClick={() => void openCoverCropEditor()}
                        type="button"
                      >
                        <Crop aria-hidden="true" size={15} />
                        <span>Adjust framing</span>
                      </button>
                      <button
                        aria-label="Remove cover image"
                        className="publication-cover-editor-remove"
                        onClick={clearPendingCover}
                        title="Remove cover image"
                        type="button"
                      >
                        <X aria-hidden="true" size={17} />
                      </button>
                    </>
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
                      disabled={
                        working ||
                        (!pendingCoverFile && !removeCoverOnSubmit && !pendingCoverFraming)
                      }
                      onClick={() => void submitCoverChanges()}
                      type="button"
                    >
                      {working ? 'Saving…' : 'Submit'}
                    </button>
                  </div>
                </div>
              </>
            )}
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
        {!recipePhotos && pendingCoverFile && coverUploadRecoveryAvailable && (
          <button
            className="recipe-secondary-button media-manager-recover-upload"
            disabled={working}
            onClick={() => void cancelStalledCoverUpload()}
            type="button"
          >
            {working ? 'Retrying…' : 'Cancel upload and retry'}
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
