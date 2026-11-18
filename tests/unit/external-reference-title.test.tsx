import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ExternalPageResponse,
  type ExternalTitleLookupDependencies,
  extractExternalPageTitle,
  fetchExternalPageTitle,
  isPublicIpAddress,
  type ResolvedAddress,
  resolveExternalReferenceTitles,
} from '../../src/lib/recipes/external-reference-title';

const publicAddress: ResolvedAddress = { address: '8.8.8.8', family: 4 };

function response(
  statusCode: number,
  headers: ExternalPageResponse['headers'],
  body = '',
): ExternalPageResponse {
  return { statusCode, headers, body: Buffer.from(body) };
}

function reference(id: string, url: string, display_text = '') {
  return {
    id,
    reference_type: 'external_url',
    display_text,
    linked_recipe_id: null,
    publication_id: null,
    url,
    is_protected_source: false,
    source_public_id: null,
  };
}

function storedReference(id: string, url: string, displayText: string, isProtectedSource = false) {
  return {
    id,
    url,
    display_text: displayText,
    is_protected_source: isProtectedSource,
    source_public_id: isProtectedSource ? '00000000-0000-4000-8000-000000000001' : null,
  };
}

function responseDependencies(
  responses: ExternalPageResponse[],
  addresses: ResolvedAddress[] = [publicAddress],
) {
  const resolvedHosts: string[] = [];
  const requestedPages: { url: string; address: ResolvedAddress }[] = [];
  const dependencies: ExternalTitleLookupDependencies = {
    async resolveAddresses(hostname) {
      resolvedHosts.push(hostname);
      return addresses;
    },
    async requestPage(url, address) {
      requestedPages.push({ url: url.href, address });
      const next = responses.shift();
      if (!next) throw new Error('No test response configured.');
      return next;
    },
  };
  return { dependencies, resolvedHosts, requestedPages };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('external reference title lookup', () => {
  it('extracts and normalizes decoded HTML title text', () => {
    expect(
      extractExternalPageTitle(
        '<!doctype html><title>  Salt&nbsp; &amp; Pepper\n Recipes </title>',
      ),
    ).toBe('Salt & Pepper Recipes');
    expect(extractExternalPageTitle('<html><body>No page title</body></html>')).toBeNull();
  });

  it('allows only public IPv4 and global-unicast IPv6 addresses', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('2001:4860:4860::8888')).toBe(true);
    for (const address of [
      '0.1.2.3',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.1.1',
      '172.16.0.1',
      '192.168.1.1',
      '198.18.0.1',
      '224.0.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '2001:db8::1',
    ]) {
      expect(isPublicIpAddress(address), address).toBe(false);
    }
  });

  it('follows a bounded redirect and extracts the final page title', async () => {
    const { dependencies, resolvedHosts, requestedPages } = responseDependencies([
      response(302, { location: '/recipe' }),
      response(
        200,
        { 'content-type': 'text/html; charset=utf-8' },
        '<title>Soup &amp; Bread</title>',
      ),
    ]);

    await expect(
      fetchExternalPageTitle(
        'https://example.test/start',
        new AbortController().signal,
        dependencies,
      ),
    ).resolves.toEqual({ title: 'Soup & Bread', reason: null });
    expect(resolvedHosts).toEqual(['example.test', 'example.test']);
    expect(requestedPages.map(({ url }) => url)).toEqual([
      'https://example.test/start',
      'https://example.test/recipe',
    ]);
    expect(requestedPages.every(({ address }) => address === publicAddress)).toBe(true);
  });

  it('rejects unsafe URLs and private DNS answers before making a request', async () => {
    const unsafe = responseDependencies([]);
    await expect(
      fetchExternalPageTitle(
        'http://127.0.0.1/private',
        new AbortController().signal,
        unsafe.dependencies,
      ),
    ).resolves.toMatchObject({ title: null, reason: 'blocked_address' });
    await expect(
      fetchExternalPageTitle(
        'https://example.test:8080/path',
        new AbortController().signal,
        unsafe.dependencies,
      ),
    ).resolves.toMatchObject({ title: null, reason: 'invalid_url' });
    await expect(
      fetchExternalPageTitle(
        'https://user:password@example.test/path',
        new AbortController().signal,
        unsafe.dependencies,
      ),
    ).resolves.toMatchObject({ title: null, reason: 'invalid_url' });
    expect(unsafe.requestedPages).toHaveLength(0);

    const privateDns = responseDependencies([], [{ address: '10.2.3.4', family: 4 }]);
    await expect(
      fetchExternalPageTitle(
        'https://example.test/path',
        new AbortController().signal,
        privateDns.dependencies,
      ),
    ).resolves.toMatchObject({ title: null, reason: 'blocked_address' });
    expect(privateDns.requestedPages).toHaveLength(0);
  });

  it('stops after the redirect limit and rejects non-HTML or oversized responses', async () => {
    const redirectResponses = Array.from({ length: 4 }, (_, index) =>
      response(302, { location: `/redirect-${index + 1}` }),
    );
    const redirects = responseDependencies(redirectResponses);
    await expect(
      fetchExternalPageTitle(
        'https://example.test/start',
        new AbortController().signal,
        redirects.dependencies,
      ),
    ).resolves.toMatchObject({ title: null, reason: 'too_many_redirects' });
    expect(redirects.requestedPages).toHaveLength(4);

    const nonHtml = responseDependencies([response(200, { 'content-type': 'application/json' })]);
    await expect(
      fetchExternalPageTitle(
        'https://example.test/data',
        new AbortController().signal,
        nonHtml.dependencies,
      ),
    ).resolves.toMatchObject({ title: null, reason: 'non_html' });

    const encoded = responseDependencies([
      response(
        200,
        { 'content-type': 'text/html', 'content-encoding': 'gzip' },
        '<title>Compressed</title>',
      ),
    ]);
    await expect(
      fetchExternalPageTitle(
        'https://example.test/encoded',
        new AbortController().signal,
        encoded.dependencies,
      ),
    ).resolves.toMatchObject({ title: null, reason: 'unsupported_encoding' });

    const oversized = responseDependencies([
      {
        ...response(200, { 'content-type': 'text/html' }),
        body: Buffer.alloc(256 * 1024 + 1),
      },
    ]);
    await expect(
      fetchExternalPageTitle(
        'https://example.test/large',
        new AbortController().signal,
        oversized.dependencies,
      ),
    ).resolves.toMatchObject({ title: null, reason: 'response_too_large' });
  });

  it('aborts a request when its lookup signal is cancelled', async () => {
    const controller = new AbortController();
    let requestStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    const dependencies: ExternalTitleLookupDependencies = {
      async resolveAddresses() {
        return [publicAddress];
      },
      requestPage(_url, _address, signal) {
        requestStarted();
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      },
    };

    const lookup = fetchExternalPageTitle(
      'https://example.test/slow',
      controller.signal,
      dependencies,
    );
    await started;
    controller.abort();
    await expect(lookup).resolves.toMatchObject({ title: null, reason: 'timeout' });
  });
});

