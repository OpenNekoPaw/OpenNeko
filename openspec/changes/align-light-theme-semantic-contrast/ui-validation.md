## UI validation

### Acceptance inventory

| Surface              | State                          | Expected result                                                                                                 |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Character management | Light theme, populated catalog | Primary action is high contrast; import/search/sort and card copy remain readable.                              |
| World management     | Light theme, populated catalog | Primary action is high contrast; secondary controls, descriptions and metadata retain distinct readable levels. |
| Agent conversation   | Light theme, completed turn    | Assistant text and Composer controls are readable; truly disabled send remains visibly disabled.                |

### Authoritative runtime

- Visible Electron Desktop development runtime using the real renderer and package Webviews.
- Existing local Character, World and Conversation records were used; no fixture or direct runtime shortcut replaced the user path.
- The user-provided screenshots are the before evidence. Direct image-capable inspection of the live Desktop is the after evidence.

### Findings

- Character: `新增角色` renders with the canonical dark primary background and white foreground. Import, sort, search and catalog copy are legible without appearing disabled.
- World: `新增世界` renders with the same primary hierarchy. Card descriptions and metadata are visibly separated while remaining readable.
- Agent: assistant content, turn status, placeholder, model selector and mode control retain a clear hierarchy. Disabled send is still muted, so enabled and disabled states remain distinguishable.
- No clipping, overlap, truncated controls or adjacent layout regression was observed in the inspected states.

### Result

Pass for the affected light-theme states. Dark-theme values were not changed; the implementation consumes the same canonical button and foreground tokens in both themes. Dark-theme visual regression remains an adjacent release smoke-check rather than a blocker for this light-theme defect.
