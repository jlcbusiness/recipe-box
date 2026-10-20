# DLC 21: App-controlled installation prompt

This brief evaluates an app-controlled installation prompt beyond the browser's
current installation UI. Browser policy determines whether this feature is
possible.

## Outcome

Where supported, a person can choose to install from a clear in-app control;
unsupported browsers retain their native installation path without a broken
button.

## Scope

- Verify current installability requirements and browser-specific prompt APIs.
- Show the control only when the browser reports a usable install opportunity.
- Explain installation through the control's accessible name and concise
  status, not a permanent feature banner.
- Handle acceptance, dismissal, repeated prompts, and installed state.
- Avoid collecting installation telemetry beyond approved product needs.

## Decisions before implementation

- Confirm supported browsers and any cooldown after dismissal.
- Decide whether the native browser UI is sufficient and whether the app-level
  control adds measurable value.
- Do not promise a prompt on platforms that prohibit or do not expose one.

## Acceptance

- Supported, unsupported, dismissed, accepted, and already-installed states
  have deterministic tests.
- The app never prompts repeatedly or obscures normal navigation.
- Keyboard, screen-reader, mobile, and browser-policy behavior are verified.

## References

- [Install and offline](../24-install-and-offline.md)
