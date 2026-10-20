# DLC 06: Image framing and gallery

This brief extends Slice 12's private still-image workflow with crop/framing and
full-screen viewing. It does not change accepted image formats.

## Outcome

A person can choose how a recipe photo is framed and inspect it at a larger
size without losing the original asset or exposing private media.

## Scope

- Add a crop/framing interaction to recipe-photo management.
- Render framed photos consistently in private detail, public detail, and
  thumbnails, while preserving the original upload for future edits.
- Add a full-screen gallery with previous/next navigation, close, focus
  handling, keyboard support, and mobile touch gestures if validated.
- Preserve the existing private bucket, signed-URL boundary, quotas, and
  queued object cleanup.

## Decisions before implementation

- Choose whether framing is stored as crop coordinates, a focal point, or a
  generated derivative; prefer a reversible representation.
- Decide whether publication covers need the same editing affordance.
- Define whether public visitors can inspect the same gallery and whether
  print output omits photos (see DLC 08).

## Acceptance

- Crop changes are reversible and do not overwrite the uploaded original.
- Gallery open/close, navigation, focus restoration, Escape, and mobile layout
  work with keyboard, touch, and assistive technology.
- Private photos remain inaccessible to guests and deleted assets cannot be
  retrieved through stale framing metadata.
- Media unit, storage, quota, lifecycle, browser, public-access, and
  accessibility tests pass.

## References

- [Image pipeline](../12-images.md)
- [Public links](../22-public-links-and-privacy.md)
