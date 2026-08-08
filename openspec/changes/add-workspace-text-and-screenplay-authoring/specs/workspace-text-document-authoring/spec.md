## ADDED Requirements

### Requirement: Workspace text editing uses one authorized document authority

The system SHALL admit only the declared bounded UTF-8 workspace text formats and SHALL open each
exact Window + Workspace + ContentLocator through one package-owned `TextDocumentSession`. Workspace
file bytes SHALL remain authoritative, and every read and save MUST use the canonical
`@neko/content` authorization and fingerprint path.

#### Scenario: User opens an admitted text file

- **WHEN** Resource Browser submits an exact open request for an admitted UTF-8 workspace text file
- **THEN** Host authorizes the locator and creates or focuses one Text Document session for that exact document
- **AND** neither Resource Browser nor the renderer reads an absolute path or owns workspace bytes

#### Scenario: User opens the same document again

- **WHEN** the same exact text document already has a session and View in the Window
- **THEN** Desktop focuses that View and returns its current session projection
- **AND** it does not create a second dirty buffer, writer or document authority

#### Scenario: File is not safe to edit

- **WHEN** a file is invalid UTF-8, exceeds the editor admission limit or has unsupported mixed line endings
- **THEN** Text Editor rejects editing with a typed diagnostic while preserving the original bytes
- **AND** the user may explicitly open the independent read-only Preview without an automatic fallback

### Requirement: Text edits are revisioned and atomic

Every edit command SHALL carry exact project, workspace, document, session and request identities plus
the expected document edit sequence. The session SHALL apply only ordered, non-overlapping in-bounds
changes to the observed source and SHALL publish one new immutable projection for an accepted
command.

#### Scenario: Renderer submits an accepted edit

- **WHEN** an edit references the current session edit sequence and valid source ranges
- **THEN** the session applies all changes atomically, increments its concurrency edit sequence and marks the document dirty
- **AND** diagnostics and format projections are associated with the accepted source only

#### Scenario: A stale edit arrives

- **WHEN** an edit carries a stale edit sequence, mismatched identity, reused request identity or invalid range
- **THEN** the owning session rejects only that command with a typed diagnostic
- **AND** it does not retry against current text, switch documents or partially apply changes

#### Scenario: Undo or redo changes source

- **WHEN** the user invokes CodeMirror undo or redo
- **THEN** the resulting source transaction enters the same revisioned edit command path
- **AND** no renderer-only working copy bypasses the session authority

### Requirement: Save preserves user bytes and rejects external conflicts

Save SHALL encode the accepted working source with the loaded UTF-8 BOM and LF/CRLF convention and
SHALL publish atomically with the loaded Content fingerprint. Save MUST NOT format, normalize,
overwrite externally changed bytes or clear dirty state for an unsaved later edit sequence.

#### Scenario: User saves the current edit sequence

- **WHEN** the current working source is dirty and the file fingerprint still matches the loaded base
- **THEN** the authorized writer atomically replaces the file and returns the new fingerprint
- **AND** the session clears dirty state only if no later edit sequence remains unsaved

#### Scenario: Workspace file changed externally

- **WHEN** save detects a changed or conflicting fingerprint
- **THEN** the working buffer remains intact and the View displays explicit Reload and Keep Editing actions
- **AND** no force-write, automatic merge, stale cache or alternate writer reports success

#### Scenario: User reloads a dirty conflict

- **WHEN** the user explicitly confirms Reload for a dirty conflicted session
- **THEN** the session performs one fresh authorized read and replaces the working buffer and base fingerprint
- **AND** cancelling the confirmation preserves the dirty buffer unchanged

### Requirement: Text modes provide bounded format-specific behavior

The Text Editor SHALL select exactly one declared mode from the admitted file extension. Markdown
SHALL provide source editing and safe normalized preview; JSON SHALL provide syntax highlighting,
parse diagnostics and explicit deterministic formatting; Fountain SHALL delegate all semantics to
the screenplay owner; every other admitted text extension SHALL use plain-text editing.

#### Scenario: User previews Markdown

- **WHEN** an admitted Markdown document is in Preview or Split mode
- **THEN** the editor renders the accepted source through `@neko/markdown` and the shared safe Markdown presentation
- **AND** parse or resource diagnostics do not mutate the Markdown source or introduce another parser

#### Scenario: User formats valid JSON

- **WHEN** the user explicitly invokes Format on syntactically valid JSON
- **THEN** the editor produces a deterministic two-space full-document edit through the revisioned command path
- **AND** formatting does not save the document implicitly

#### Scenario: User formats invalid JSON

- **WHEN** the user invokes Format while JSON parsing has a syntax error
- **THEN** the editor preserves the source and focuses a localized parse diagnostic
- **AND** it does not guess, repair or replace the invalid JSON

#### Scenario: User opens another admitted text format

- **WHEN** the extension is in the admitted text allowlist but has no semantic adapter
- **THEN** the editor uses the declared plain-text mode with editing, selection and save
- **AND** no wildcard renderer, guessed language or Markdown fallback claims semantic support

