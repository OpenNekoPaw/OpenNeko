## MODIFIED Requirements

### Requirement: Preview SHALL use its owning viewers

Preview SHALL keep package-owned image, audio, video, document and model viewers and SHALL dynamically load only the Viewer selected by the ready descriptor's content kind and MIME. Audio/video SHALL consume native resource URLs; PDF/document adapters SHALL consume Range or bounded bytes; EPUB SHALL consume one authorized virtual-directory resource whose metadata and entries are read on demand; GLB SHALL use one resource and glTF external dependencies SHALL use an exact resource set. `PreviewMediaDescriptor.contentLocator` SHALL remain source identity.

#### Scenario: Preview opens audio or video

- **WHEN** Preview resolves an accepted source
- **THEN** the owning player module consumes an `openneko://resource/...` URL
- **AND** no Desktop-local viewer, unrelated format module or PCM fallback replaces it

#### Scenario: Preview opens external-resource glTF

- **WHEN** the model manifest declares relative buffers/textures
- **THEN** one entry URL resolves only the frozen allowlist
- **AND** unknown dependencies fail without directory authorization

#### Scenario: Preview opens EPUB

- **WHEN** Preview resolves an authorized EPUB source
- **THEN** only the EPUB Viewer module receives a sender-bound virtual-directory URL and requests required metadata/current content entries
- **AND** PDF, DOCX, CBZ and Model modules do not execute and the complete EPUB archive is not returned to Renderer
