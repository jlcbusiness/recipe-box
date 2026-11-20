# Slice 24: Install and Offline

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 24 and Standing Rules
- [First-draft specification](../first-draft-spec.md), Product, Sharing and Authentication, Accessibility, and Testability
- [Comprehensive reference](../comprehensive-reference.md), §§ 9, 13, 14, and 16
- [Data model](../data-model.md), Ownership
- [Design philosophy](../design-philosophy.md), Treat device capabilities as enhancements and Keep temporary state temporary
- [Visual design guide](../visual-design.md), Accessibility and Interaction
- [Decision log](../decision-log.md), public-link and private-data decisions
- [Slice 22: Public links and privacy](22-public-links-and-privacy.md)
- [Slice 23: History viewer](23-history-viewer.md)
- [Next.js 16.3.8 PWA guide](../../node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md)
- [Next.js 16.3.8 offline support guide](../../node_modules/next/dist/docs/01-app/02-guides/offline-support.md)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN: Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

## Outcome

A signed-in owner can install Recipe Box where the browser supports installation,
then reopen recently viewed recipe details without a network connection. Signing
out removes this browser's private offline copies before the server sign-out
runs. No hosted service, database change, or local-data reset is required.

## Scope

- Add the root web app manifest and Recipe Box icons, and register a root-scoped
  service worker as a progressive enhancement.
- Keep a bounded, most-recently-viewed set of up to 10 active owner recipe detail
  pages in browser Cache Storage. Capture only after the authenticated detail
  route has rendered successfully; refresh the saved copy on a successful
  online visit and evict the least recently viewed entry when full.
- Use network-first navigation for `/` and `/recipes/{id}`. If the network is
  unavailable at `/`, show an offline index containing only locally cached
  recipe titles and links. At a recipe path, serve only that exact cached copy.
  Any other uncached path gets a generic offline response that does not reveal
  recipe existence or title. HTTP error responses such as 401, 404, and 410 are
  returned normally and remove any stale cached copy for that path.
- Preserve the rendered recipe text and Recipe Box styles in offline copies.
  Mark the page as an offline snapshot, remove remote image URLs and scripts,
  and omit controls that would require a server mutation or navigation. The
  snapshot is read-only; the browser's offline indicator and a concise status
  identify its stale, local nature.
- Cache only same-origin immutable application assets needed by pages already
  visited. Do not cache public `/r/{publicId}` pages, private API responses,
  mutations, authentication pages, signed image responses, or arbitrary
  navigations.
- Delete every Recipe Box private offline-cache version when the owner submits
  Sign out. If local deletion fails, keep the session active and report a
  retryable error. If Cache Storage or service workers are unavailable, normal
  online use and sign-out continue; offline availability is absent.

## Exclusions and boundaries

- No recipe or publication schema, migration, Supabase policy, server cache
  header, export format, or public projection changes.
- No offline sign-in, recipe editing/saving, publication detail, search, history,
  public recipe access, private photo storage, or background synchronization.
- No custom install-prompt workflow. Installation is offered through the
  browser's supported UI; `beforeinstallprompt` is not cross-platform. Manual
  install checks on physical devices belong to Slice 25.
- Offline copies can be stale relative to changes made on another device until
  a successful online visit replaces them. Explicit sign-out clears them.

## Existing patterns and technical notes

- `/recipes/[id]` is rendered behind the authenticated recipes layout and loads
  owner-scoped detail data. Public links use the separate Pages Router `/r` path
  and explicitly return `Cache-Control: no-store`; that contract remains
  unchanged.
- Account sign-out is a client-rendered form calling a server action. Browser
  Cache Storage must therefore be erased in the client before submitting that
  action; server code cannot clear the browser's storage.
- Next.js 16.3.8 documents manifests in the App Router and custom service
  workers for full offline reloads. Its `experimental.useOffline` guide covers
  retrying soft navigations and Server Actions, but explicitly does not make a
  full reload work offline, so it is not this slice's storage mechanism.
- Do not register the service worker during normal development; unregister this
  app's existing worker there to keep development assets fresh. The E2E server
  explicitly enables registration so offline behavior remains covered.
- The Cache API is explicit application storage: it does not obey HTTP cache
  headers and entries persist until evicted or deleted. Keep the server's
  `no-store` privacy behavior and implement a dedicated, versioned, bounded
  private cache with explicit sign-out cleanup.
