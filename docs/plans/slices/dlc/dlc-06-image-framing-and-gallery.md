# DLC 06: Image framing and gallery

This brief extends Slice 12's private still-image workflow with optional,
reversible framing for recipe photos and publication covers. It does not
change accepted image formats or replace uploaded image bytes.

## Status

Approved scope: Fit/contain remains the default. Only an explicitly saved crop
changes display framing. The uncropped source appears only in the framing
editor.

## Outcome

An owner can set and reset how recipe photos and publication covers appear.
Every display uses saved framing; the complete image is shown by default and
the uncropped source is shown only in the framing editor.

## Scope

- Add an accessible crop editor for recipe photos and publication covers.
- Persist reversible framing per asset and apply it wherever recipe photos or
  publication covers appear, including private/public views and thumbnails.
- Keep the existing single-image viewer and its close behavior; show the saved
  framing there without adding gallery navigation.
- Keep the private bucket, signed-URL boundary, quotas, upload processing,
  trash/purge lifecycle, and queued object cleanup unchanged.

## Accepted behavior

- An asset without saved framing uses Fit/contain and shows the whole source.
  Do not crop automatically or use Fill. Existing display behavior is
  unchanged until the owner explicitly saves a crop.
- Store nullable normalized crop coordinates on each ready media asset. Null
  means the full image. Framing changes presentation metadata only and never
  replaces the stored full-size WebP or thumbnail. The original is displayed
  only in the framing editor. Each asset is framed independently.
- Offer Free, Original, Square, 4:3, 3:2, 16:9, and 9:16 aspect ratios using
  the shared mobile-safe Picklist. Common ratio labels and orientation follow
  the active crop frame; Original follows the rotated source image. Support
  a crop canvas fitted to the viewport that rotates with the source, crop-frame
  adjustment, one-finger image panning inside the frame, touch pinch zoom, and
  desktop wheel zoom.
  Provide a single counterclockwise 90-degree rotation action and
  keyboard-operable ratio, rotation, and reset controls without visible
  control headings. The ratio picker omits its selection checkmark, and the
  rotation control has no numeric degree readout. At narrow mobile widths, keep
  the ratio picker, rotation control, and Reset/Cancel/Apply actions on one
  compact row when space permits; wrap only when the available width requires
  it.
- Recipe framing is staged in the crop editor; Apply saves to the active asset,
  Cancel discards, and Reset stages the full-image Fit presentation. Cover
  framing is staged with the existing cover manager and commits on Submit;
  Cancel discards it. Failures retain the draft and announce an error.
- Apply framing to every display of recipe photos and covers, including
  instruction references, public recipe views, and Explorer thumbnails.
  Preserve the saved crop's aspect ratio within each display's bounds; fixed-size
  square thumbnail viewports may letterbox the crop but must not stretch it.
  Public authorization and publication-cover privacy remain unchanged. Print
  behavior remains governed by DLC 08; any printed image uses its saved framing.
- The current single-image viewer retains its existing open/close behavior. It
  shows the saved framing, never the uncropped source, and gains no gallery
  navigation. Fine-grained rotation, straightening, filters, and destructive
  edits are out of scope.

## Research

Apple's iPhone Photos guide documents crop adjustment, pinch resizing, aspect
ratio presets, and edit confirmation. Google Photos on Pixel documents crop
border adjustment and saving edits or a copy. Neither platform guide specifies
the one-finger image-pan gesture used here; that is an adaptation for the web
editor.

React Advanced Cropper 0.20.1 provides a resizable rectangular stencil,
fixed-aspect-ratio controls, touch support, zoom and movement, and source
coordinates without requiring generated image bytes. Its maintainers identify
the API as beta and recommend pinning the package version.

## Data, security, and failure boundaries

- Add nullable normalized crop coordinates through a forward migration. All
  values are null or all are present, finite, within image bounds, and have
  positive width and height. Ready recipe photos and covers may be framed;
  pending uploads cannot.
- Crop updates are authenticated, owner-authorized, and version-checked against
  the active parent. They append the existing recipe-photo or publication-cover
  history event, including before/after framing. They do not upload bytes,
  alter quota accounting, or create Storage objects.
