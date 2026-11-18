import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { type DefaultTreeAdapterTypes, parse } from 'parse5';
import { normalizeHttpUrl } from '../publications/validation';

const maximumResponseBytes = 256 * 1024;
const maximumRedirects = 3;
const maximumLookupsPerSave = 5;
const lookupBudgetMilliseconds = 2_000;

const nonPublicIpv4 = new BlockList();
for (const [subnet, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  nonPublicIpv4.addSubnet(subnet, prefix, 'ipv4');
}

const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');

const nonPublicIpv6 = new BlockList();
for (const [subnet, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  nonPublicIpv6.addSubnet(subnet, prefix, 'ipv6');
}

export type ExternalTitleLookupFailure =
  | 'invalid_url'
  | 'invalid_redirect'
  | 'dns_error'
  | 'blocked_address'
  | 'request_error'
  | 'timeout'
  | 'too_many_redirects'
  | 'http_status'
  | 'non_html'
  | 'unsupported_encoding'
  | 'response_too_large'
  | 'missing_title';

export type ExternalTitleLookupResult = {
  title: string | null;
  reason: ExternalTitleLookupFailure | null;
};

export type ResolvedAddress = {
  address: string;
  family: number;
};

export type ExternalPageResponse = {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
};

export type ExternalTitleLookupDependencies = {
  resolveAddresses: (hostname: string) => Promise<ResolvedAddress[]>;
  requestPage: (
    url: URL,
    address: ResolvedAddress,
    signal: AbortSignal,
  ) => Promise<ExternalPageResponse>;
};

type ExternalReferenceInput = {
  id: string;
  reference_type: string;
  display_text: string;
  url: string | null;
  is_protected_source: boolean;
  source_public_id: string | null;
};

type StoredExternalReference = {
  id: string;
  url: string | null;
  display_text: string;
  is_protected_source: boolean;
  source_public_id: string | null;
};

type FetchExternalPageTitle = (
  url: string,
  signal: AbortSignal,
) => Promise<ExternalTitleLookupResult>;

class ExternalTitleLookupError extends Error {
  constructor(readonly reason: ExternalTitleLookupFailure) {
    super(reason);
  }
}

function normalizedHostname(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/gu, '')
    .replace(/\.$/u, '')
    .toLocaleLowerCase();
}

function parsePublicHttpUrl(value: string): URL | null {
  const trimmed = value.trim();
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/iu.exec(trimmed)?.[1];
  if (!authority || authority.includes('@')) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.port ||
      url.hostname.includes('%')
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function hasSameNormalizedUrl(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const normalizedLeft = normalizeHttpUrl(left);
  return normalizedLeft !== null && normalizedLeft === normalizeHttpUrl(right);
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return !nonPublicIpv4.check(address, 'ipv4');
  }
  if (family === 6) {
    return globalIpv6.check(address, 'ipv6') && !nonPublicIpv6.check(address, 'ipv6');
  }
  return false;
}

function resolveAddresses(hostname: string): Promise<ResolvedAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function rejectOnAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new ExternalTitleLookupError('timeout'));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ExternalTitleLookupError('timeout'));
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function requestPage(
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal,
): Promise<ExternalPageResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (reason: ExternalTitleLookupFailure) => {
      if (settled) return;
      settled = true;
      reject(new ExternalTitleLookupError(reason));
    };

    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      agent: false,
      headers: {
        Accept: 'text/html, application/xhtml+xml',
        'Accept-Encoding': 'identity',
      },
      maxHeaderSize: 16 * 1024,
      method: 'GET',
      signal,
      lookup: (hostname, options, callback) => {
        if (normalizedHostname(hostname) !== normalizedHostname(url.hostname)) {
          callback(new Error('Unpinned host lookup rejected.'), '', 0);
          return;
        }

        if (options.all) {
          callback(null, [{ address: address.address, family: address.family }]);
        } else {
          callback(null, address.address, address.family);
        }
      },
    });

    request.once('response', (response) => {
      const contentLength = response.headers['content-length'];
      if (typeof contentLength === 'string' && Number(contentLength) > maximumResponseBytes) {
        fail('response_too_large');
        response.destroy();
        request.destroy();
        return;
      }

      const chunks: Buffer[] = [];
      let byteCount = 0;
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        byteCount += buffer.length;
        if (byteCount > maximumResponseBytes) {
          fail('response_too_large');
          response.destroy();
          request.destroy();
          return;
        }
        chunks.push(buffer);
      });
      response.once('aborted', () => fail(signal.aborted ? 'timeout' : 'request_error'));
      response.once('error', () => fail(signal.aborted ? 'timeout' : 'request_error'));
      response.once('end', () => {
        if (settled) return;
        settled = true;
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks, byteCount),
        });
      });
    });
    request.once('error', () => fail(signal.aborted ? 'timeout' : 'request_error'));
    request.end();
  });
}

