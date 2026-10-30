import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import { type Entry, Parse } from 'unzipper';
import { EXPORT_DATA_BYTES_LIMIT, EXPORT_MEDIA_BYTES_LIMIT } from '../exports/rules';

const compressedArchiveLimit = 1_258_291_200;
const imagePathPattern =
  /^images\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(full|thumbnail|source-full|source-thumbnail)\.webp$/i;
const manifestLimit = 1024 * 1024;
const entryCountLimit = 20_000;

export type ImportImageMetadata = { size_bytes: number; sha256: string };
export type ImportImageSink = (path: string, stream: Readable) => Promise<void>;

function allowedPath(path: string) {
  return path === 'manifest.json' || path === 'data.json' || imagePathPattern.test(path);
}

function fileLimit(path: string) {
  if (path === 'manifest.json') return manifestLimit;
  if (path === 'data.json') return EXPORT_DATA_BYTES_LIMIT;
  return EXPORT_MEDIA_BYTES_LIMIT;
}

async function readSmallEntry(entry: Entry, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of entry) {
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
  stream: ReadableStream<Uint8Array>,
  imageSink: ImportImageSink = async (_path, image) => {
    for await (const _chunk of image) {
      // Consume the stream when no persistent staging destination is supplied.
    }
  },
) {
  const entries = new Map<string, Uint8Array>();
  const images = new Map<string, ImportImageMetadata>();
  let totalCompressedBytes = 0;
  let totalImageBytes = 0;
  const seenPaths = new Set<string>();
  const compressedLimit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      totalCompressedBytes += chunk.byteLength;
      if (totalCompressedBytes > compressedArchiveLimit) {
        callback(new Error('The ZIP archive exceeds the supported upload size limit.'));
        return;
      }
      callback(null, chunk);
    },
  });
  const parser = Parse();
  Readable.fromWeb(stream as unknown as import('node:stream/web').ReadableStream<Uint8Array>)
    .pipe(compressedLimit)
    .pipe(parser);
  let pendingEntries = Promise.resolve();

  const processEntry = async (entry: Entry) => {
    if (
      entry.type !== 'File' ||
      !allowedPath(entry.path) ||
      seenPaths.has(entry.path) ||
      seenPaths.size >= entryCountLimit
    ) {
      entry.autodrain();
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
      await imageSink(entry.path, entry.pipe(meter));
      await sinkFinished;
      images.set(entry.path, { size_bytes: fileBytes, sha256: hash.digest('hex') });
      return;
    }

    entries.set(entry.path, await readSmallEntry(entry, fileLimit(entry.path)));
  };

  parser.on('entry', (entry: Entry) => {
    pendingEntries = pendingEntries.then(() => processEntry(entry));
    void pendingEntries.catch((error: unknown) => {
      parser.destroy(error instanceof Error ? error : new Error('The ZIP archive is invalid.'));
    });
  });
  compressedLimit.once('error', (error) => parser.destroy(error));

  try {
    await parser.promise();
    await pendingEntries;
    return { entries, images };
  } catch (error) {
    throw error instanceof Error ? error : new Error('The ZIP archive is invalid.');
  }
}
