'use client';

import { useState } from 'react';
import type { MediaAssetDisplay } from '../../lib/media/data';
import { FramedMediaImage } from './framed-media-image';
import { ImageViewer } from './image-viewer';

type RecipePhotoGalleryPhoto = Pick<
  MediaAssetDisplay,
  'id' | 'description' | 'is_primary' | 'width' | 'height' | 'crop' | 'full_url' | 'thumbnail_url'
>;

export function RecipePhotoGallery({
  photos,
  recipeName,
}: {
  photos: RecipePhotoGalleryPhoto[];
  recipeName?: string;
}) {
  const [selectedPhotoId, setSelectedPhotoId] = useState('');

  if (photos.length === 0) {
    return null;
  }

  const primary = photos.find((photo) => photo.is_primary) ?? photos[0];
  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? primary;
  const selectedPhotoIndex = photos.indexOf(selectedPhoto);
  const imageAlt = recipeName
    ? selectedPhoto.description || `${recipeName}, photo ${selectedPhotoIndex + 1}`
    : '';
  const imageButtonLabel = recipeName
    ? `View ${imageAlt} full size`
    : 'View full-size recipe photo';

  return (
    <section
      aria-label={recipeName ? `${recipeName} photos` : 'Recipe photos'}
      className="recipe-photo-gallery"
    >
      <figure aria-live="polite" className="recipe-photo-feature">
        <ImageViewer
          alt={imageAlt}
          buttonLabel={imageButtonLabel}
          crop={selectedPhoto.crop}
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
                <FramedMediaImage
                  alt=""
                  className="recipe-photo-thumbnail-image"
                  crop={photo.crop}
                  height={photo.height}
                  src={photo.thumbnail_url}
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
