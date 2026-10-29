import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RecipePhotoGallery } from '../../src/app/media/media-display';
import type { MediaAssetDisplay } from '../../src/lib/media/data';

afterEach(cleanup);

function photo(id: string, position: number, crop: MediaAssetDisplay['crop']): MediaAssetDisplay {
  return {
    id,
    asset_type: 'recipe_photo',
    reference_code: position,
    description: '',
    position,
    is_primary: position === 0,
    byte_size: 1024,
    width: 1000,
    height: 500,
    crop,
    full_url: `https://example.test/${id}-full.webp`,
    thumbnail_url: `https://example.test/${id}-thumbnail.webp`,
  };
}

describe('recipe photo gallery', () => {
  it('keeps a twelve-photo recipe to one feature image with selectable thumbnails', () => {
    const photos = Array.from({ length: 12 }, (_, position) => ({
      ...photo(`photo-${position + 1}`, position, null),
      is_primary: position === 5,
    }));
    render(<RecipePhotoGallery photos={photos} />);

    expect(document.querySelectorAll('.recipe-photo-feature-image')).toHaveLength(1);
    expect(
      document.querySelector('.recipe-photo-feature-image')?.getAttribute('data-photo-id'),
    ).toBe('photo-6');
    const thumbnails = screen.getAllByRole('button', { name: /^Show photo \d+$/u });
    expect(thumbnails).toHaveLength(12);
    const lastThumbnail = thumbnails.at(-1);
    if (!lastThumbnail) throw new Error('Expected the twelfth photo thumbnail.');
    expect(screen.getByRole('button', { name: 'Show photo 6' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.click(lastThumbnail);

    expect(
      document.querySelector('.recipe-photo-feature-image')?.getAttribute('data-photo-id'),
    ).toBe('photo-12');
    expect(lastThumbnail.getAttribute('aria-pressed')).toBe('true');
  });

  it('applies each photo crop to its thumbnail and selected feature image', () => {
    const firstCrop = { left: 0.25, top: 0, width: 0.5, height: 1, rotation: 0 } as const;
    const secondCrop = { left: 0.1, top: 0.2, width: 0.4, height: 0.5, rotation: 90 } as const;
    render(
      <RecipePhotoGallery
        photos={[photo('first', 0, firstCrop), photo('second', 1, secondCrop)]}
      />,
    );

    const featureImage = document.querySelector('.recipe-photo-feature-image');
    const secondThumbnail = document.querySelector(
      '.recipe-photo-thumbnail-button[data-photo-id="second"] .framed-media-image',
    );
    expect(featureImage?.getAttribute('viewBox')).toBe('250 0 500 500');
    expect(secondThumbnail?.getAttribute('viewBox')).toBe('50 200 200 500');

    fireEvent.click(screen.getByRole('button', { name: 'Show photo 2' }));

    expect(featureImage?.getAttribute('data-photo-id')).toBe('second');
    expect(featureImage?.getAttribute('viewBox')).toBe('50 200 200 500');
  });
});
