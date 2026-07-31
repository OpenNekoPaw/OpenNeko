## ADDED Requirements

### Requirement: Archived EPUB resources are ready before first render
The Preview Webview SHALL wait for the EPUB library's completed archive-resource projection before
rendering any chapter or reporting the EPUB Preview ready.

#### Scenario: Delayed archive resource projection
- **WHEN** EPUB metadata and spine parsing complete before archive image replacement URLs are ready
- **THEN** Preview SHALL retain its loading state and SHALL NOT render a chapter with unresolved archive-relative resource URLs

#### Scenario: First visible image chapter
- **WHEN** an image-based EPUB completes archive resource projection
- **THEN** the first visible chapter SHALL render with a browser-loadable projected image URL without requiring an unload, retry, mode switch, or later chapter reload

### Requirement: EPUB resource failures are visible
The Preview Webview SHALL distinguish successful image loading from failed image loading for an
attached visible chapter and SHALL NOT treat a broken image as successful resource settlement.

#### Scenario: Visible chapter image fails
- **WHEN** an image in the attached visible EPUB chapter emits an error or is complete without decoded dimensions
- **THEN** Preview SHALL display an explicit document diagnostic and SHALL NOT report the broken chapter as successfully settled

#### Scenario: Stale chapter settlement finishes
- **WHEN** asynchronous EPUB resource settlement completes after its chapter or book load epoch is no longer current
- **THEN** Preview SHALL ignore the stale result and SHALL NOT overwrite the current book state

### Requirement: Desktop EPUB Preview path is qualified
The EPUB readiness behavior SHALL be verified through the real Electron Desktop Preview path using
an isolated image-based EPUB fixture in addition to deterministic Webview tests.

#### Scenario: Large image-based EPUB opens in Desktop
- **WHEN** the isolated EPUB is opened through the Desktop Preview descriptor and Renderer source URL
- **THEN** the initial cover and first visible page SHALL load without a broken-image frame, console resource error, or delayed recovery render

#### Scenario: Legacy recovery is not required
- **WHEN** the Desktop EPUB Preview reaches its ready state
- **THEN** path-level evidence SHALL show that readiness preceded the first chapter render and that waterfall unload/reload did not repair an invalid initial render
