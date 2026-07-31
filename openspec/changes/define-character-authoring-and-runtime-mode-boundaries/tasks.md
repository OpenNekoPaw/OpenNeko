## 1. Character authoring and runtime design

- [x] 1.1 Define CharacterProject/CharacterVersion authoring facts and immutable runtime binding rules
- [x] 1.2 Define discriminated narrative and companion run identities, lifecycles and AgentSession ownership
- [x] 1.3 Define NarrativeSave causal memory visibility and UserCharacterRelationship long-term memory ownership
- [x] 1.4 Define mode-specific version upgrade, memory review, Activity composition and fail-visible semantics

## 2. Normative specifications

- [x] 2.1 Add requirements and scenarios for authoring/runtime separation, immutable runtime kind and narrative save binding
- [x] 2.2 Add requirements and scenarios for companion relationship, reality context, long-term memory and version rebinding
- [x] 2.3 Modify Character/World aggregation requirements to establish the expanded memory owner model
- [x] 2.4 Add cross-mode isolation, canonical AgentSession, owning Activity and unavailable-path scenarios

## 3. Stable documentation

- [x] 3.1 Update the Chara domain README with current implementation status and target runtime-mode terminology
- [x] 3.2 Update Chara architecture with owner, dependency, memory, upgrade and Activity boundaries
- [x] 3.3 Update package boundaries with narrative/companion aggregation and memory ownership
- [x] 3.4 Verify historical Character/World documents are not presented as current runtime support

## 4. Verification

- [x] 4.1 Run strict OpenSpec validation and inspect artifact status
- [x] 4.2 Run `git diff --check` and validate changed Markdown links and paths
- [x] 4.3 Review the final documentation diff for conflicts with AgentSession, World, ContentLocator, Activity and fail-visible boundaries
