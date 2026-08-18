## MODIFIED Requirements

### Requirement: Content references preserve one user-visible message and one deterministic processing route

The Agent application SHALL preserve the original user text and locator-backed reference metadata as
the durable transcript presentation while preparing a separate transient provider prompt. Textual
formats SHALL be read directly through the bounded Agent content runtime; structured documents,
images, audio, video and unknown binary content SHALL use exactly the capability selected for their
content class and current Turn policy.

#### Scenario: Textual creative source is referenced

- **WHEN** a user references UTF-8 text, Markdown, Fountain, JSON, YAML or HTML content
- **THEN** Agent reads the bounded text directly and injects it only into the current provider request without requiring `ReadDocument` or persisting extracted text

#### Scenario: Structured or binary content is referenced

- **WHEN** a user references a supported structured document, image, audio or video
- **THEN** Agent preserves the locator and uses only the exact registered document, native multimodal or perception capability selected before execution, with no provider, reader or source fallback

#### Scenario: Pi reads a semantic document range

- **WHEN** Pi selects a locator from a `ReadDocument` manifest and requests range mode
- **THEN** the model-visible Tool contract accepts only the returned `unit_ref` and optional bounded read limit
- **AND** a ContentLocator, DocumentLocator, nested locator object or another undeclared field is rejected with an exact corrective diagnostic and is not interpreted through an alias or alternate reader

#### Scenario: ReadImage returns native image content to Pi

- **WHEN** `ReadImage` successfully reads one or more exact content or representation locators in a Workspace Turn
- **THEN** the Workspace Agent runtime uses its canonical content access authority to project bounded image payloads into the same Pi Tool result and the next reasoning step
- **AND** Desktop does not inject a private file loader and Pi does not read raw paths, cache paths or locator URIs as an alternate source

#### Scenario: ReadImage result cannot be materialized

- **WHEN** an attachment lacks an exact locator, content access rejects it, the bytes are not an image, or the provider transport budget is exceeded
- **THEN** only the exact Tool/Turn fails visibly and no URI, source, provider, reader or sibling attachment is used as fallback success

#### Scenario: Model calls content Tools with Conversation-scoped references

- **WHEN** the model calls `ReadDocument` or `ReadImage` for authorized input or a prior document result
- **THEN** it supplies only `input_ref`, `unit_ref`, `cursor_ref` or `image_ref` strings issued in the exact Conversation
- **AND** Agent resolves those references to canonical locators inside the application boundary without asking the model to copy fingerprints, locator unions, entry paths or representation specs

#### Scenario: Model submits a stale or cross-Conversation reference

- **WHEN** a Tool call supplies an unknown, stale, cross-owner or cross-Conversation short reference
- **THEN** only that Tool call fails with an exact reference diagnostic and the UI, sibling Tool results, Conversations and Workspaces remain available

#### Scenario: Document image batch is bounded before provider delivery

- **WHEN** document analysis needs image evidence from more than five pages or entries
- **THEN** Agent requires a selected batch of at most five `image_ref` values and Host projects bounded overview or detail payloads using image normalization or contact sheets
- **AND** it never sends more than five source images or an unbounded document payload in one provider continuation

#### Scenario: Referenced content has no valid processing capability

- **WHEN** an unknown binary, invalid UTF-8 source or unsupported media reference cannot use the selected Turn capability
- **THEN** only the exact Turn fails with a visible diagnostic, its activity reaches a terminal state, and sibling Conversations and Surfaces remain available

#### Scenario: Model discovers a Workspace directory before reading text

- **WHEN** a Workspace Conversation calls `ListDirectory` with a Workspace-relative directory path
- **THEN** the Core Tool returns a bounded single-level structured catalog backed by authorized `workspace-file` locators and no absolute path or shell output
- **AND** the listing may follow a readable symbolic link reached through that path, while returning only the submitted canonical Workspace path and child entry names
- **AND** Pi projects a text entry as `workspace_path` so the model can call the basic `Read` Tool without constructing a locator

#### Scenario: Directory entry requires a content capability

- **WHEN** the same directory contains a structured document, image, audio, video, protected project file or unsupported binary
- **THEN** Pi projects only the exact `input_ref`, `image_ref`, owning-domain route or unavailable diagnostic selected for that class
- **AND** it does not expose a basic text path for known non-text content, call `Read` as a format probe, or switch reader, Tool, provider or source after failure

#### Scenario: Directory traversal follows a readable symlink

- **WHEN** `ListDirectory` targets a readable symlink or a descendant whose real path leaves the Workspace root
- **THEN** only that listing is authorized by the read/list policy and the bounded target catalog is returned without any physical target path
- **AND** linked Media Library discovery remains owned by its existing Assets contributor rather than an ordinary file-walker fallback

#### Scenario: Directory traversal cannot be read

- **WHEN** `ListDirectory` targets a broken, looping, or unreadable symlink
- **THEN** only that listing is rejected with a visible diagnostic before or during enumeration and no physical target path or child entry is projected

#### Scenario: Basic Read receives non-text bytes

- **WHEN** `Read` is called directly with a known non-text format, oversized file, invalid UTF-8 bytes or NUL-containing content
- **THEN** that Tool Call fails with an exact text-boundary diagnostic before returning content
- **AND** valid sibling files, Tool calls, Conversations and the Agent Surface remain available

#### Scenario: Referenced message is projected or reopened

- **WHEN** a Turn used transient extracted text, native image bytes or an internal locator instruction
- **THEN** the transcript displays one user message containing the original text and structured reference token, and does not display a duplicate provider prompt or internal `Attached Context`/`ContentLocator` text