- Extend explicit media export/import field allow-lists so framing round-trips
  with a photo. Invalid crop metadata rejects the bundle before applying any
  records. Public projections include framing only after the existing public
  ID, privacy, and active-lifecycle checks.
- Keep recipe-photo RLS and signed URL checks unchanged. Removed or purged
  assets cannot be addressed by stale crop metadata; no general public bucket
  or image URL is introduced.

## Acceptance and automated coverage

 Unit tests verify crop-coordinate bounds, quarter-turn values, display
 geometry, orientation-aware ratio presets, zoom/pan limits, Fit defaults,
 and malformed-value rejection.
 Migration/API tests verify existing assets default to Fit; only owners can
  update active recipe photos or covers; invalid coordinates, wrong media
  kinds, and stale versions are rejected; successful updates record
  before/after framing in the correct history stream.
 Export/import tests verify rotation-aware framing round-trips in bundle
 version 5, version 4 framing imports at 0 degrees, versions 1-3 import
 without framing, and malformed framing fails before database changes.
 Browser tests verify recipe and cover crop preview, Apply/Submit, Cancel,
  Reset, save failure, and framing independence from photo default/order. They
  verify saved framing at private/public detail, instruction images, Explorer
  thumbnails, and publication views, while the source appears only in the
  framing editor.
The user reports pinch, spread, and pan passed on mobile devices. A Fold 6
Playwright test dispatches touch input and verifies that one-finger panning
changes image position and two-finger pinch increases image scale. Keyboard
tests verify ratio selection, rotation, visible focus, dialog dismissal, and
focus return.
Accessibility checks cover labels, keyboard operation, status/error
announcements, dialog dismissal, and control contrast. Existing viewer tests
verify saved framing without gallery navigation.
Run focused media unit/API tests, media browser tests on Chromium and Fold 6,
TypeScript, targeted Biome, Markdown lint for changed files, and
`git diff --check`. Geometry, state, privacy, accessibility, and saved display
behavior are covered by automated tests. The user reports completing the
physical iPhone and Android checks with wide, tall, and square images
successfully.

## Dependencies and patterns to preserve

- [Slice 12 image pipeline](../12-images.md): private signed uploads, WebP
  derivatives, per-account quota, and durable cleanup.
- [Slice 22 public links](../22-public-links-and-privacy.md): public recipe
  media is signed only after access and lifecycle checks.
- [DLC 05 instruction authoring](dlc-05-instruction-authoring-and-references.md):
  stable photo references and authored inline width remain unchanged.
- Reuse `MediaManager`, `RecipePhotoGallery`, and `ImageViewer` rather than
  creating parallel image-management and viewer systems.
- Pin [React Advanced Cropper 0.20.1](https://github.com/advanced-cropper/react-advanced-cropper)
  while its API remains beta.

## Decisions recorded

The accepted framing, viewer, mobile interaction, data model, and bundle v5
choices are recorded in `decision-log.md`, the comprehensive reference, data
model, portable bundle format, DLC roadmap, and visual guide. Keep this brief as
the implementation boundary; update its acceptance status only after all
automated and physical-device checks pass.

## References

- [Delivery roadmap, DLC ordering](README.md)
- [Image pipeline](../12-images.md)
- [Comprehensive reference, recipe photos](../../comprehensive-reference.md#23-recipe-photos)
- [Comprehensive reference, secure image delivery](../../comprehensive-reference.md#94-secure-image-delivery)
- [Data model boundary](../../data-model.md)
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide, recipe photos](../../visual-design.md)
- [Decision log](../../decision-log.md)
- [Public links](../22-public-links-and-privacy.md)
- [Apple iPhone Photos crop guide](https://support.apple.com/guide/iphone/crop-rotate-flip-straighten-photos-videos-iph0f3ebb1dd/ios)
- [Google Photos on Pixel crop guide](https://support.google.com/photos/answer/9940184?hl=en)
- [React Advanced Cropper API](https://advanced-cropper.github.io/react-advanced-cropper/docs/components/Cropper)
