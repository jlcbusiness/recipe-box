# DLC 05: Instruction authoring and references

This brief extends the existing instruction editor with recipe gallery photos
embedded directly in steps and readable emphasis. Ingredient set identity is
defined in DLC 03 and amount references in DLC 04.

## Outcome

Authors can insert selected recipe gallery images directly into instruction
steps. Readers see the actual image in context, alongside temperature and
duration emphasis that preserves the underlying readable text.

## Scope

- Let an author choose an existing gallery image and insert it into a specific
  instruction step as image content, not as a text link or mention token.
- Persist a stable media-asset reference in the instruction document and render
  the actual image in private, public, and approved exported views.
- Define behavior when a referenced image is removed, replaced, or no longer
  available; do not expose Storage paths or long-lived signed URLs in content.
- Highlight recognizable temperatures and durations in reader output while
  preserving the stored Markdown and copyable plain-text meaning.
- Review whether any instruction-step sorting control beyond manual reorder is
  needed; include it only with a concrete user workflow.
- Preserve behavior in private, public, print, offline, history, and bundle
  representations.

## Decisions before implementation

- Decide whether inserted images are inline, block-level, or both, and how
  captions, ordering, and responsive sizing work.
- Decide whether one gallery image may appear in multiple steps and how authors
  remove an embedded image without deleting the gallery asset.
- Define which temperature units and duration formats are recognized; avoid
  modifying text the parser cannot confidently classify.
- Decide whether formatting is automatic or explicitly marked by the author.
- Do not add a second editor toolbar unless research shows it is necessary.

## Acceptance

- Authors can insert and remove actual gallery images in steps by keyboard and
  touch; the image remains a gallery asset, not a duplicated upload.
- Private/public authorization is checked when resolving media. Missing or
  deleted assets have a clear fallback and never leak private URLs.
- Highlighting preserves exact source text and has no false semantic
  accessibility announcements.
- Tests verify image persistence, step ordering, private/public rendering,
  deletion fallback, print behavior, offline behavior, and access control.
- Unit, editor, private/public browser, print, offline, and security tests pass.

## References

- [Instruction editor](../7-instructions-and-mentions.md)
- [Image pipeline](../12-images.md)
- [DLC brainstorm](../../discussion/dlc.md)
