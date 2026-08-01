# Agent Evaluation: Desktop Cut context handoff

Only the structured Cut → Agent context handoff changes Agent behavior. The canonical path starts from
an explicit Electron Desktop Cut document/session/revision and selected Timeline identities, projects
`AgentContextPayload`, then enters the normal Desktop Agent input path. Required evidence includes exact
target identity, selected media/Clip roles and zero active/recent-editor or retired-host fallback.

Editing, playback, save and export remain deterministic Domain/Desktop/Electron acceptance and do not
require provider-backed Evaluation unless their implementation changes Agent routing or prompts.
