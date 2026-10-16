# Slice 12: Images

This brief defines image upload, processing, storage, display, and cleanup for
publication covers and recipe photos. It extends the existing private
`recipe-media` bucket; it does not add a public bucket.

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 12
- [First-draft specification](../first-draft-spec.md)
- [Comprehensive reference, § 2.3: Recipe photos](../comprehensive-reference.md#23-recipe-photos)
- [Comprehensive reference, § 6: Publications and the Recipe Tin](../comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin)
- [Comprehensive reference, § 9.4: Secure image delivery](../comprehensive-reference.md#94-secure-image-delivery)
- [Comprehensive reference, § 12: Change history](../comprehensive-reference.md#12-change-history-and-forensic-audit)
- [Comprehensive reference, § 13: Accessibility](../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
- [Comprehensive reference, § 16: Testability](../comprehensive-reference.md#16-testability-and-test-first-delivery)
- [Data model boundary](../data-model.md)
- [Visual design guide](../visual-design.md), including publication cover fallbacks
- [Decision log](../decision-log.md)
- [Supabase Storage buckets](https://supabase.com/docs/guides/storage/buckets)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Vercel Function limits](https://vercel.com/docs/functions/limitations)
- Installed Next.js Route Handler and Image guides under `node_modules/next/dist/docs/`

## Outcome

A signed-in owner can upload, view, reorder, choose a primary recipe photo,
replace or remove photos, and add or replace a publication cover from desktop
or mobile. The public bucket remains disabled. An eligible public recipe may
show its recipe photos only after the public-link authorization in Slice 22;
publication covers and private or trashed recipe photos are never public.

## Decisions

- Accept JPEG, PNG, WebP, and HEIC/HEIF still images. Multi-image HEIC files use
  the primary image. Reject SVG, GIF/animated media, unsupported formats, and
  files that do not decode as an accepted image.
- Limit each original upload to 20 MiB. Process accepted images to metadata-free
  WebP: a full-size image no larger than 2048 px on either edge and a 480 px
  thumbnail. Correct EXIF orientation before removing all source metadata.
- Enforce a 1 GiB per-account quota against the bytes of stored derivatives.
  Allow one cover per publication and at most 12 photos per recipe. The first
  recipe photo becomes primary. Changing primary or order is explicit.
- Publication cover management opens from the cover image and pencil inside
  the publication edit pane. It stages selection or removal until Submit;
  Cancel discards pending changes. The pane provides icon-only device
  selection and removal, plus a camera action on mobile. The publication detail
  page shows the cover without an edit trigger.
- In recipe edit mode, the action beside Name shows the primary photo in a
  contained thumbnail with a corner pencil, or a camera icon when no photo is
  available. It opens recipe photo management. Upload, removal, default
  selection, and ordering take effect immediately. Show a
  three-column photo grid on a 352px mobile viewport; with the pane's padding
  and horizontal and vertical space reserved for the overhanging remove
  controls, image slots are about 84px wide. The first photo is the default.
  Support two-dimensional dragging, keyboard focus, and Ctrl+Arrow ordering;
  keyboard moves retain focus on the moved photo for consecutive adjustments.
  During pointer drag, the selected image follows the pointer and the drop
  position is highlighted; on release, preserve the image's screen position
  while the optimistic order reflows, then settle it into place without a
  directional jump. Keep the new order visible until the server confirms it.
  Recipe photos are decorative and use empty alternative text; descriptions
  are not collected.
- Upload the original directly from the browser to a short-lived, signed path
  in private Supabase Storage. A small authenticated Next.js request reserves
  the upload; a server-only finalization request validates the stored bytes,
  decodes and normalizes them, records derivatives, and removes the staging
  object. Do not send image bytes through a Server Action or Vercel Function
  request body.
- Generate short-lived signed read URLs on the server after checking owner
  access. Public recipe media delivery is gated by the same active/public
  recipe check as the public page and is wired when Slice 22 adds that route.
- Removing an image removes its metadata and queues every stored object path
  for Storage API deletion. A protected cleanup handler retries failed deletes;
  permanent recipe/publication purge must queue associated objects before
  cascading metadata. Restore within the retention period restores attachments.
- Image changes are append-only parent history events. History records metadata
  and asset identifiers, never binary data or signed URLs.

## Scope

- Add owner-scoped media metadata and pending-storage-deletion records with
  constraints, RLS, indexes, and history coverage.
- Harden the existing bucket for the agreed upload size and remove any direct
  client upload path that would bypass reservation, file validation, or quota
  checks.
- Add upload reservation, direct signed upload, finalization, reorder/primary,
  delete, and queued-cleanup boundaries.
- Add desktop/mobile publication-cover and recipe-photo controls, signed image
  rendering, responsive thumbnails, decorative empty-alt photo handling, and
  empty/error states, while retaining the designed cover fallbacks.
- Add local test fixtures and focused unit, database/RLS, end-to-end, and
  accessibility coverage before the production implementation.

Public recipe routes, public allow-list expansion, image export/import, a
gallery/lightbox, cropping, video, and animated images remain out of scope.

## UI and interaction

- After publication creation, its cover image opens an image-management pane.
  Desktop edit shows a hover border and a lower-right pencil icon. The pane
  stages device selection or removal until Submit; Cancel discards changes.
  Its image, camera (mobile only), and remove actions are icons. Publication
  Explorer and detail use the actual cover when present; otherwise keep the
  existing Book and Magazine fallbacks and the Site globe. The remove control
  uses an inverted white-and-tomato treatment; device/camera actions share a
  toolbar row with Cancel and Submit aligned to the right.
- Recipe detail shows the first (default) photo centered before recipe content,
  preserving its aspect ratio and capped at 280px high on desktop, 240px on
  tablet, and 144px on narrow mobile; additional photos appear in square
  thumbnails. The edit action beside Name shows the primary
  photo contained in a compact thumbnail with a corner pencil, or a camera icon
  when no photo exists. It opens an image-management pane with an immediate
  device upload, `x`
  removal, and default photo ordering. There are three image slots per row on
  a 352px viewport, with two-dimensional drag and Ctrl+Arrow keyboard
  alternatives. The dragged image tracks the pointer and the destination is
  highlighted, and its new position remains visible while the server saves.
  A dashed Add photo tile sits at the end of the grid. On mobile, the camera
  trigger matches the Name field height; remove controls sit over the top-right
  image corner with enough grid spacing to avoid crowding or overflow. Progress
  appears right-aligned on the desktop heading row and opposite the photo count
  on mobile; Done remains in the bottom toolbar. On desktop, the camera action
  aligns to the right edge of the Name row.
- The recipe device picker uses the platform's ordinary `image/*` picker,
  without forcing camera capture, so mobile platforms can offer their native
  camera and library choices. Publication cover management exposes an explicit
  camera icon only on mobile.
- Both management panes accept image paste. Publication cover management
  provides an editable paste target with desktop keyboard and mobile
  tap-and-hold instructions. Recipe-photo management shows a non-interactive
  action status at the right of the desktop heading and a left-aligned
  Ctrl+V/Command+V instruction opposite the right-aligned photo count. On
  mobile, it provides an editable tap-and-hold paste target and keeps action
  status right-aligned opposite the left-aligned photo count. The editable
  paste targets are skipped during Tab navigation but remain clickable and
  touch-focusable.
  Canceling a device or camera picker leaves its management pane open. On
  opening, focus the pane heading rather than the paste target so no text
  cursor blinks until the user intentionally taps the target.
- Reserve image dimensions to avoid layout shift, use responsive sizing, and
  lazy-load non-primary images. Do not optimize signed private URLs through a
  Next image proxy that does not forward authorization.
- Controls retain the app's paper-and-ink design, visible focus, labels, and
  mobile hit areas. Upload and processing progress, validation failures, quota
  failures, and storage errors have explicit accessible status or alert text.

## Security and lifecycle

- Every upload request authenticates the user and validates that the recipe or
  publication is owned by that user and active. The client cannot choose an
  account ID, Storage path, asset status, MIME type, or stored byte count.
- Signed upload paths are generated server-side and scoped to the authenticated
  user's UUID and a server-generated asset ID. They are one-use and never
  overwrite an existing object.
- The bucket remains private and storage RLS remains owner-scoped. No public
  object URL or unverified `next/image` remote URL is rendered.
- A finalizer rechecks ownership, parent lifecycle, reservation state, content
  signature, decoded image format, dimensions, file-size limit, account quota,
  and image-count limit. Failures remove staged/partial derivatives or retain
  an explicit retryable cleanup record; they never report a successful save.
- Signed read URLs are generated only after authorization and expire promptly.
  Slice 22 must check the random public recipe ID, `is_private`, and trash/purge
  state before asking for a public recipe-image URL. Publication covers are
  owner-only.
- Trashing a parent hides its images while retaining them for restore. Purging
  a parent queues object deletion. A storage API failure leaves a durable queue
  row for a later retry.

## Test-first acceptance

Write failing automated coverage before implementation:

- Unit tests prove accepted/rejected file signatures and MIME combinations,
  EXIF orientation normalization, metadata removal, resize bounds, thumbnail
  generation, HEIC conversion, output-size accounting, and explicit image errors.
- Database tests prove owner isolation, active-parent and kind constraints,
  one cover per publication, one primary photo per recipe, the 12-photo and
  1-GiB limits under concurrent reservations/finalization, history events, and
  cleanup-queue preservation through parent purge.
- End-to-end tests upload a generated image, display and replace a publication
  cover, upload/reorder/promote/remove recipe photos, verify quota and invalid
  image errors, and prove a second account cannot read or mutate the assets.
- Mobile and desktop browser coverage proves that recipe uploads use the
  platform's ordinary image picker, publication covers expose an explicit
  camera action on mobile, canceling a picker leaves its pane open, there is no
  horizontal overflow, image dimensions remain stable, the recipe detail photo
  caps are 280px on desktop, 240px on tablet, and 144px on narrow mobile, and
  loading/error states are perceivable.
- Axe coverage proves the upload controls, gallery, primary selection, ordering,
  and removal controls are keyboard- and screen-reader-operable. Recipe photos
  are decorative; no description input is collected.

## Implementation status

The private upload/finalization pipeline, WebP processing, owner-scoped metadata,
quotas, photo and cover controls, signed rendering, deletion queue, daily Vercel
cron, and Chromium/Fold 6 workflows are implemented. The real CC0 HEIC fixture
in `tests/fixtures/media/` is tested through signature inspection, image
normalization, and the browser upload/finalization path; stored full-size and
thumbnail derivatives are verified as metadata-free WebP. A deterministic unit
test proves a failed Storage deletion increments the retry record and succeeds
on a later attempt. Browser and isolated database checks verify media visibility
across parent trash/restore and object queuing without retained history after
parent purge. All Slice 12 completion criteria are verified locally.

## Completion criteria

- Acceptance tests pass locally with the private Supabase bucket and no hosted
  account.
- HEIC/HEIF is converted into the same normalized output as supported raster
  formats; no upload retains EXIF or location metadata.
- Public access is not added before Slice 22; the signed-URL boundary is ready
  for that route and has owner/public authorization tests.
- Trash/restore retains image associations, purge queues object cleanup, and a
  failed Storage delete remains retryable.
- Update the [comprehensive reference](../comprehensive-reference.md), visual
  guide, decision log, README, and roadmap to reflect behavior actually
  implemented; defer any new decisions explicitly.
