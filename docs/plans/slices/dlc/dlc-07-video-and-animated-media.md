# DLC 07: Video and animated media

This brief evaluates and, if feasible, extends the private media pipeline to
video and animated image assets. It depends on the media security work in DLC 06.

## Outcome

A person can attach supported motion media to a recipe and view it through the
same owner-checked lifecycle as recipe photos.

## Scope

- Add explicit format, byte-size, duration, dimensions, and per-recipe limits.
- Validate decoded content server-side; do not trust file names or browser MIME
  types.
- Keep objects private and use authenticated or public-link-authorized
  delivery, with no public Storage bucket.
- Provide accessible playback controls, reduced-motion handling, and a static
  fallback where appropriate.
- Include assets in cleanup, export/import, trash/restore, and quota accounting.

## Decisions before implementation

- Run a technical proof for supported codecs, transcoding, hosting limits,
  browser compatibility, and storage cost before choosing formats.
- Decide whether animated images are converted to video or retained in their
  original format.
- Set limits only after verifying current platform constraints and abuse risk.
- Defer if secure validation and predictable delivery cannot be guaranteed.

## Acceptance

- Unsupported, malformed, oversized, and over-duration media is rejected with
  a useful accessible error.
- Cross-account and private/public authorization tests cover every media route.
- Playback remains usable on supported mobile and desktop browsers without
  automatic sound or unbounded downloads.
- Cleanup, trash/restore, export/import, quota, and accessibility tests pass.

## References

- [Image pipeline](../12-images.md)
- [Public links](../22-public-links-and-privacy.md)
- [DLC brainstorm](../../discussion/dlc.md)
