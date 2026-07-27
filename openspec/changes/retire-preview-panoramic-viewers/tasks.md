## 1. Contract and regression loop

- [x] 1.1 Audit Preview, Agent, Canvas, shared types, and Model Preview ownership.
- [x] 1.2 Freeze the removed viewer IDs and preserved 3D-environment boundary.
- [x] 1.3 Add red regression tests for manifest/routing absence and the removed
      control indicator.

## 2. Remove the viewer slice

- [x] 2.1 Delete Preview manifest contributions, activation registration,
      providers, viewer Webviews, routing, and viewer-specific API types.
- [x] 2.2 Delete the shared panoramic Preview route contract, dead rich-content
      registrations, and migrate Agent
      file opening to ordinary video/audio/default routing.
- [x] 2.3 Remove Canvas panoramic routing and dead thumbnail message handling.
- [x] 2.4 Move the retained 3D environment source authorization under Model
      Preview ownership.

## 3. Remove obsolete status presentation

- [x] 3.1 Remove `isConnected` from `VideoControls` and delete the connection
      dot and localization string.
- [x] 3.2 Retain and verify `VideoPlayer`'s private descriptor-reuse state.

## 4. Validation

- [x] 4.1 Run affected focused tests, package builds, strict OpenSpec
      validation, and repository quality gates.
- [x] 4.2 Rebuild/reload the Extension Development Host rooted at
      `${HOME}/Git/neko-test`.
- [x] 4.3 Verify panoramic menu actions and the connection dot are absent while
      normal video Preview and AV1/HDR diagnostics remain functional.