### Requirement: Text Editor integrates as one canonical Workbench View

The canonical Workbench View union SHALL include `text-editor` with exact project, workspace,
document, session, View and View-instance identities. Resource Browser SHALL route the default open
intent for admitted editable text to that View, replacing the previous text-to-Preview default path.

#### Scenario: User opens text from Resource Browser

- **WHEN** Resource Browser projects `edit-text` for an admitted file and the user activates Open
- **THEN** Desktop opens or focuses the canonical Text Editor Main View
- **AND** the old default Preview handler and any alternate editor registry do not participate

#### Scenario: User opens another text document to the side

- **WHEN** the user explicitly side-opens a different admitted text document
- **THEN** Workbench uses the existing bounded Secondary Main group with an independent exact document session
- **AND** it does not exceed the canonical split limit or copy source between sessions

#### Scenario: A non-canonical editor View is restored

- **WHEN** persisted Workbench state contains an unknown editor kind or mismatched editor identities
- **THEN** only that Workbench instance reports an invalid-layout diagnostic while stored bytes remain unchanged
- **AND** sibling Workspaces and capabilities remain available without conversion or fallback registration

### Requirement: Dirty data and presentation have separate lifecycles

A dirty Text Document session SHALL survive its React Root unmount and SHALL block View, Window or
application close until the user chooses Save, Discard or Cancel. Clean invisible sessions SHALL be
releasable and reconstructable from the exact authorized locator. Presentation snapshots SHALL
contain only recoverable View state and MUST NOT contain file bytes or durable facts.

#### Scenario: User switches away from the Workspace scene

- **WHEN** a Text Editor Root with accepted dirty changes becomes invisible
- **THEN** Desktop unmounts the Root but preserves the exact dirty document session
- **AND** returning to the View reconstructs presentation from that session without a hidden React tree

#### Scenario: User closes a dirty View

- **WHEN** the user closes a View whose session is dirty
- **THEN** the exact session presents Save, Discard and Cancel choices and honors the selected outcome
- **AND** active, recent or first document identity cannot substitute for the closing session

#### Scenario: Presentation snapshot is invalid

- **WHEN** cursor, scroll, mode or split snapshot data cannot be validated
- **THEN** only that View resets to the canonical fresh presentation and emits a diagnostic
- **AND** its file bytes, dirty session and sibling Views remain unchanged

### Requirement: Renderer and Desktop boundaries remain typed and fail closed

Renderer/Webview code MUST NOT access Node, Electron or raw workspace paths. Every Desktop command
and subscription SHALL be sender-bound and carry exact Window, Workspace, View, session,
renderer-session and request identity; contract failure SHALL be isolated to the current operation or
session.

#### Scenario: Unauthorized sender requests a write

- **WHEN** a sender is not bound to the supplied Window, Workspace, View or editor session
- **THEN** Desktop rejects that request before invoking the authoring port or Content writer
- **AND** unrelated Views and Workspaces remain usable

#### Scenario: Renderer restarts

- **WHEN** a renderer reconnects with a new renderer-session identity
- **THEN** it requests the exact editor-session projection and Desktop revokes the prior attachment
- **AND** it does not attach to an active or recent document or accept messages from the old sender binding

### Requirement: Editing controls are localized, accessible and IME safe

Editor commands, diagnostics and accessibility labels SHALL use package-owned `en` and `zh-cn`
bundles, with domain diagnostics expressed as stable codes and parameters. IME composition SHALL
preserve the composing range and SHALL defer completion, formatting and semantic replacement until
composition ends.

#### Scenario: User enters Chinese with an IME

- **WHEN** the user composes and commits Chinese text in CodeMirror
- **THEN** the editor preserves the composition, commits one accepted edit and refreshes diagnostics afterward
- **AND** completion or formatting does not replace or duplicate the composing text

#### Scenario: Locale changes while the editor is open

- **WHEN** Desktop changes between supported English and Simplified Chinese locales
- **THEN** command labels, tooltips, diagnostics and accessibility names update without reloading or rewriting the document
- **AND** source language and editor locale remain independent

### Requirement: External content authoring remains file-native

The text-document owner SHALL expose one host-neutral open, project, apply-edits, save and close port
for the exact Window editor lifecycle. Agent content authoring MUST NOT consume that port or create an
Agent-owned Text Document session; it changes the authoritative Workspace file through the separately
authorized native file path.

#### Scenario: Agent changes a clean open content file

- **WHEN** an Agent-native write changes the exact Workspace file observed by a clean Text Document session
- **THEN** the editor handles it through the canonical external-file change policy
- **AND** no Agent editor session, format-specific mutation Tool or second writer is created

#### Scenario: Agent changes a dirty open content file

- **WHEN** an Agent-native write changes the exact Workspace file while the Window session is dirty
- **THEN** the Window session preserves its accepted buffer and reports an external-change conflict
- **AND** it does not merge, overwrite or transfer the dirty buffer to the Agent
