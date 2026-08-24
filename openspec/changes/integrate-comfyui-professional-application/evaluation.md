## Evaluation plan

This change affects capability/tool routing, exact-target Computer Use and asynchronous Generation
Jobs. It therefore updates existing Agent Evaluation coverage instead of creating a second controller
or a product Evaluation capability.

## Coverage disposition

| Affected behavior                                                     | Disposition                             | Suite/case                                                                       | Required evidence                                                                   |
| --------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Agent explicitly composes ComfyUI visual inspection and API execution | update                                  | `agent-runtime.external-automation` / `comfyui-explicit-visual-and-api-routing`  | two exact operations, exact target evidence, one Generation Job and API `prompt_id` |
| API failure never falls back to Computer Use                          | update                                  | `agent-runtime.external-automation` / `comfyui-api-failure-no-computer-fallback` | API diagnostic, zero Computer Use mutation and zero second submission               |
| Recoverable Job, output and provenance                                | reuse; update fixture only if necessary | `agent-runtime.creative-media-workflow`                                          | canonical Job lifecycle, verified candidate and provenance                          |
| Detached observation, cancellation and transcript projection          | reuse                                   | `agent-runtime.workflow-controller`                                              | exact Job identity, terminal state and session-isolated projection                  |
| Direct UI catalog/config/handoff                                      | excluded from Agent suite               | package/Desktop/UI tests                                                         | no hidden Conversation and exact package service delegation                         |

## Canonical path under evaluation

```text
visible Agent composer
  -> exact DSH Generation Tool operation
  -> Generation Job service
  -> qualified ComfyUI local API adapter
  -> exact prompt_id events/history/output
  -> verified Generation candidate
  -> explicit Assets ingest

optional explicit visual step
  -> official DSH Computer Use contribution
  -> Automation exact target/grant/action/evidence
  -> Desktop bound ComfyUI process/window
  -> advisory observation returned to the same Agent turn
```

## Forbidden paths

- final text or screenshot used as API Job/output success;
- API validation, timeout or connection failure followed by implicit Computer Use mutation;
- Computer Use failure followed by guessed or repeated API mutation;
- active/current application, window, resource, workflow or Conversation fallback;
- raw output-directory/latest-file selection;
- mock provider or key-free run claimed as real Agent behavior acceptance;
- a direct UI handoff routed through a fabricated Agent Tool Call.

## Evidence lanes

1. Deterministic contracts and package tests prove strict shapes, exact operation routing, fail-local
   profiles, target binding and poison conditions.
2. Key-free `pnpm test:agent:eval` and focused dry-run commands validate suite authoring, profile
   references, supported kinds and workflow assertions before external execution.
3. A real local ComfyUI fixture verifies loopback discovery, workflow validation/submission, WebSocket
   progress, cancellation, history-correlated output retrieval and explicit Asset ingest.
4. Hidden Desktop plus real provider may provide repeated Agent routing evidence, but does not replace
   the visible lane.
5. Visible real Electron plus real provider and direct image-capable review verifies the user-facing
   Agent path, exact ComfyUI target, progress, Pause/Stop/Take over, output and failure presentation.

No Judge is required for deterministic routing, identity and lifecycle assertions. A Judge may be
added only for a separately specified qualitative workflow-result criterion; it cannot decide whether
the canonical path or exact output identity was used.

## Implementation-time commands

The implementing change must record the exact focused case identifiers after they are authored. The
minimum planned commands are:

```bash
pnpm test:agent:eval
pnpm exec openspec validate integrate-comfyui-professional-application --strict
pnpm test:agent:eval:dry -- --suite agent-runtime.external-automation
```

Package tests/typechecks, Desktop integration commands and visible UI fixture commands must be added to
the evidence record once their canonical scripts exist. Missing real ComfyUI, provider, OS permission
or visible Desktop evidence is reported as infrastructure-blocked or not-run; it is never converted to
pass by a key-free fixture.