describe('recipe reference title resolution', () => {
  it('preserves titles for unchanged normalized URLs and fetches only changed references', async () => {
    const lookup = vi.fn(async (url: string) => ({ title: `Title for ${url}`, reason: null }));
    const references = [
      reference('unchanged', 'https://example.test/recipe', 'Existing title'),
      reference('changed', 'https://example.test/new'),
    ];

    const resolved = await resolveExternalReferenceTitles(
      references,
      [
        storedReference('unchanged', 'https://EXAMPLE.test/recipe', 'Existing title'),
        storedReference('changed', 'https://example.test/old', 'Old title'),
      ],
      lookup,
    );

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('https://example.test/new', expect.any(AbortSignal));
    expect(resolved.map(({ display_text }) => display_text)).toEqual([
      'Existing title',
      'Title for https://example.test/new',
    ]);
    expect(resolved[0].url).toBe('https://EXAMPLE.test/recipe');
  });

  it('uses a manual label without fetching and allows clearing an unchanged label', async () => {
    const lookup = vi.fn(async (url: string) => ({ title: `Title for ${url}`, reason: null }));
    const unchangedUrl = 'https://example.test/unchanged';
    const references = [
      reference('new-manual', 'https://example.test/new', 'Hand-entered title'),
      reference('existing-manual', unchangedUrl, 'Updated title'),
      reference('cleared', 'https://example.test/cleared'),
    ];

    const resolved = await resolveExternalReferenceTitles(
      references,
      [
        storedReference('existing-manual', unchangedUrl, 'Old title'),
        storedReference('cleared', 'https://example.test/cleared', 'Old title'),
      ],
      lookup,
    );

    expect(lookup).not.toHaveBeenCalled();
    expect(resolved.map(({ display_text }) => display_text)).toEqual([
      'Hand-entered title',
      'Updated title',
      'https://example.test/cleared',
    ]);
  });

  it('preserves protected source references without fetching or rewriting them', async () => {
    const lookup = vi.fn(async () => ({ title: 'Untrusted title', reason: null }));
    const protectedReference = {
      ...reference('protected', 'https://example.test/changed'),
      is_protected_source: true,
      source_public_id: '00000000-0000-4000-8000-000000000001',
    };

    const [resolved] = await resolveExternalReferenceTitles(
      [protectedReference],
      [storedReference('protected', 'https://example.test/source', 'Protected title', true)],
      lookup,
    );

    expect(lookup).not.toHaveBeenCalled();
    expect(resolved).toMatchObject({
      display_text: 'Protected title',
      source_public_id: '00000000-0000-4000-8000-000000000001',
      url: 'https://example.test/source',
    });
  });

  it('limits each save to five unique lookups and falls back to URLs after two seconds', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lookup = vi.fn(async (url: string) => ({ title: `Title ${url}`, reason: null }));
    const manyReferences = Array.from({ length: 7 }, (_, index) =>
      reference(`reference-${index}`, `https://example.test/${index}`),
    );
    const resolved = await resolveExternalReferenceTitles(manyReferences, [], lookup);
    expect(lookup).toHaveBeenCalledTimes(5);
    expect(resolved[4].display_text).toBe('Title https://example.test/4');
    expect(resolved[5].display_text).toBe('https://example.test/5');
    expect(resolved[6].display_text).toBe('https://example.test/6');

    vi.useFakeTimers();
    let wasAborted = false;
    const slowLookup = vi.fn(
      (_url: string, signal: AbortSignal) =>
        new Promise<{ title: string | null; reason: null }>(() => {
          signal.addEventListener('abort', () => {
            wasAborted = true;
          });
        }),
    );
    const slowResolution = resolveExternalReferenceTitles(
      [reference('slow', 'https://example.test/slow')],
      [],
      slowLookup,
    );
    await vi.advanceTimersByTimeAsync(2_000);
    const [fallback] = await slowResolution;
    expect(wasAborted).toBe(true);
    expect(fallback.display_text).toBe('https://example.test/slow');
  });
});
