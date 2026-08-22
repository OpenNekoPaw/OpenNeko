# Design: Internal DSH authoring preconditions

## Five-layer analysis

- **Responsibility:** Canvas/Cut DSH contracts describe user/model intent; their authoring services own freshness and
  CAS. Agent Runtime adapts the request but does not invent document identity or storage policy.
- **Dependency:** model input needs only the exact Workspace document path and requested mutation. The Host-resolved
  authoring service already provides `query` plus CAS-protected mutation methods.
- **Interface:** Canvas `create-node` and Cut `apply` omit `expectedFingerprint`; query/mutation results omit raw
  fingerprints. The Host adapter queries the same exact document immediately before mutation and supplies the returned
  fingerprint only to the internal service call.
- **Extension:** a future operation that truly requires user-managed snapshot semantics must introduce a separately
  justified session-bound opaque precondition through OpenSpec; it must not expose fingerprint strategy/value.
- **Test:** schema/decoder tests poison fingerprint input and output, Host adapter tests prove query-before-mutation and
  internal fingerprint forwarding, stale CAS remains fail-visible, and package/Desktop tests prove the canonical path.

## Canonical paths

```text
Canvas model intent { documentPath, node }
  -> Canvas decoder -> Host exact query -> internal ContentFingerprint
  -> Canvas createNode CAS -> fingerprint-free model facts

Cut model intent { documentPath, commands }
  -> Cut decoder -> Host exact query -> internal ContentFingerprint
  -> Cut apply CAS -> fingerprint-free model facts
```

The query and mutation resolve the same exact Workspace-bound service. There is no active/current document fallback,
no raw path expansion in the model contract, and no retry using a different fingerprint. A concurrent change after
the Host query is rejected by the existing internal CAS path.

## Ownership and replaced path

- **Producer:** Canvas/Cut DSH schema and strict decoders.
- **Consumer:** their exact Agent Runtime Host adapters.
- **Internal authority:** Canvas/Cut authoring services and Content writer contracts retain `ContentFingerprint`.
- **Replaced path:** model query -> fingerprint copy -> model mutation is removed atomically from schemas, decoders,
  projected facts, plugin fixtures and Host tests.
- **User data:** none; this is an execution-contract replacement before Host authoring.
