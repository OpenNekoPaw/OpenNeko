## 1. Fullscreen contract and entry points

- [x] 1.1 Add explicit fullscreen presentation metadata to the node descriptor contract and assign profiles to supported core/creator node types.
- [x] 1.2 Make NodeHeader and selection-toolbar fullscreen actions use descriptor eligibility, and remove no-op actions from unsupported Script/Document/resources.
- [x] 1.3 Centralize node display-title resolution so Canvas headers and fullscreen overlays use the same explicit/provenance title.

## 2. Presentation-specific overlay rendering

- [x] 2.1 Refactor `ContentOverlay` to resolve and dispatch visual-stage, text-document, generic-workbench, and Shot-workbench presentations.
- [x] 2.2 Implement Markdown preview, literal plain-text preview, and explicit text edit mode through the existing node-data update path.
- [x] 2.3 Implement an opaque dark media stage and remove the `52vh` cap only from full-bleed fullscreen visual previews.
- [x] 2.4 Preserve the specialized Shot overlay and constrain generic workbench layout to one scroll owner and a readable centered width.
- [x] 2.5 Ensure close/Escape dismissal and transient presentation state behave consistently across profiles.

## 3. Regression coverage and validation

- [x] 3.1 Add focused tests for descriptor eligibility, unsupported-node controls, and shared title resolution.
- [x] 3.2 Add focused overlay tests proving Markdown/plain path selection, explicit editing, media full-bleed sizing, and Shot workbench preservation.
- [x] 3.3 Run affected package tests, typecheck/build, and `git diff --check`.
- [x] 3.4 Validate the real Extension Development Host Webview scenarios for text, media, and creator nodes, recording any dirty-workspace or reload blocker.
- [x] 3.5 Run the Neko quality review, address actionable findings, and document remaining risks.

## 4. Material-resolved image viewer

- [x] 4.1 Extend the descriptor contract with a canonical static-or-dynamic fullscreen resolver and route every fullscreen entry point through it.
- [x] 4.2 Resolve image Media nodes to a frameless `image-viewer` while keeping video/audio on `visual-stage`.
- [x] 4.3 Implement top-right close and bottom-centered bounded zoom controls without rendering generic node chrome.
- [x] 4.4 Add focused resolver and overlay tests proving image/video routing, zoom interaction, dismissal, and the absence of node framing.
- [x] 4.5 Build/copy the Canvas Webview and validate the image viewer in Extension Development Host.
