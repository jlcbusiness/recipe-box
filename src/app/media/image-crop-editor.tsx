'use client';

import { ImageRestriction } from 'advanced-cropper';
import { RotateCcw } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type Coordinates, Cropper, type CropperRef } from 'react-advanced-cropper';
import type { CropRect, CropRotation } from '../../lib/media/rules';
import { Picklist } from '../picklist';

type AspectRatioChoice = 'free' | 'original' | 'square' | '4:3' | '3:2' | '16:9';

type ImageCropEditorProps = {
  src: string;
  width: number;
  height: number;
  crop: CropRect | null;
  onApply: (coordinates: Coordinates, rotation: CropRotation) => void;
  onCancel: () => void;
};

const ratioOptions: Array<{ value: AspectRatioChoice; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: 'original', label: 'Original' },
  { value: 'square', label: 'Square' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
];

export function isPortraitCoordinates(coordinates: Coordinates) {
  return coordinates.width < coordinates.height;
}

export function ratioValue(
  choice: AspectRatioChoice,
  isPortrait: boolean,
  width: number,
  height: number,
  rotation: CropRotation,
) {
  const orientedWidth = rotation === 90 || rotation === 270 ? height : width;
  const orientedHeight = rotation === 90 || rotation === 270 ? width : height;
  switch (choice) {
    case 'original':
      return orientedWidth / orientedHeight;
    case 'square':
      return 1;
    case '4:3':
      return isPortrait ? 3 / 4 : 4 / 3;
    case '3:2':
      return isPortrait ? 2 / 3 : 3 / 2;
    case '16:9':
      return isPortrait ? 9 / 16 : 16 / 9;
    default:
      return undefined;
  }
}

export function ratioLabel(choice: AspectRatioChoice, isPortrait: boolean) {
  if (!isPortrait || choice === 'free' || choice === 'original' || choice === 'square') {
    return ratioOptions.find((option) => option.value === choice)?.label ?? choice;
  }
  if (choice === '4:3') return '3:4';
  if (choice === '3:2') return '2:3';
  return '9:16';
}

export function transposeCropCoordinates(coordinates: Coordinates): Coordinates {
  const width = coordinates.height;
  const height = coordinates.width;
  return {
    left: coordinates.left + (coordinates.width - width) / 2,
    top: coordinates.top + (coordinates.height - height) / 2,
    width,
    height,
  };
}

