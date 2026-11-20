# Purpose: Implement and verify DLC 43 Rating Labels and Detail Control

- [x] Review the slice prompt, DLC 43 brief, repository guidance, and worktree.
- [x] Compare the proposed contract with product docs and detail-action patterns.
- [x] Get approval of the labels, score meanings, and scope boundaries.
- [x] Reconcile authoritative Rating references and DLC 44 coordination.
- [x] Add focused fail-first UI, RPC, history, accessibility, and layout tests.
- [x] Implement the private detail control, owner RPC, artwork, error recovery,
  editor-score preservation, and private numeric output.
- [x] Run focused tests, typecheck, targeted lint, and desktop/mobile visual
  checks.
- [x] Run the production build; record focused and repository-wide lint
  results and update completion records.
- [x] Apply visual-review feedback: use 36px Lucide hand glyphs, center scores
  in their palms, and order Star, Heart, Rating, Share on desktop and Star,
  Heart, Rating, Duplicate on mobile.
- [x] Re-run focused Rating tests, typecheck, targeted lint, build, and visual
  checks at desktop and narrow-mobile sizes.
- [x] Apply the second visual review: use a splayed unrated hand and palm-down
  zero gesture, center scores in palm overlays, match Export line weight, and
  verify desktop and narrow-mobile renders.
- [x] Address the third visual review: soften the wave hand, vertically mirror
  the zero hand, center the full signed text run, and verify desktop/mobile
  screenshots and tests.
- [x] Route Rating feedback through the shared action-feedback region, verify
  save/conflict messages do not shift page content, and update the UI contract.
- [x] Apply the final glyph review: lighten the tone fill, fill the complete
  silhouette, replace the unrated gesture with a splayed open palm, and verify
  the glyphs at desktop and narrow-mobile sizes.
- [x] Keep the zero hand's continuous fill; use a yellow thumbs-up with `?`
  for the cleared recipe action, keep menu Clear text-only, and compact the
  picker to 5px horizontal item padding without wrapping labels.
- [x] Center the clear-glyph question mark in the palm and remove the clear
  hand's fill; update the Rating contract and verify the clear-state geometry.
- [x] Right-align shared Rating feedback below the action buttons and verify
  its compact placement on a narrow viewport.
- [x] Keep the mobile photo below clear-status text and remove the feedback
  background; verify the photo-to-text gap with a real uploaded test image.
- [x] Reduce the status-to-button gap to 4px while keeping the mobile photo
  just below the status text.
- [x] Dismiss successful Rating feedback after five seconds while keeping the
  status available to assistive technology; leave pending and error feedback
  visible.
- [x] Match positive and negative labels to their integer colors; right-align
  only the integers and keep labels centered with a visible gap.
- [x] Center Clear with the other labels, add a 10px desktop picker margin,
  preserve mobile centering, and verify compact geometry and colors.
- [x] Shift only `Needs work` slightly right and verify equal rendered gaps to
  `-1` and its selected checkmark.
