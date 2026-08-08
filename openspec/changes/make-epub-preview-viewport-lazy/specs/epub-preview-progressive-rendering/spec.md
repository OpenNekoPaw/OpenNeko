## ADDED Requirements

### Requirement: EPUB waterfall renders only viewport-relevant chapters

The EPUB waterfall preview SHALL render chapter content only when a chapter intersects the configured viewport neighborhood or is explicitly targeted by navigation. It MUST NOT iterate through the complete spine to render or measure unopened chapters after initial readiness.

#### Scenario: Book becomes ready

- **WHEN** epub.js finishes opening metadata for a multi-chapter book in waterfall mode
- **THEN** the Preview removes its loading overlay without sequentially rendering every spine section
- **AND** unopened chapters remain estimated placeholders without loaded chapter DOM

#### Scenario: Chapter approaches the viewport

- **WHEN** a chapter enters the IntersectionObserver preload margin
- **THEN** the Preview renders that chapter through the canonical chapter loader and settles its local height
- **AND** chapters leaving the retained margin release their content while preserving measured placeholder height

### Requirement: EPUB navigation uses bounded prefetch

The EPUB waterfall preview SHALL prefetch only a fixed-size neighborhood around an explicitly targeted chapter and SHALL preserve navigation when the target was not previously rendered.

#### Scenario: User navigates to a distant chapter

- **WHEN** the user or Host selects a chapter outside the loaded viewport neighborhood
- **THEN** the Preview loads the target and bounded adjacent chapters, scrolls to the estimated target position, and corrects once the target layout is available
- **AND** unrelated spine sections remain unloaded

### Requirement: Progressive layout remains usable

The EPUB waterfall preview SHALL assign stable estimated heights to unloaded chapters and SHALL update chapter height and document page metrics only from chapters that actually render.

#### Scenario: A loaded chapter settles images and styles

- **WHEN** a visible chapter's resources finish loading
- **THEN** the Preview replaces that chapter's estimate with its measured height and updates scroll/page metrics without re-rendering sibling placeholders

#### Scenario: Book metadata and content are requested from a virtual directory

- **WHEN** epub.js opens the authorized EPUB source
- **THEN** the Preview requests the container, package metadata and viewport-relevant content as exact virtual-directory entries
- **AND** it MUST NOT request or receive the complete ZIP archive binary
