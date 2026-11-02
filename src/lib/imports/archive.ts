import { createHash } from 'node:crypto';
import { PassThrough, Readable, Transform } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { type File, Open } from 'unzipper';
import { EXPORT_DATA_BYTES_LIMIT, EXPORT_MEDIA_BYTES_LIMIT } from '../exports/rules';

const compressedArchiveLimit = 1_258_291_200;
const imagePathPattern =
  /^images\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(full|thumbnail|source-full|source-thumbnail)\.webp$/i;
const manifestLimit = 1024 * 1024;
const entryCountLimit = 20_000;

export type ImportImageMetadata = { size_bytes: number; sha256: string };
export type ImportImageSink = (path: string, stream: Readable) => Promise<void>;
export type ImportArchiveSource = {
  size: () => Promise<number>;
  stream: (offset: number, length: number) => Readable;
};

function allowedPath(path: string) {
  return path === 'manifest.json' || path === 'data.json' || imagePathPattern.test(path);
}

function fileLimit(path: string) {
  if (path === 'manifest.json') return manifestLimit;
  if (path === 'data.json') return EXPORT_DATA_BYTES_LIMIT;
  return EXPORT_MEDIA_BYTES_LIMIT;
}

async function readSourceRange(source: ImportArchiveSource, offset: number, length: number) {
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  for await (const chunk of source.stream(offset, length)) {
    const bytes = Buffer.from(chunk);
    bytesRead += bytes.byteLength;
    if (bytesRead > length) {
      throw new Error('The selected import archive returned an invalid byte range.');
    }
    chunks.push(bytes);
  }
  if (bytesRead !== length) {
    throw new Error('The selected import archive returned an incomplete byte range.');
  }
  return Buffer.concat(chunks, bytesRead);
}

async function readArchiveEntryCount(source: ImportArchiveSource, size: number) {
  const tailLength = Math.min(size, 80);
  const tailOffset = size - tailLength;
  const tail = await readSourceRange(source, tailOffset, tailLength);
  let endOffset = -1;
  for (let offset = 0; offset <= tail.byteLength - 22; offset += 1) {
    if (tail.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) {
    throw new Error('The selected import archive is invalid.');
  }

  const diskNumber = tail.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = tail.readUInt16LE(endOffset + 6);
  const diskEntryCount = tail.readUInt16LE(endOffset + 8);
  const entryCount = tail.readUInt16LE(endOffset + 10);
  const zip64Required =
    diskNumber === 0xffff ||
    centralDirectoryDisk === 0xffff ||
    diskEntryCount === 0xffff ||
    entryCount === 0xffff ||
    tail.readUInt32LE(endOffset + 12) === 0xffffffff ||
    tail.readUInt32LE(endOffset + 16) === 0xffffffff;

  if (!zip64Required) {
    if (diskNumber !== 0 || centralDirectoryDisk !== 0 || diskEntryCount !== entryCount) {
      throw new Error('The archive uses an unsupported multi-disk ZIP format.');
    }
    return BigInt(entryCount);
  }

  const endRecordOffset = tailOffset + endOffset;
  if (endRecordOffset < 20) {
    throw new Error('The selected import archive is invalid.');
  }
  const locator = await readSourceRange(source, endRecordOffset - 20, 20);
  if (
    locator.readUInt32LE(0) !== 0x07064b50 ||
    locator.readUInt32LE(4) !== 0 ||
    locator.readUInt32LE(16) !== 1
  ) {
    throw new Error('The selected import archive has an invalid ZIP64 directory.');
  }

  const zip64Offset = locator.readBigUInt64LE(8);
  if (zip64Offset > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('The selected import archive has an invalid ZIP64 directory.');
  }
  const zip64Record = await readSourceRange(source, Number(zip64Offset), 56);
  const zip64RecordSize = zip64Record.readBigUInt64LE(4);
  if (
    zip64Record.readUInt32LE(0) !== 0x06064b50 ||
    zip64RecordSize < BigInt(44) ||
    zip64Offset + BigInt(12) + zip64RecordSize > BigInt(endRecordOffset - 20) ||
    zip64Record.readUInt32LE(16) !== 0 ||
    zip64Record.readUInt32LE(20) !== 0 ||
    zip64Record.readBigUInt64LE(24) !== zip64Record.readBigUInt64LE(32)
  ) {
    throw new Error('The selected import archive has an invalid ZIP64 directory.');
  }

  return zip64Record.readBigUInt64LE(32);
}

export function createRangeArchiveSource(url: string): ImportArchiveSource {
  let archiveSize: number | null = null;

  async function requestRange(start: number, end: number, expectedSize?: number) {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Accept-Encoding': 'identity',
        Range: `bytes=${start}-${end}`,
      },
    });
    const contentRange = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(
      response.headers.get('content-range') ?? '',
    );
    const rangeStart = Number(contentRange?.[1]);
    const rangeEnd = Number(contentRange?.[2]);
    const totalSize = Number(contentRange?.[3]);
    if (
      response.status !== 206 ||
      !response.body ||
      !contentRange ||
      !Number.isSafeInteger(rangeStart) ||
      !Number.isSafeInteger(rangeEnd) ||
      !Number.isSafeInteger(totalSize) ||
      rangeStart !== start ||
      rangeEnd !== end ||
      (expectedSize !== undefined && totalSize !== expectedSize)
    ) {
      await response.body?.cancel();
      throw new Error('The selected import archive could not be read using byte-range requests.');
    }

    return { response, totalSize };
  }

  return {
    async size() {
      const { response, totalSize } = await requestRange(0, 0);
      await response.body?.cancel();
      archiveSize = totalSize;
      return totalSize;
    },
    stream(offset: number, length?: number) {
      const output = new PassThrough();
      void (async () => {
        if (archiveSize === null || !Number.isSafeInteger(offset) || offset < 0) {
          throw new Error('The selected import archive has an invalid byte range.');
        }
        if (length === 0) {
          output.end();
          return;
        }

        const end =
          length === undefined ? archiveSize - 1 : Math.min(archiveSize - 1, offset + length - 1);
        if (!Number.isSafeInteger(end) || offset >= archiveSize || end < offset) {
          throw new Error('The selected import archive has an invalid byte range.');
        }

        const { response } = await requestRange(offset, end, archiveSize);
        const expectedBytes = end - offset + 1;
        let receivedBytes = 0;
        const lengthGuard = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            receivedBytes += chunk.byteLength;
            if (receivedBytes > expectedBytes) {
              callback(new Error('The selected import archive returned an invalid byte range.'));
              return;
            }
            callback(null, chunk);
          },
          flush(callback) {
            if (receivedBytes !== expectedBytes) {
              callback(new Error('The selected import archive returned an incomplete byte range.'));
              return;
            }
            callback();
          },
        });
        await pipeline(
          Readable.fromWeb(
            response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>,
          ),
          lengthGuard,
          output,
        );
      })().catch((error: unknown) => {
        if (!output.destroyed) {
          output.destroy(
            error instanceof Error ? error : new Error('The archive range is invalid.'),
          );
        }
      });
      return output;
    },
  };
}

