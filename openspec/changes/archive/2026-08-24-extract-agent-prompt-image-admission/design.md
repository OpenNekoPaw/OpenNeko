## Boundary

The Agent service owns candidate selection, supported MIME, model eligibility, canonical inline
base64 decoding, image normalization, payload count, total normalized bytes, and atomic batch result.
It consumes a per-submit `AgentPromptReferenceBytePort` that returns only authorized bytes and the
observed MIME type.

Desktop implements that port by resolving the authoritative Conversation context, restoring the
sender-bound Workspace grant, rejecting non-Workspace-file locators, and reading through the
canonical Content service. It does not decide Agent image policy.

| Item | Owner / role | Canonical path | Runtime boundary |
| --- | --- | --- | --- |
| image admission policy | Agent runtime application | `@neko/agent-runtime/application` | host-neutral Node |
| authorized reference bytes | Desktop adapter | local Main adapter | Electron trust boundary |
| submit consumer | Desktop DSH Session Host | package service + bound byte port | sender-bound IPC |

The old Desktop all-in-one admission module is deleted. No compatibility export or alternate success
path remains.

## Agent Evaluation

Disposition: `create`, behavior owner `composer-image-admission`. The required real case is a visible
Desktop submit with a pasted or selected image, proving the exact model, canonical image payload,
terminal idle state, and rejection before ACP prompt when the model is not image-capable. Current
Scenario submit contracts do not expose image attachment input or matching path evidence, so the real
case is infrastructure-blocked; this change does not add an Evaluation-only product operation.
