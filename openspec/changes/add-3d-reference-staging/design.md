## Current design

Preview owns the renderer, staging state, capture and disposal lifecycle. Each View/session/revision has
isolated mutable camera, light, pose, panorama and purpose selections. None of that state is project or
source truth; reload may discard it unless the active View projection explicitly restores recoverable
presentation state.

Built-in presets come from one immutable catalog. Desktop Main validates identity/fingerprint and
registers exact packaged dependencies with the resource gateway. Renderer receives only descriptors and
loads assets lazily when entering the 3D reference surface. Non-3D Preview entries must not fetch or
instantiate preset assets.

Appearance, pose/depth, camera and panorama are distinct roles with independent eligibility. Guide-only
mannequins can never become appearance references. Camera and the fixed directional rig are selectable
scene entries and directly draggable viewport objects; capture excludes editor handles and guides.

Delivery freezes exact session/revision/output roles into one `3d-reference` context. Agent/Canvas/media
consumers validate the selected provider/model capability before submission. Unsupported controls fail
without dropping roles, converting to generic images or rerouting providers.

## Acceptance

Measure lazy bundle and construction/render/disposal cost for the preset set. Run owning isolated
Electron scenarios covering guide creation, preset, pose, camera/light, panorama, purpose toggles, send,
reload, multi-View isolation and disposal. Validate one normal external model source through the same
authorized fixture boundary without repository-local copies or absolute-path facts.
