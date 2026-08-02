## Current design

No Tools package, Desktop comparison session, Media Info producer or comparison viewer exists in the
current workspace. Media probing remains an owning Media/consumer responsibility and is not exposed as a
generic Tools surface. A future comparison product requires a new OpenSpec with a real package owner,
producer, consumer and Electron acceptance path; this change does not reserve an empty boundary.

Old Timeline/NKV/EngineDiff/Proto interfaces are forbidden inputs. Current Cut/Canvas/Agent owners expose
their own projections and no compatibility reader or alias can return success.

## Remaining gate

Prove workspace discovery, manifests, Desktop routes, docs and legacy-debt checks contain no successful
Tools/NKV/Timeline Diff/EngineDiff path, then archive this retirement change.
