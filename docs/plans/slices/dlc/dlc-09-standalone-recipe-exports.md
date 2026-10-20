# DLC 09: Standalone recipe exports

This brief adds portable, human-readable recipe exports beyond database and
recipe ZIP bundles. It depends on the presentation contract in DLC 08.

## Outcome

A person can export one recipe as an HTML document, a PNG image, or an
application-generated PDF with the selected recipe presentation.

## Scope

- Add HTML export with readable structure, embedded or safely referenced
  resources, and no application session dependency.
- Add PNG export of the agreed recipe view at a useful resolution.
- Add generated PDF export with the page orientation and media rules from DLC 08.
- Preserve the public/private allow-list: private exports require an owner
  session and are never written to a public location.
- Provide clear progress, failure, cancellation, and download filenames.

## Decisions before implementation

- Choose whether PNG/PDF rendering happens in the browser or a trusted server
  process after verifying runtime and resource limits.
- Define image inclusion, font handling, links, and export fidelity.
- Decide whether exports use active scale/unit presentation or a canonical
  unscaled recipe.
- Keep forensic history out of this feature; see DLC 19.

## Acceptance

- HTML is self-contained enough to open offline and contains semantic headings,
  ingredient lists, and ordered instructions.
- PNG and PDF exports render the selected scope without clipping or missing
  characters; PDF page size and orientation are asserted.
- Export failures do not report success or leave untracked server artifacts.
- Unit, browser, accessibility, and private-data authorization tests pass.

## References

- [ZIP export](../20-export.md)
- [Import/export format](../../import-export-format.md)