async function readSmallEntry(entry: File, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of entry.stream()) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > limit) {
      throw new Error('An archive entry exceeds its supported size limit.');
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

export async function readImportArchive(
  source: ImportArchiveSource,
  imageSink: ImportImageSink = async (_path, image) => {
    for await (const _chunk of image) {
      // Consume the stream when no persistent staging destination is supplied.
    }
  },
) {
  const entries = new Map<string, Uint8Array>();
  const images = new Map<string, ImportImageMetadata>();
  let totalImageBytes = 0;
  const seenPaths = new Set<string>();
  const archiveSize = await source.size();
  if (!Number.isSafeInteger(archiveSize) || archiveSize <= 0) {
    throw new Error('The selected import archive is invalid.');
  }
  if (archiveSize > compressedArchiveLimit) {
    throw new Error('The ZIP archive exceeds the supported upload size limit.');
  }
  if ((await readArchiveEntryCount(source, archiveSize)) > BigInt(entryCountLimit)) {
    throw new Error('The archive contains an unsafe, duplicate, or unsupported file entry.');
  }

  const directory = await Open.custom({
    size: async () => archiveSize,
    stream: source.stream,
  });
  if (directory.files.length > entryCountLimit) {
    throw new Error('The archive contains an unsafe, duplicate, or unsupported file entry.');
  }

  for (const entry of directory.files) {
    if (
      entry.type !== 'File' ||
      !allowedPath(entry.path) ||
      seenPaths.has(entry.path) ||
      seenPaths.size >= entryCountLimit
    ) {
      throw new Error('The archive contains an unsafe, duplicate, or unsupported file entry.');
    }
    seenPaths.add(entry.path);

    if (entry.path.startsWith('images/')) {
      const hash = createHash('sha256');
      let fileBytes = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          fileBytes += chunk.byteLength;
          totalImageBytes += chunk.byteLength;
          if (fileBytes > EXPORT_MEDIA_BYTES_LIMIT || totalImageBytes > EXPORT_MEDIA_BYTES_LIMIT) {
            callback(new Error('The bundle images exceed the supported media size limit.'));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      const sinkFinished = finished(meter);
      await imageSink(entry.path, entry.stream().pipe(meter));
      await sinkFinished;
      images.set(entry.path, { size_bytes: fileBytes, sha256: hash.digest('hex') });
      continue;
    }

    entries.set(entry.path, await readSmallEntry(entry, fileLimit(entry.path)));
  }

  return { entries, images };
}
