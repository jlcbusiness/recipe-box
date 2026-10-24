'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { MediaAssetDisplay } from '../../lib/media/data';
import { ImageViewer } from './image-viewer';

export function RecipePhotoGallery({ photos }: { photos: MediaAssetDisplay[] }) {
  const [selectedPhotoId, setSelectedPhotoId] = useState('');

  if (photos.length === 0) {
    return null;
  }

  const primary = photos.find((photo) => photo.is_primary) ?? photos[0];
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? primary;

  return (
    <section aria-label="Recipe photos" className="recipe-photo-gallery">
      <figure aria-live="polite" className="recipe-photo-feature">
        <ImageViewer
          alt=""
          buttonLabel="View full-size recipe photo"
          dataPhotoId={selectedPhoto.id}
          height={selectedPhoto.height}
          imageClassName="recipe-photo-feature-image"
          src={selectedPhoto.full_url}
          triggerClassName="recipe-photo-feature-image-trigger"
          triggerLoading="eager"
          width={selectedPhoto.width}
        />
      </figure>
      {photos.length > 1 && (
        <ul className="recipe-photo-thumbnails">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                aria-label={`Show photo ${index + 1}`}
                aria-pressed={photo.id === selectedPhoto.id}
                className="recipe-photo-thumbnail-button"
                data-photo-id={photo.id}
                onClick={() => setSelectedPhotoId(photo.id)}
                type="button"
              >
                <Image
                  alt=""
                  height={photo.height}
                  src={photo.thumbnail_url}
                  unoptimized
                  width={photo.width}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
