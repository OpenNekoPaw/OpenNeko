# OpenSpec Active-Area Disposition

## Collection Baseline

- Source revision before cleanup: `7679faa1afd20307580c905a779424ed35e4503a`
- Collected at: `2026-07-31T16:18:23+08:00`
- Scope: first-level directories under `openspec/changes/`, excluding `archive/`
- Counting rule:
  - `complete`: `tasks.md` exists and contains no unchecked checkbox
  - `incomplete`: `tasks.md` contains at least one unchecked checkbox
  - `artifact-free residue`: no file exists anywhere below the first-level directory
- Baseline after creating this governance change:
  - 96 active-area directories
  - 66 complete changes
  - 23 incomplete changes
  - 7 artifact-free directories without `tasks.md`

The counts include this governance change and the dirty working tree at collection time. They are
an implementation baseline, not a timeless repository fact.

## First Batch

| Change or directory                                   | Disposition               | Evidence                                                                                                                                    |
| ----------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `add-otio-exchange`                                   | Delete empty residue      | Contains directories only; no files or tracked entries                                                                                      |
| `align-profile-external-media-routing-and-candidates` | Delete empty residue      | Contains directories only; no files or tracked entries                                                                                      |
| `converge-engine-realtime-and-renderplan`             | Delete empty residue      | Contains directories only; no files or tracked entries                                                                                      |
| `freeze-lightweight-project-contracts`                | Delete empty residue      | Contains directories only; no files or tracked entries                                                                                      |
| `move-agent-logs-outside-workspace`                   | Delete empty residue      | Contains directories only; no files or tracked entries                                                                                      |
| `rebuild-cut-lightweight-surface`                     | Delete empty residue      | Contains directories only; no files or tracked entries                                                                                      |
| `unify-engine-media-jobs-and-derived-artifacts`       | Delete empty residue      | Contains directories only; no files or tracked entries                                                                                      |
| `synchronize-desktop-only-documentation`              | Archive with spec sync    | 13/13 tasks complete; `repository-documentation-consistency` remains current                                                                |
| `align-pruned-workspace-build`                        | Archive without spec sync | Explicitly superseded by Engine retirement; remaining Rust/Cargo gate is obsolete                                                           |
| `replace-cut-engine-with-node-ffmpeg-runtime`         | Archive with spec sync    | 32/33 tasks complete; the conditional Engine deletion gate was fulfilled by the successor while the Node/FFmpeg requirements remain current |

## Kept Active

| Change                                           | Reason                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `retire-neko-engine-before-node-media-rebuild`   | Task 6.7 remains real; Engine-named shared contracts and persisted-snapshot rejection work still exist |
| `plan-neko-desktop-phase-1-delivery`             | Program-level implementation tasks remain and need transfer to focused changes before archive          |
| `redefine-openneko-lightweight-editing`          | Cut implementation tasks remain and require a focused Desktop successor                                |
| `clarify-desktop-capability-catalog`             | Untracked active work overlaps current Desktop/Agent changes                                           |
| `enhance-global-media-and-asset-library-browser` | Untracked active work overlaps current Desktop/Assets/media changes                                    |
| `fix-desktop-agent-shell-regressions`            | Untracked active work overlaps current Desktop/Agent changes                                           |
| `integrate-desktop-assets-canvas`                | Modified active artifacts overlap current Desktop/Assets work                                          |

Changes blocked on provider evidence, packaged Electron acceptance, repository settings, or other
external gates also remain active. This batch does not reinterpret those gates as completed.
