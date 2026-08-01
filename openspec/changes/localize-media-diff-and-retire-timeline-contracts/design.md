## Current design

Desktop Main owns comparison sessions and invokes bounded Node/FFmpeg operations. Renderer receives only
versioned request/result/progress/diagnostic messages with explicit session identity. Cancel, timeout,
supersede, View disposal and app shutdown reach the exact child process and wait for termination before
temporary cleanup.

Media Info uses the same authorized resource and probe path. Comparison UI may render overlays locally
but cannot claim uncomputed metrics. Absolute paths, process handles, tokens and internal temp locations
never enter renderer state.

Old Timeline/NKV/EngineDiff/Proto interfaces are forbidden inputs. Current Cut/Canvas/Agent owners expose
their own projections and no compatibility reader or alias can return success.

## Remaining gate

Prove cancel/timeout/dispose/supersede/concurrency/cleanup at process level, then run isolated Electron
Desktop scenarios for image/audio/video compare, Git comparison, Media Info and concurrent View disposal.
