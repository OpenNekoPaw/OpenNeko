## 1. Bundle and viewport completion

- [ ] 1.1 Add build ownership and lazy-load tests proving non-3D Preview entries do not fetch or
      instantiate preset assets; record aggregate bundle size and construction/render/disposal cost.
- [ ] 1.2 Expose camera and fixed key/fill/rim directional lights through scene-tree entries,
      recognizable viewport objects and camera-facing direct drag; add capture exclusion, a11y/i18n and
      focused renderer tests without persistent or physical point-light authoring.

## 2. Electron qualification

- [ ] 2.1 Add owning Preview functional scenarios with isolated synthetic fixtures for guide creation,
      preset, pose, camera/light, panorama, purpose toggles, send, reload, multi-View isolation and disposal.
- [ ] 2.2 Run the owning scenarios in Electron Desktop, capture console/resource/lifecycle evidence and
      commit only a scrubbed summary.
- [ ] 2.3 Validate one real-source GLB/glTF through the same isolated authorized fixture boundary,
      including appearance/pose eligibility, camera, panorama, material completeness and role isolation.
