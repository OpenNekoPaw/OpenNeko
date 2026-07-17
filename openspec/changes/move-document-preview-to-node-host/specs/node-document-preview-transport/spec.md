## ADDED Requirements

### Requirement: Node exclusively owns document preview access

The Preview Extension Host MUST be the only runtime that registers and serves PDF, EPUB, DOCX, and CBZ preview content. Document preview requests MUST NOT start, register with, unregister from, or fall back to the Rust Engine.

#### Scenario: Open a document with the media Engine stopped

- **WHEN** a user opens a supported PDF, EPUB, DOCX, or CBZ document
- **THEN** the Preview Node host serves the document without invoking `neko.engine.ensureFrameServer` or `EngineClient`

#### Scenario: Node document transport fails

- **WHEN** the Node document server cannot register or serve a document
- **THEN** the provider displays a visible diagnostic and does not retry through an Engine route

### Requirement: Document paths remain behind scoped loopback tokens

The Node document server MUST bind only to loopback, MUST expose opaque cryptographically random tokens instead of file paths, and MUST reject unknown or revoked tokens before opening document content.

#### Scenario: Request a registered document token

- **WHEN** a Webview requests a valid token created for its document registration
- **THEN** the server returns only the registered document or one normalized entry from that document

#### Scenario: Request an unknown or revoked token

- **WHEN** a request uses a token that was never registered or has been unregistered
- **THEN** the server returns `404` without probing a local path

### Requirement: Raw document files support browser loading contracts

The Node document server MUST support GET and HEAD for PDF, DOCX, and CBZ. It MUST stream raw files, advertise byte ranges, return correct supported-format MIME types, and support one closed, open-ended, or suffix Range request without loading the entire PDF or CBZ into memory.

#### Scenario: PDF or CBZ requests a byte range

- **WHEN** a registered PDF or CBZ token receives a valid single Range request
- **THEN** the server returns `206` with `Accept-Ranges`, `Content-Range`, `Content-Length`, the correct MIME type, and only the requested bytes

#### Scenario: DOCX requests the complete file

- **WHEN** docx-preview fetches a registered DOCX token without a Range header
- **THEN** the server returns the complete bounded response with the DOCX MIME type

#### Scenario: Request an invalid or multiple range

- **WHEN** a Range is malformed, outside the file, or contains multiple ranges
- **THEN** the server returns `416` with the complete file size and does not start a file stream

### Requirement: EPUB content is loaded as bounded archive entries

The Node document server MUST expose an EPUB registration as a trailing-slash directory URL and MUST resolve each nested request as one normalized archive entry through the shared Node document-access boundary. It MUST NOT require the Webview to download the complete EPUB archive before opening the book.

#### Scenario: Open an EPUB package

- **WHEN** epub.js opens a registered EPUB directory URL
- **THEN** it can request `META-INF/container.xml`, the package document, navigation, chapters, styles, fonts, and images as individual entry responses

#### Scenario: Request an escaping EPUB entry

- **WHEN** an EPUB entry request contains an absolute path, null byte, or parent traversal
- **THEN** the Node host rejects the request before reading outside the registered archive

### Requirement: Webview network policy is explicit

Every document response MUST include the CORS and local private-network headers required by the VS Code Webview, and the server MUST answer preflight requests without exposing document bytes.

#### Scenario: Webview preflights a document URL

- **WHEN** the VS Code Webview sends an OPTIONS request for a document route
- **THEN** the Node host returns a successful empty preflight response with allowed origin, methods, headers, and private-network access

### Requirement: Registration lifetime is panel-scoped

Each Webview panel MUST own its document registration independently. Ready handling MUST be idempotent, and panel/provider/extension disposal MUST revoke only the owned tokens and release the Node server when the extension deactivates.

#### Scenario: Webview sends ready more than once

- **WHEN** one panel emits duplicate ready messages
- **THEN** the provider creates at most one registration and posts the same canonical document URL

#### Scenario: Reopen the same document during old panel disposal

- **WHEN** a newer panel registers the same file before an older panel finishes disposal
- **THEN** disposing the older panel revokes only its token and the newer panel remains readable

#### Scenario: Extension deactivates

- **WHEN** the Preview extension is disposed
- **THEN** all remaining tokens are revoked, open document resources are released, and the loopback server stops accepting connections

### Requirement: Media computation remains on Rust

Removing document Engine access MUST NOT move video/audio codec, image processing, timeline playback, streaming, effects, proxy, or export computation into the Node document server.

#### Scenario: Open media after document migration

- **WHEN** a retained video, audio, Canvas, or Cut workflow requires media processing
- **THEN** it continues through the Rust Engine client and native media runtime
