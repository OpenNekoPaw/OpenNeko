## MODIFIED Requirements

### Requirement: Progressive layout remains usable

The EPUB waterfall preview SHALL assign stable estimated heights to unloaded chapters and SHALL update chapter height and document page metrics only from chapters that actually render. Opening the book SHALL read only the ZIP directory plus required container, package, navigation and spine metadata entries; it MUST NOT read the complete authorized ZIP binary before first content.

#### Scenario: A loaded chapter settles images and styles

- **WHEN** a visible chapter's resources finish loading
- **THEN** the Preview replaces that chapter's estimate with its measured height and updates scroll/page metrics without re-rendering sibling placeholders

#### Scenario: Archive metadata becomes ready

- **WHEN** the package-owned archive source exposes the exact entry allowlist and epub.js loads required book metadata
- **THEN** Preview can present the first chapter without receiving the complete ZIP binary
- **AND** unopened chapter and asset entries remain unread and un-decompressed

## ADDED Requirements

### Requirement: EPUB content bytes follow visible demand

EPUB chapter markup, stylesheets, images, fonts, audio and video SHALL be read only when the current rendition, viewport neighborhood or explicit bounded navigation target references their exact archive entries. Leaving the retained chapter neighborhood SHALL release chapter DOM and transient object/media resources without deleting the source or reading replacement chapters.

#### Scenario: First chapter is visible

- **WHEN** a multi-chapter EPUB opens at its first chapter
- **THEN** request evidence contains required metadata plus the first chapter and its referenced resources
- **AND** a poisoned distant chapter entry remains untouched

#### Scenario: User navigates to a distant chapter

- **WHEN** the user explicitly navigates outside the loaded neighborhood
- **THEN** Preview reads the target and bounded adjacent content through exact entry paths
- **AND** unrelated spine entries remain unread