const defaultDependencies: ExternalTitleLookupDependencies = {
  resolveAddresses,
  requestPage,
};

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getNodeText(node: DefaultTreeAdapterTypes.Node): string {
  if ('value' in node) {
    return node.value;
  }
  if ('childNodes' in node) {
    return node.childNodes.map(getNodeText).join('');
  }
  return '';
}

function findTitleNode(node: DefaultTreeAdapterTypes.Node): DefaultTreeAdapterTypes.Element | null {
  if ('tagName' in node && node.tagName === 'title') {
    return node;
  }
  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      const title = findTitleNode(child);
      if (title) return title;
    }
  }
  return null;
}

export function extractExternalPageTitle(markup: string): string | null {
  const titleNode = findTitleNode(parse(markup));
  const title = titleNode ? getNodeText(titleNode).replace(/\s+/gu, ' ').trim() : '';
  return title || null;
}

function failure(reason: ExternalTitleLookupFailure): ExternalTitleLookupResult {
  return { title: null, reason };
}

export async function fetchExternalPageTitle(
  value: string,
  signal: AbortSignal,
  dependencies: ExternalTitleLookupDependencies = defaultDependencies,
): Promise<ExternalTitleLookupResult> {
  let url = parsePublicHttpUrl(value);
  if (!url) {
    return failure('invalid_url');
  }

  let redirects = 0;
  while (true) {
    if (signal.aborted) {
      return failure('timeout');
    }

    const hostname = normalizedHostname(url.hostname);
    let addresses: ResolvedAddress[];
    try {
      const literalFamily = isIP(hostname);
      addresses = literalFamily
        ? [{ address: hostname, family: literalFamily }]
        : await rejectOnAbort(dependencies.resolveAddresses(hostname), signal);
    } catch (error) {
      return failure(
        signal.aborted
          ? 'timeout'
          : error instanceof ExternalTitleLookupError
            ? error.reason
            : 'dns_error',
      );
    }

    if (
      addresses.length === 0 ||
      addresses.some(
        ({ address, family }) => isIP(address) !== family || !isPublicIpAddress(address),
      )
    ) {
      return failure('blocked_address');
    }

    let response: ExternalPageResponse;
    try {
      response = await rejectOnAbort(dependencies.requestPage(url, addresses[0], signal), signal);
    } catch (error) {
      return failure(
        signal.aborted
          ? 'timeout'
          : error instanceof ExternalTitleLookupError
            ? error.reason
            : 'request_error',
      );
    }

    const location = headerValue(response.headers.location);
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      if (!location) {
        return failure('invalid_redirect');
      }
      if (redirects >= maximumRedirects) {
        return failure('too_many_redirects');
      }
      try {
        const redirectedUrl = new URL(location, url);
        const validatedUrl = parsePublicHttpUrl(redirectedUrl.href);
        if (!validatedUrl) {
          return failure('invalid_redirect');
        }
        url = validatedUrl;
      } catch {
        return failure('invalid_redirect');
      }
      redirects += 1;
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return failure('http_status');
    }
    if (response.body.byteLength > maximumResponseBytes) {
      return failure('response_too_large');
    }

    const contentType = headerValue(response.headers['content-type'])
      ?.split(';', 1)[0]
      ?.trim()
      .toLocaleLowerCase();
    if (contentType !== 'text/html' && contentType !== 'application/xhtml+xml') {
      return failure('non_html');
    }
    const contentEncoding = headerValue(response.headers['content-encoding'])?.trim().toLowerCase();
    if (contentEncoding && contentEncoding !== 'identity') {
      return failure('unsupported_encoding');
    }

    const title = extractExternalPageTitle(response.body.toString('utf8'));
    return title ? { title, reason: null } : failure('missing_title');
  }
}

