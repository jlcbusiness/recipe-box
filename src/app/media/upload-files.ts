'use client';

import { MAX_IMAGE_UPLOAD_BYTES } from '../../lib/media/rules';
import { createClient } from '../../lib/supabase/browser';

type MediaParent = 'recipe' | 'publication';
type ApiError = { error?: string; cleanupPending?: boolean };

async function responseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as ApiError;
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

export async function uploadMediaFiles(
  parentType: MediaParent,
  parentId: string,
  files: File[],
  onProgress?: (index: number, total: number) => void,
  onUploaded?: () => void,
) {
  const storage = createClient();
  let uploaded = 0;
  let cleanupPending = false;

  for (const [index, file] of files.entries()) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error(`${file.name}: images must be 20 MiB or smaller.`);
    }
    onProgress?.(index + 1, files.length);

    const reservationResponse = await fetch('/api/media/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentType, parentId }),
    });
    if (!reservationResponse.ok) {
      throw new Error(await responseError(reservationResponse, 'Unable to start image upload.'));
    }

    const reservation = (await reservationResponse.json()) as {
      assetId: string;
      path: string;
      token: string;
    };
    const { error: storageError } = await storage.storage
      .from('recipe-media')
      .uploadToSignedUrl(reservation.path, reservation.token, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (storageError) {
      const cancelled = await fetch(`/api/media/uploads/${reservation.assetId}`, {
        method: 'DELETE',
      });
      if (!cancelled.ok) {
        throw new Error(
          'The image could not be uploaded, and its temporary upload could not be cancelled.',
        );
      }
      throw new Error('Unable to upload this image. Choose it again and retry.');
    }

    const completionResponse = await fetch(`/api/media/uploads/${reservation.assetId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: '' }),
    });
    if (!completionResponse.ok) {
      throw new Error(
        await responseError(completionResponse, 'Unable to process this image. Choose it again.'),
      );
    }

    const completion = (await completionResponse.json()) as ApiError;
    uploaded += 1;
    cleanupPending ||= Boolean(completion.cleanupPending);
    onUploaded?.();
  }

  return { uploaded, cleanupPending };
}
