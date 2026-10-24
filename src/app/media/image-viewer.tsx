'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ImageViewerProps = {
  alt: string;
  buttonLabel: string;
  dataPhotoId?: string;
  height: number;
  imageClassName?: string;
  src: string;
  triggerLoading?: 'eager' | 'lazy';
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  width: number;
};

export function ImageViewer({
  alt,
  buttonLabel,
  dataPhotoId,
  height,
  imageClassName,
  src,
  triggerLoading = 'lazy',
  triggerClassName,
  triggerStyle,
  width,
}: ImageViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  function openViewer() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) {
      return;
    }
    dialog.showModal();
    setIsOpen(true);
  }

  function closeViewer() {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
  }

  return (
    <>
      <button
        aria-label={buttonLabel}
        className={`image-viewer-trigger${triggerClassName ? ` ${triggerClassName}` : ''}`}
        onClick={openViewer}
        style={triggerStyle}
        type="button"
      >
        <Image
          alt={alt}
          className={imageClassName}
          data-photo-id={dataPhotoId}
          height={height}
          loading={triggerLoading}
          src={src}
          unoptimized
          width={width}
        />
      </button>
      {portalTarget &&
        createPortal(
          <dialog
            aria-label="Image viewer"
            className="image-viewer-dialog"
            onClick={(event) => {
              if (
                !(event.target instanceof Element) ||
                !event.target.closest('.image-viewer-full-image, .image-viewer-close')
              ) {
                closeViewer();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeViewer();
              }
            }}
            onClose={() => setIsOpen(false)}
            ref={dialogRef}
          >
            {isOpen && (
              <div className="image-viewer-stage">
                <button
                  aria-label="Close image viewer"
                  className="image-viewer-close"
                  onClick={closeViewer}
                  type="button"
                >
                  <X aria-hidden="true" size={24} />
                </button>
                <Image
                  alt={alt}
                  className="image-viewer-full-image"
                  height={height}
                  loading="eager"
                  sizes="100vw"
                  src={src}
                  unoptimized
                  width={width}
                />
              </div>
            )}
          </dialog>,
          portalTarget,
        )}
    </>
  );
}