export async function resolveExternalReferenceTitles<T extends ExternalReferenceInput>(
  references: readonly T[],
  storedReferences: readonly StoredExternalReference[],
  lookupTitle: FetchExternalPageTitle = fetchExternalPageTitle,
): Promise<T[]> {
  const storedById = new Map(storedReferences.map((reference) => [reference.id, reference]));
  const manualLabelIds = new Set<string>();
  const prepared = references.map((reference) => {
    if (reference.reference_type !== 'external_url') {
      return reference;
    }

    const stored = storedById.get(reference.id);
    if (stored?.is_protected_source || reference.is_protected_source) {
      return {
        ...reference,
        display_text: stored?.is_protected_source ? stored.display_text : reference.display_text,
        is_protected_source: true,
        source_public_id: stored?.is_protected_source
          ? stored.source_public_id
          : reference.source_public_id,
        url: stored?.is_protected_source ? stored.url : reference.url,
      };
    }

    const unchangedUrl = stored && hasSameNormalizedUrl(stored.url, reference.url);
    const submittedLabel = reference.display_text.trim();
    const changedLabel = stored
      ? submittedLabel !== stored.display_text.trim()
      : submittedLabel.length > 0;
    const hasManualLabel = changedLabel && (submittedLabel.length > 0 || Boolean(unchangedUrl));
    if (hasManualLabel) {
      manualLabelIds.add(reference.id);
    }

    return {
      ...reference,
      display_text: hasManualLabel
        ? submittedLabel || (reference.url ?? '')
        : unchangedUrl
          ? stored.display_text
          : (reference.url ?? ''),
      is_protected_source: false,
      source_public_id: null,
      url: unchangedUrl ? stored.url : reference.url,
    };
  });

  const candidateUrls = new Map<string, T[]>();
  for (const reference of prepared) {
    if (
      reference.reference_type !== 'external_url' ||
      !reference.url ||
      reference.is_protected_source ||
      manualLabelIds.has(reference.id)
    ) {
      continue;
    }
    const stored = storedById.get(reference.id);
    if (stored && hasSameNormalizedUrl(stored.url, reference.url)) {
      continue;
    }
    const candidates = candidateUrls.get(reference.url) ?? [];
    candidates.push(reference);
    candidateUrls.set(reference.url, candidates);
  }

  const urls = [...candidateUrls.keys()];
  if (urls.length === 0) {
    return prepared;
  }

  if (urls.length > maximumLookupsPerSave) {
    console.warn('Skipped external reference title lookups after reaching the per-save limit.', {
      skippedCount: urls.length - maximumLookupsPerSave,
    });
  }

  const controller = new AbortController();
  const timeoutResult = Symbol('lookup-timeout');
  const timeout = setTimeout(() => controller.abort(), lookupBudgetMilliseconds);
  const timeoutPromise = new Promise<typeof timeoutResult>((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(timeoutResult), { once: true });
  });

  try {
    const lookupPromises = urls.slice(0, maximumLookupsPerSave).map(async (url) => {
      try {
        const result = await lookupTitle(url, controller.signal);
        if (!result.title) {
          console.warn('External reference title lookup failed; using its URL as the label.', {
            reason: result.reason ?? 'missing_title',
          });
        }
        return [url, result.title] as const;
      } catch {
        console.warn('External reference title lookup failed; using its URL as the label.', {
          reason: 'unexpected_lookup_error',
        });
        return [url, null] as const;
      }
    });

    const results = await Promise.race([Promise.all(lookupPromises), timeoutPromise]);
    if (results === timeoutResult) {
      console.warn('External reference title lookups exceeded the per-save time budget.');
      return prepared;
    }

    const titlesByUrl = new Map(results);
    return prepared.map((reference) => {
      if (reference.reference_type !== 'external_url' || !reference.url) {
        return reference;
      }
      if (manualLabelIds.has(reference.id)) {
        return reference;
      }
      const stored = storedById.get(reference.id);
      if (
        stored?.is_protected_source ||
        (stored && hasSameNormalizedUrl(stored.url, reference.url))
      ) {
        return reference;
      }
      return {
        ...reference,
        display_text: titlesByUrl.get(reference.url) || reference.url,
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}
