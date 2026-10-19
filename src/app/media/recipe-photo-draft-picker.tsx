'use client';

import { Camera, ImagePlus, X } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { MAX_IMAGE_UPLOAD_BYTES, MAX_RECIPE_PHOTOS } from '../../lib/media/rules';

type DraftPhoto = {
  file: File;
  previewUrl: string;
};

type RecipePhotoDraftPickerProps = {
  disabled?: boolean;
  nameField: ReactNode;
  onFilesChange: (files: File[]) => void;
};

const acceptedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function RecipePhotoDraftPicker({
  disabled = false,
  nameField,
  onFilesChange,
}: RecipePhotoDraftPickerProps) {
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(
    () => () => {
      for (const photo of photosRef.current) {
        URL.revokeObjectURL(photo.previewUrl);
      }
    },
    [],
  );

  function chooseFiles(fileList: FileList | null) {
    const selected = Array.from(fileList ?? []);
    const availableSlots = Math.max(0, MAX_RECIPE_PHOTOS - photos.length);
    const additions: DraftPhoto[] = [];
    const errors: string[] = [];

    for (const file of selected) {
      if (additions.length >= availableSlots) {
        errors.push(`You can add up to ${MAX_RECIPE_PHOTOS} photos.`);
        break;
      }
      if (!acceptedImageTypes.has(file.type)) {
        errors.push(`${file.name}: choose a JPEG, PNG, WebP, or HEIC image.`);
        continue;
      }
      if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        errors.push(`${file.name}: images must be 20 MiB or smaller.`);
        continue;
      }
      additions.push({ file, previewUrl: URL.createObjectURL(file) });
    }

    if (additions.length > 0) {
      const nextPhotos = [...photos, ...additions];
      setPhotos(nextPhotos);
      onFilesChange(nextPhotos.map(({ file }) => file));
    }
    setError(errors.join(' '));
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  function removePhoto(index: number) {
    const photo = photos[index];
    if (photo) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    const nextPhotos = photos.filter((_, photoIndex) => photoIndex !== index);
    setPhotos(nextPhotos);
    onFilesChange(nextPhotos.map(({ file }) => file));
  }

  function openPicker() {
    inputRef.current?.click();
  }

  return (
    <div className="recipe-draft-photo-picker">
      <div className="recipe-name-media-row">
        {nameField}
        <div className="media-manager media-manager-photos">
          <button
            aria-label="Add recipe photos"
            className="recipe-photo-manager-trigger"
            disabled={disabled}
            onClick={openPicker}
            title="Add recipe photos"
            type="button"
          >
            {photos[0] ? (
              <Image
                alt=""
                className="recipe-photo-manager-image"
                height={96}
                src={photos[0].previewUrl}
                unoptimized
                width={96}
              />
            ) : (
              <Camera aria-hidden="true" size={18} />
            )}
          </button>
          <input
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            aria-label="Choose recipe photos"
            className="recipe-draft-photo-input"
            disabled={disabled}
            multiple
            onChange={(event) => chooseFiles(event.currentTarget.files)}
            ref={inputRef}
            type="file"
          />
        </div>
      </div>
      {photos.length > 0 && (
        <ul
          aria-label="Selected recipe photos"
          className="recipe-photo-grid recipe-photo-draft-grid"
        >
          {photos.map((photo, index) => (
            <li className="recipe-photo-grid-item recipe-photo-draft-item" key={photo.previewUrl}>
              <Image
                alt=""
                className="recipe-photo-grid-image"
                height={256}
                src={photo.previewUrl}
                unoptimized
                width={256}
              />
              <button
                aria-label={`Remove selected photo ${index + 1}`}
                className="recipe-photo-remove-icon"
                disabled={disabled}
                onClick={() => removePhoto(index)}
                title={`Remove selected photo ${index + 1}`}
                type="button"
              >
                <X aria-hidden="true" size={12} />
              </button>
            </li>
          ))}
          {photos.length < MAX_RECIPE_PHOTOS && (
            <li className="recipe-photo-add-tile">
              <button
                className="recipe-photo-add-action"
                disabled={disabled}
                onClick={openPicker}
                title="Add another photo"
                type="button"
              >
                <ImagePlus aria-hidden="true" size={30} />
                <span>Add photo</span>
              </button>
            </li>
          )}
        </ul>
      )}
      {error && (
        <p className="recipe-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
