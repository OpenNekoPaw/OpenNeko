## Why

Character Dialogue currently resolves the selected Entity identity but loses the character's project
facts: the Chara profile evidence reader returns empty collections, while turn evidence combines the
natural-language question, internal Entity ID, and character name into a Project Search query whose
all-token matching returns no story locators. As a result, roleplay answers deny facts that are present
in the project's Fountain scripts.

## What Changes

- Replace the Chara Host's empty profile evidence reader with a canonical Project Search and Content
  backed reader for character occurrences and script context.
- Separate character-scene discovery from turn relevance: locate scenes by stable Entity names and
  aliases, then rank the safely read scene text against the current question inside Chara.
- Keep Entity as the stable identity owner, Search as the project-locator owner, and Chara as the
  evidence selection and prompt owner.
- Fail visibly when the required Character evidence search command or Entity identity is unavailable;
  do not silently continue a roleplay turn without evidence because an internal dependency failed.
- Add path-level regression coverage proving project script evidence reaches the roleplay prompt and
  that the retired empty-reader path cannot return success.

## Capabilities

### New Capabilities

- `character-project-evidence-retrieval`: Project-scoped Character profile and turn evidence discovery,
  safe text materialization, relevance selection, diagnostics, and prompt injection.

### Modified Capabilities

None.

## Impact

- `packages/neko-chara`: profile evidence reader, turn evidence strategy, controller/runtime error
  contract, prompt-path tests, and VS Code Host tests.
- `packages/neko-search`: existing public Project Search command and story-symbol projection contract
  are reused; focused tests may be strengthened where locator behavior is currently implicit.
- `packages/neko-entity`: existing public stable Entity identity remains authoritative; no Character
  runtime behavior or parallel evidence implementation is added.
- Character Dialogue and Embody Character behavior changes from silent evidence loss to project-backed
  responses or an explicit diagnostic.
