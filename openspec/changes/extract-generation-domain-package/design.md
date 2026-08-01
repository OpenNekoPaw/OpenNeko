## Current design

`@neko/generation` owns request/result, provider capability, execution port and the complete
GenerationJob lifecycle. It depends only on lower-level shared contracts. Desktop Main injects an exact
provider execution binding and durable store; Agent and Canvas consume public application ports.

Configuration, credentials, workspace authorization and artifact publication remain Host-owned. The
domain receives immutable resolved facts and never imports Agent, Platform, Electron, React or config IO.
Missing binding, provider mismatch, stale job identity and recovery uncertainty fail visibly.

## Remaining gate

With explicit user cost authorization, run one configured provider case from the normal Electron Desktop
consumer through `@neko/generation`, record effective model/job/artifact identity and path evidence, and
prove no old Platform Job owner or fallback participated.