- Reuse the existing Recipe Tin image as the icon source; do not add external
  imagery. Offline copies omit photo bytes and signed URLs because current media
  is stored privately and delivered through expiring remote URLs.

## User flow and state

1. The user opens an active recipe online while signed in. Its detail page is
   rendered and its static offline copy is stored locally if supported. Cache
   errors do not block reading the online page.
2. The user launches the installed app or opens `/` without connectivity. The
  service worker shows the latest cached recipe titles as a keyboard-operable
  list; selecting one opens its static offline detail copy. The copy has no
  edit, share, export, history, or remote-media action and does not write data.
3. Opening an uncached recipe or another uncached route while offline shows a
  generic, accessible offline message. Restoring connectivity and reopening a
  recipe fetches the server response and replaces or removes its local copy
  according to the response.
4. On Sign out, the client first deletes all Recipe Box private offline caches.
   Only after successful deletion does it submit the existing server action. A
   deletion error leaves the account signed in, explains the failure, and offers
   retry. Sign-in and all other current settings are unchanged.

## Responsive and accessibility behavior

- The ordinary app layout and recipe reading style remain unchanged online.
  Offline snapshots retain readable content width, responsive wrapping, and
  sufficient contrast, with a visible `role="status"` notice.
- The generic offline response has a semantic heading and explanatory text;
  keyboard focus remains visible for any available recovery action. No
  installation action is shown where the browser does not support it.
- Sign-out retains its existing keyboard-accessible button. While cleanup runs,
  prevent duplicate submission and announce progress; expose a failed cleanup
  as a labeled, retryable alert without losing the authenticated page.
- Automate keyboard operation, visible focus, labels, contrast, and axe checks
  for the offline screen and sign-out cleanup state. Test desktop and Fold 6
  widths without horizontal overflow.

## Acceptance criteria and automated coverage

| Acceptance criterion | Automated evidence |
| -------------------- | ------------------ |
| The root manifest has the expected Recipe Box identity, standalone display mode, start URL, and valid 192px and 512px icons. | Playwright fetches and validates the manifest and both icon responses. |
| A root-scoped service worker registers where supported without blocking normal pages when unsupported or registration fails. | Browser tests inspect registration and exercise a rejected registration. |
| An offline launch at `/` shows only the most recently cached recipe titles and accessible links. Selecting one opens its readable static detail copy, with offline status and no remote image URL, scripts, or mutation controls. | Playwright signs in, opens seeded recipes, waits for capture, goes offline, opens `/`, selects a cached title, and checks content, semantics, keyboard/focus, contrast, axe, and overflow. |
| The cache retains no more than 10 recipes and evicts the least recently viewed; an online revisit replaces the prior snapshot. | Focused unit tests for deterministic cache selection/eviction plus browser coverage for recency. |
| An uncached recipe gets a generic offline response; online 401/404/410 responses are never replaced by stale private content. | Playwright checks generic copy without identifiers and controlled HTTP error cases. |
| Public recipe pages, authentication responses, API responses, and mutations are never stored in the private offline cache. Existing public `no-store` and lifecycle assertions remain passing. | Cache-key allow-list unit tests and public-route browser regression. |
| Sign-out waits for private cache deletion; after successful sign-out, the same URL cannot reveal the cached recipe offline. A storage deletion failure keeps the user signed in and reports an accessible retry state. | Playwright verifies purge-before-submit and offline denial; focused client tests cover deletion failure and retry. |
| Service-worker/cache failures do not block an online recipe view or sign-out. | Focused tests simulate unavailable APIs, failed registration, and failed snapshot writes. |
| No database migration, RLS change, public payload change, or hosted dependency is introduced. | Review migration/public projection diff and run the existing public recipe regression tests. |

## Manual verification

- In Chromium, confirm the browser offers installation for the local secure
  context and launches in standalone display mode after installation.
- On Slice 25 devices, verify browser-specific install steps on Android and
  iOS; do not claim automated desktop browser checks prove physical-device
  install behavior.

## Assumptions and decisions

- A limit of 10 is a bounded default for the otherwise unspecified phrase
  “recently viewed”; only the latest successful active recipe views count.
- Browser Cache Storage is local to this browser profile, not an account backup.
  Cache failure or eviction must degrade offline capability, never server
  authorization or online access.
- The offline index uses native document links so the service worker can serve
  a cached document; Next.js client-side soft-navigation retries do not provide
  persisted offline content by themselves.
