import Image from 'next/image';
import type { MediaAssetDisplay } from '../../lib/media/data';

export function RecipePhotoGallery({ photos }: { photos: MediaAssetDisplay[] }) {
  if (photos.length === 0) {
    return null;
  }

  const primary = photos.find((photo) => photo.is_primary) ?? photos[0];
  const otherPhotos = photos.filter((photo) => photo.id !== primary.id);

  return (
    <section aria-hidden="true" className="recipe-photo-gallery">
      <figure className="recipe-photo-feature">
        <Image
          alt=""
          className="recipe-photo-feature-image"
          height={primary.height}
          src={primary.full_url}
          unoptimized
          width={primary.width}
        />
      </figure>
      {otherPhotos.length > 0 && (
        <ul className="recipe-photo-thumbnails">
          {otherPhotos.map((photo) => (
            <li key={photo.id}>
              <Image
                alt=""
                height={photo.height}
                src={photo.thumbnail_url}
                unoptimized
                width={photo.width}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
