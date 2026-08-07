## 1. Package Ownership Closure

- [ ] 1.1 Verify Cut lifecycle convergence through `redefine-openneko-lightweight-editing` and move Preview View/session policy from `desktop-preview-runtime.ts` into `@neko/preview-domain` with producer tests.
- [ ] 1.2 Reduce Desktop Preview runtime to sender/path authorization, exact-resource/native adapter, Workbench projection and disposal; add delegation and removed-path-absence tests plus isolated Electron lifecycle evidence.

## 2. Documentation closure

- [ ] 2.1 Update capability documentation and Phase 1 program 5.x after the full Cut/Preview runtime,
      unified resource gateway and owning Electron scenarios pass.

## 3. EPUB incremental preview

- [ ] 3.1 Remove all-spine waterfall height warmup, add tests proving initial load/measurement is bounded to visible and neighboring chapters, and retain incremental placeholder correction.
- [ ] 3.2 Extend the isolated Electron Preview scenario with a multi-chapter EPUB and verify first-view readiness, bounded initial chapter DOM, scroll-triggered loading and resource release.