export function fitCanvasToViewport(
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
  rotation: CropRotation,
) {
  if (viewportWidth <= 0 || viewportHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const isSideways = rotation === 90 || rotation === 270;
  const orientedWidth = isSideways ? imageHeight : imageWidth;
  const orientedHeight = isSideways ? imageWidth : imageHeight;
  const scale = Math.min(viewportWidth / orientedWidth, viewportHeight / orientedHeight);
  return { width: orientedWidth * scale, height: orientedHeight * scale };
}

export function ImageCropEditor({
  src,
  width,
  height,
  crop,
  onApply,
  onCancel,
}: ImageCropEditorProps) {
  const cropperRef = useRef<CropperRef>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const resetToFullRef = useRef(false);
  const [resetRequest, setResetRequest] = useState(0);
  const zoomRef = useRef(1);
  const pendingRotationRef = useRef(false);
  const rotationVisibleAreaRef = useRef<Coordinates | null>(null);
  const initialRotation = crop?.rotation ?? 0;
  const rotationRef = useRef<CropRotation>(initialRotation);
  const previousRotationRef = useRef<CropRotation>(initialRotation);
  const [ratioChoice, setRatioChoice] = useState<AspectRatioChoice>('free');
  const [rotation, setRotation] = useState<CropRotation>(initialRotation);
  const [rotationActionCount, setRotationActionCount] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [stageViewportSize, setStageViewportSize] = useState({ width: 0, height: 0 });
  const stageSize = fitCanvasToViewport(
    stageViewportSize.width,
    stageViewportSize.height,
    width,
    height,
    rotation,
  );
  const [isPortraitCrop, setIsPortraitCrop] = useState(() => {
    const orientedWidth = initialRotation === 90 || initialRotation === 270 ? height : width;
    const orientedHeight = initialRotation === 90 || initialRotation === 270 ? width : height;
    return crop
      ? crop.width * orientedWidth < crop.height * orientedHeight
      : orientedWidth < orientedHeight;
  });
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const viewport = stageViewportRef.current;
    if (!viewport) {
      return;
    }
    const updateViewportSize = () => {
      const bounds = viewport.getBoundingClientRect();
      setStageViewportSize((current) =>
        current.width === bounds.width && current.height === bounds.height
          ? current
          : { width: bounds.width, height: bounds.height },
      );
    };
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    updateViewportSize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const activeStage = stage;

    function handleWheel(event: WheelEvent) {
      if (
        event.deltaY === 0 ||
        !(event.target instanceof Node) ||
        !activeStage.contains(event.target)
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const nextZoom = Math.min(
        4,
        Math.max(1, zoomRef.current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)),
      );
      cropperRef.current?.zoomImage(nextZoom / zoomRef.current, {
        immediately: true,
        transitions: false,
      });
      zoomRef.current = nextZoom;
    }

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleWheel, true);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    const activeStage = stage;

    function markBackgroundImageDecorative() {
      const backgroundImage = activeStage.querySelector<HTMLImageElement>(
        'img.advanced-cropper-background-image',
      );
      if (backgroundImage) {
        backgroundImage.alt = '';
      }
    }

    markBackgroundImageDecorative();
    const observer = new MutationObserver(markBackgroundImageDecorative);
    observer.observe(activeStage, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  function updateZoom(cropper: CropperRef) {
    const state = cropper.getState();
    const coordinates = cropper.getCoordinates();
    if (coordinates && rotationRef.current === 0) {
      const nextIsPortrait = isPortraitCoordinates(coordinates);
      setIsPortraitCrop((current) => (current === nextIsPortrait ? current : nextIsPortrait));
    }
    if (!state?.visibleArea || !state.imageSize || state.visibleArea.width <= 0) {
      return;
    }
    const nextZoom = Math.min(4, Math.max(1, state.imageSize.width / state.visibleArea.width));
    zoomRef.current = nextZoom;
  }

  function onReady(cropper: CropperRef) {
    if (resetToFullRef.current) {
      cropper.setCoordinates(
        { left: 0, top: 0, width, height },
        { immediately: true, transitions: false },
      );
      resetToFullRef.current = false;
      updateZoom(cropper);
      setReady(true);
      return;
    }
    if (initialRotation !== 0) {
      cropper.rotateImage(initialRotation, { immediately: true, transitions: false });
    }
    const orientedWidth = initialRotation === 90 || initialRotation === 270 ? height : width;
    const orientedHeight = initialRotation === 90 || initialRotation === 270 ? width : height;
    cropper.setCoordinates({
      left: (crop?.left ?? 0) * orientedWidth,
      top: (crop?.top ?? 0) * orientedHeight,
      width: (crop?.width ?? 1) * orientedWidth,
      height: (crop?.height ?? 1) * orientedHeight,
    });
    updateZoom(cropper);
    setReady(true);
  }

  useLayoutEffect(() => {
    if (!pendingRotationRef.current || rotationActionCount === 0 || !isRotating) {
      return;
    }
    const cropper = cropperRef.current;
    if (!cropper) {
      pendingRotationRef.current = false;
      setIsRotating(false);
      return;
    }
    let cancelled = false;
    let frameId: number | null = null;
    let attempts = 0;
    function rotateAfterRefresh() {
      const activeCropper = cropperRef.current;
      if (cancelled) {
        return;
      }
      const boundary = activeCropper?.getState()?.boundary;
      const coordinates = activeCropper?.getCoordinates();
      const boundaryMatchesStage =
        boundary &&
        Math.abs(boundary.width - stageSize.width) < 1 &&
        Math.abs(boundary.height - stageSize.height) < 1;
      if (!activeCropper || !coordinates) {
        pendingRotationRef.current = false;
        setIsRotating(false);
        return;
      }
      if (!boundaryMatchesStage && attempts < 120) {
        attempts += 1;
        frameId = window.requestAnimationFrame(rotateAfterRefresh);
        return;
      }
      if (!boundaryMatchesStage) {
        const previousRotation = previousRotationRef.current;
        rotationRef.current = previousRotation;
        setRotation(previousRotation);
        setIsPortraitCrop(isPortraitCoordinates(coordinates));
        pendingRotationRef.current = false;
        setIsRotating(false);
        return;
      }
      activeCropper.rotateImage(270, { immediately: true, transitions: false });
      const rotatedCoordinates = activeCropper.getCoordinates();
      if (rotatedCoordinates && ratioChoice === 'free') {
        activeCropper.setCoordinates(transposeCropCoordinates(rotatedCoordinates), {
          immediately: true,
          transitions: false,
        });
      }
      const visibleArea = rotationVisibleAreaRef.current;
      const rotatedState = activeCropper.getState();
      if (visibleArea && rotatedState) {
        activeCropper.setState({ ...rotatedState, visibleArea }, { transitions: false });
        activeCropper.reconcileState();
      }
      pendingRotationRef.current = false;
      setIsRotating(false);
    }
    cropper.refresh();
    frameId = window.requestAnimationFrame(rotateAfterRefresh);
    return () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [isRotating, ratioChoice, rotationActionCount, stageSize.height, stageSize.width]);

  function rotateImageCounterclockwise() {
    if (pendingRotationRef.current) {
      return;
    }
    const coordinates = cropperRef.current?.getCoordinates();
    if (coordinates) {
      const nextIsPortrait = coordinates.width > coordinates.height;
      setIsPortraitCrop((current) => (current === nextIsPortrait ? current : nextIsPortrait));
    }
    pendingRotationRef.current = true;
    setIsRotating(true);
    previousRotationRef.current = rotationRef.current;
    const visibleArea = cropperRef.current?.getVisibleArea();
    const orientedWidth =
      rotationRef.current === 90 || rotationRef.current === 270 ? height : width;
    rotationVisibleAreaRef.current = visibleArea
      ? {
          left: visibleArea.top,
          top: orientedWidth - visibleArea.left - visibleArea.width,
          width: visibleArea.height,
          height: visibleArea.width,
        }
      : null;
    const nextRotation = ((rotationRef.current + 270) % 360) as CropRotation;
    rotationRef.current = nextRotation;
    setRotation(nextRotation);
    setRotationActionCount((current) => current + 1);
  }

  function resetCrop() {
    pendingRotationRef.current = false;
    setIsRotating(false);
    rotationRef.current = 0;
    setRotation(0);
    setIsPortraitCrop(height > width);
    resetToFullRef.current = true;
    setReady(false);
    setRatioChoice('free');
    setResetRequest((current) => current + 1);
  }

  function applyCrop() {
    const coordinates = cropperRef.current?.getCoordinates();
    if (coordinates) {
      onApply(coordinates, rotationRef.current);
    }
  }

  return (
    <section aria-label="Adjust image framing" className="image-crop-editor">
      <div className="image-crop-editor-stage-viewport" ref={stageViewportRef}>
        <div
          className="image-crop-editor-stage"
          ref={stageRef}
          style={stageSize.width > 0 ? stageSize : undefined}
        >
          <Cropper
            backgroundWrapperProps={{
              moveImage: { mouse: true, touch: true },
              scaleImage: { touch: true, wheel: false },
            }}
            className="image-crop-editor-cropper"
            imageRestriction={ImageRestriction.stencil}
            key={resetRequest}
            onReady={onReady}
            onUpdate={updateZoom}
            ref={cropperRef}
            src={src}
            stencilProps={{
              aspectRatio: ratioValue(ratioChoice, isPortraitCrop, width, height, rotation),
              grid: true,
              movable: false,
              resizable: true,
            }}
          />
        </div>
      </div>
      <div className="image-crop-editor-controls">
        <Picklist
          className="image-crop-editor-ratio"
          compact
          label="Aspect ratio"
          onSelect={(value) => setRatioChoice(value as AspectRatioChoice)}
          options={ratioOptions.map((option) => ({
            value: option.value,
            label: ratioLabel(option.value, isPortraitCrop),
          }))}
          sizeToContent
          showSelectionCheckmark={false}
          value={ratioChoice}
        >
          {ratioLabel(ratioChoice, isPortraitCrop)}
        </Picklist>
        <div className="image-crop-editor-rotation">
          <button
            aria-label="Rotate image counterclockwise 90 degrees"
            className="image-crop-editor-rotate"
            disabled={isRotating}
            onClick={rotateImageCounterclockwise}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="image-crop-editor-actions">
          <button className="recipe-secondary-button" onClick={resetCrop} type="button">
            Reset
          </button>
          <button className="recipe-secondary-button" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="recipe-primary-button"
            disabled={!ready}
            onClick={applyCrop}
            type="button"
          >
            Apply
          </button>
        </div>
      </div>
    </section>
  );
}
