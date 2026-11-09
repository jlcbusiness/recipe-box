import { createHash } from 'node:crypto';

export function createPublicPhotoId(publicId: string, assetId: string): string {
  const hash = createHash('sha256')
    .update(`${publicId.toLocaleLowerCase()}:${assetId.toLocaleLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}
