# Tasks

- [x] 1. Remove fingerprint input/output fields from the Canvas DSH schema, decoder and projected facts.
- [x] 2. Make the Canvas Host adapter query the exact document and forward the observed fingerprint only to the
      internal CAS-protected create-node call.
- [x] 3. Remove fingerprint input/output fields from the Cut DSH decoder and projected facts without changing export
      Job contracts.
- [x] 4. Make the Cut Host adapter query the exact document and forward the observed fingerprint only to the internal
      CAS-protected apply call.
- [x] 5. Poison retired model fingerprint fields in domain/plugin/Host tests and update Desktop integration fixtures.
- [x] 6. Run focused package tests/typechecks, strict OpenSpec, key-free Agent Evaluation and quality review; record
      real-provider/UI execution as blocked unless explicitly authorized.
