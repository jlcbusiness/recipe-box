# DLC 48: Pre-Recipe Preparation Notes

**Status:** Draft candidate. Confirm visibility in public and document outputs
before implementation.

## Outcome

A recipe can call out work that must happen well before cooking begins, such as
marinating, freezing, or defrosting. The note appears before the ordinary
instructions and is visibly marked as advance preparation.

## Scope

- Add one optional recipe-level Markdown field for required advance
  preparation. It may contain a sentence, several paragraphs, or a short list;
  it is not a new ordered step type.
- Keep this content separate from Notes, which remains for gotchas, tweaks,
  variations, and observations.
- Display the note before regular instructions in recipe reading.
- Show a small “prep ahead” indicator near the recipe heading when the field is
  non-empty.

## Proposed behavior

- Label the field **Prep ahead** or **Before you start** in the editor; settle
  the final label during design.
- Render the content in a prominent callout with a heading, icon, and border.
  Do not rely on color alone.
- Render supported Markdown using the existing safe recipe Markdown behavior.
- Do not parse the text into durations or infer schedule dates. Recipe time
  entries continue to describe elapsed time; this note tells the cook that
  work must begin earlier.
- Preserve the value through recipe save, history, owner backups/imports, and
  public recipe copying if the owner chooses to publish it.

## Data and privacy boundary

- Store the note as an optional recipe field; old records and older bundles
  default it to empty.
- Treat the note as recipe instructions rather than private personal Notes.
  Public output includes it only when the recipe is published, following the
  existing publication privacy boundary.
- Confirm that imports, standalone output, offline snapshots, and
  public-copy allow-lists preserve it consistently.

## Acceptance criteria

1. Owners can create, edit, clear, and save the Markdown field without
   changing Notes or ordered instruction steps.
2. A non-empty note renders before the ordinary instructions with a visible
   text heading, icon, and border; it remains understandable without color.
3. The title indicator appears only when advance-prep content exists.
4. Old records and bundles remain valid with an empty value; current bundles
   round-trip the content without losing Markdown.
5. Tests cover save/history, private and public reader output, print/offline
   behavior, and import/export compatibility according to the final privacy
   decision.

## Open decisions

- Confirm whether published recipes, print/download, offline views, and public
  copies include this field. The proposed default is that recipe instructions
  follow the recipe's existing visibility and export rules.
- Choose the field label and the exact indicator near the recipe title.
- Confirm whether clearing the note removes the title indicator immediately
  after save.

## Initial sizing

Medium-high difficulty; about **3–5 days**; high churn. A small field touches
recipe persistence and multiple reader/output paths, plus bundle compatibility
and privacy tests.

## References

- [Recipe card and metadata reference](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Portable bundle format](../../import-export-format.md)
- [Data model](../../data-model.md)
- [Recipe form](../../../../src/app/recipes/recipe-form.tsx)
- [Recipe detail page](../../../../src/app/recipes/[id]/page.tsx)
