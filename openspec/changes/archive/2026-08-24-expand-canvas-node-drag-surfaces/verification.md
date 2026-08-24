## Scope and risk

- Risk: L2. The change alters browser pointer hit surfaces but retains the existing drag hook, move callback and document submission path.
- Canonical owner: `@neko/canvas-webview` BaseNode owns pointer hit presentation; `useNodeDrag` remains the sole node drag decision and gesture path.
- Replaced path: external labels no longer pass pointer events to the viewport. No content overlay, second drag implementation or direct document mutation was added.
- User data: persistence shape and history semantics are unchanged.

## Functional verification

Passed:

- Component tests start the existing transform path from the external label, top rail and bottom rail.
- Hook tests preserve interactive controls, explicit drag-block areas and horizontal/vertical scrollbar ownership.
- Complete Canvas Webview suite: 70 files / 438 tests.
- Webview TypeScript build, strict OpenSpec, Webview/package boundaries, scoped ESLint/Prettier and `git diff --check`.

## UI validation

**Acceptance inventory:**

- External title mousedown -> exact node selection and canonical transform start: component test passed.
- Top and bottom rail mousedown -> canonical transform start: component test passed.
- Horizontal/vertical scrollbar hit -> node drag rejected and propagation retained locally: hook tests passed.
- Interactive child or explicit block -> node drag rejected: hook tests passed.
- Selected resize handles -> z-index 20 remains above rail z-index 1 by direct presentation inspection.
- Rail geometry -> 8px outside the content box, so正文 and scrollbars are not covered by the new elements.

**Authoritative runtime:** isolated Electron Canvas scenario is required to validate real pointer behavior and content scrolling together.

**Result:** blocked. `node scripts/run-desktop-ui-functional.mjs --scenario canvas-openneko-consumer` timed out waiting for a CDP target while another Electron Forge development process owned this checkout. The running application was preserved. No authoritative screenshot or real pointer trace was produced.

## Quality review

No blocking or suggestion findings in the scoped change.

- Label and rails bubble into the existing BaseNode handler; they do not own coordinates or mutation.
- Rails sit outside content and below transform handles, preserving scroll and resize ownership.
- Existing fail-local drag decision rules are unchanged; no transparent full-card interception layer was introduced.

## Residual risk

- Real Electron pointer and scrollbar coexistence remains visually unverified until the existing development process releases the checkout.
