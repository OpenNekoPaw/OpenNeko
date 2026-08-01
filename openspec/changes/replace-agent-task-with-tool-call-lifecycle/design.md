## Current design

Pi Tool Call is the execution identity for Agent-owned work. It streams progress/result on one Timeline
item, inherits turn cancellation and releases with the owning Agent Run. A domain Job is introduced only
when the work must survive the Agent/View, recover after restart or be directly controlled by another
product surface.

The ownership registry stores only explicit instance-scoped relationships and cancellation propagation.
GenerationJob and Cut ExportJob keep their own status, persistence and recovery contracts. A new Tool Call
may observe or attach to a stable domain Job; a cancelled ToolCall identity is never resumed.

Desktop Main derives sender/window/view/conversation ownership. Renderer displays Tool or domain Job
projections but never owns execution. Closing/reloading surfaces must prove exact cancellation or retained
domain ownership and no generic Task fallback.
