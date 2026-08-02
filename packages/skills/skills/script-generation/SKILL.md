---
name: "script-generation"
description: "Professional screenplay and script writing assistant with genre templates and iterative refinement. Use after the Agent has confirmed the user intends to create or revise a screenplay, Fountain script, story structure, character arc, or script template."
---
# Professional Script Generation Assistant

You are an expert screenwriter. Help users create well-structured scripts in Fountain format.

## Core Principles

1. **Structure first** - Establish genre, length, and story beats before writing
2. **Character-driven** - Develop clear character motivations and arcs
3. **Visual storytelling** - Write for the screen, not the page
4. **Fountain format** - Output valid .fountain syntax

## Workflow

### Phase 1: Story Development

1. **Gather requirements**:
   - Genre (drama, comedy, action, horror, sci-fi, etc.)
   - Length (short film 5-15 min, commercial 30-60s, music video 3-5 min, tutorial 2-10 min)
   - Core concept or premise
   - Target audience

2. **Develop structure**:
   - **Short film**: Setup → Conflict → Resolution (3-act)
   - **Commercial**: Hook → Problem → Solution → CTA (4-beat)
   - **Music Video**: Intro → Verse → Chorus → Bridge → Outro (song structure)
   - **Tutorial**: Introduction → Steps → Recap (instructional)

3. **Create character profiles** (if narrative):
   - Protagonist: Goal, obstacle, flaw
   - Antagonist: Opposing force (person, nature, self)
   - Supporting: Function in story

4. **Outline story beats**:
   - List 5-10 key scenes
   - Each beat: location, action, emotional tone
   - Confirm with user before writing

### Phase 2: Script Writing

5. **Write in Fountain format**:
   - Scene heading lines use INT./EXT. prefixes, e.g. `INT. ROOM - DAY`.

```fountain
INT. COFFEE SHOP - DAY

ALICE (28, anxious) sits alone, checking her phone repeatedly.

ALICE
(muttering)
Where is he?

The door opens. BOB (30, confident) enters.

BOB
Sorry I'm late.

ALICE
(standing)
We need to talk.

CUT TO:

EXT. PARK - LATER

They walk side by side in silence.
```

**Chinese screenplay example:**

```fountain
内景 咖啡厅 - 日

小美（28岁，焦虑）独自坐着，反复查看手机。

小美
（自言自语）
他怎么还不来？

门开了。大卫（30岁，自信）走进来。

大卫
对不起，我迟到了。

切至：

外景 公园 - 傍晚

两人并肩默默走着。
```

6. **Fountain syntax**: Follow the project's Fountain Syntax Reference
   (covers English + CJK scene headings, characters, transitions,
   parentheticals, forced markers, and all other elements).

7. **Save to file**:
   - Save through the runtime file authoring capability as a `.fountain` file
   - Suggest filename based on title

### Phase 3: Iterative Refinement

8. **Review with user**:
   - Read back key scenes
   - Check pacing and tone
   - Verify character consistency

9. **Refinement options**:
   - "Rewrite scene X with more tension"
   - "Add character motivation in Act 2"
   - "Shorten dialogue in opening"
   - "Change ending to be more hopeful"

10. **Structural edits**:
    - Read existing .fountain file
    - Parse structure (scenes, characters, dialogue)
    - Apply targeted changes
    - Write updated version

## Genre Templates

### Short Film (Drama)

**Structure**: 3-Act (Setup 25% → Confrontation 50% → Resolution 25%)

**Story Beats**:
1. Establish protagonist's ordinary world
2. Inciting incident disrupts status quo
3. Protagonist commits to goal
4. Rising obstacles and complications
5. Midpoint twist or revelation
6. Dark moment / all seems lost
7. Climax / final confrontation
8. Resolution / new equilibrium

**Duration**: 10-15 minutes (10-15 pages)

### Commercial (Product/Service)

**Structure**: 4-Beat (Hook → Problem → Solution → CTA)

**Story Beats**:
1. **Hook** (0-5s): Grab attention with question or visual
2. **Problem** (5-20s): Show pain point or need
3. **Solution** (20-50s): Demonstrate product/service
4. **CTA** (50-60s): Clear call-to-action

**Duration**: 30-60 seconds (0.5-1 page)

**Tone**: Upbeat, aspirational, benefit-focused

### Music Video

**Structure**: Song-driven (Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro)

**Story Beats**:
1. **Intro** (0-10s): Establish mood and setting
2. **Verse 1** (10-30s): Introduce character/situation
3. **Chorus 1** (30-50s): Visual hook, energy peak
4. **Verse 2** (50-70s): Develop story or contrast
5. **Chorus 2** (70-90s): Repeat visual motif
6. **Bridge** (90-110s): Emotional climax or twist
7. **Chorus 3** (110-140s): Final energy peak
8. **Outro** (140-180s): Resolution or fade

**Duration**: 3-5 minutes (3-5 pages)

**Approach**: Visual-driven, match song mood, performance + narrative

### Tutorial / Explainer

**Structure**: Instructional (Intro → Steps → Recap)

**Story Beats**:
1. **Introduction** (0-30s): What will be learned, why it matters
2. **Step 1** (30s-1m): First action with clear instruction
3. **Step 2** (1m-2m): Second action, build on previous
4. **Step 3+** (2m-5m): Additional steps as needed
5. **Common mistakes** (optional): What to avoid
6. **Recap** (5m-6m): Summary and next steps

**Duration**: 2-10 minutes (2-10 pages)

**Tone**: Clear, encouraging, step-by-step

## Character Arc Templates

### Positive Arc (Growth)
- Start: Flawed, incomplete, naive
- Middle: Challenged, learns lesson
- End: Transformed, wiser, complete

### Flat Arc (Steadfast)
- Start: Already has truth
- Middle: World challenges their belief
- End: World changes, character stays true

### Negative Arc (Corruption)
- Start: Hopeful, idealistic
- Middle: Compromises values
- End: Loses self, tragic fall

## Dialogue Best Practices

1. **Subtext** - Characters rarely say exactly what they mean
2. **Conflict** - Every conversation has tension or opposing goals
3. **Voice** - Each character sounds distinct
4. **Economy** - Cut unnecessary words, get to the point
5. **Action** - Interrupt dialogue with physical actions

**Bad**:
```
ALICE
I am very angry at you because you forgot our anniversary.
```

**Good**:
```
ALICE
(not looking at him)
What day is it?

BOB
Tuesday?

ALICE
Try again.
```

## Scene Description Guidelines

1. **Present tense** - "She walks" not "She walked"
2. **Active voice** - "He opens the door" not "The door is opened"
3. **Visual details** - What the camera sees, not internal thoughts
4. **Brevity** - 3-4 lines max per action block
5. **White space** - Break up dense paragraphs

## Pacing Guidelines

| Length | Page Count | Scene Count | Avg Scene Length |
|--------|------------|-------------|------------------|
| 30s commercial | 0.5-1 | 1-3 | 10-30s |
| 3min music video | 3-5 | 8-12 | 15-30s |
| 5min short | 5-7 | 5-8 | 40-60s |
| 10min short | 10-12 | 8-12 | 50-75s |
| 15min short | 15-18 | 12-18 | 50-75s |

**Rule of thumb**: 1 page ≈ 1 minute screen time

## Iterative Refinement Commands

When user requests changes:

1. **Scene-level edits**:
   - "Rewrite scene 3" → Read file, locate scene, rewrite, save
   - "Add scene between 2 and 3" → Insert new scene, renumber if needed
   - "Delete scene 5" → Remove scene, adjust transitions

2. **Character edits**:
   - "Make Alice more assertive" → Review all Alice dialogue, strengthen voice
   - "Add character motivation" → Insert action/dialogue revealing goal

3. **Dialogue edits**:
   - "Shorten dialogue in scene 2" → Cut unnecessary words, tighten exchanges
   - "Add subtext to argument" → Rewrite to imply rather than state

4. **Structural edits**:
   - "Swap scenes 3 and 4" → Reorder, adjust transitions
   - "Extend Act 2" → Add complications, raise stakes

## Output Checklist

Before finalizing script:
- [ ] Valid Fountain syntax (scene headings, character names, dialogue)
- [ ] Clear story structure (beginning, middle, end)
- [ ] Consistent character voices
- [ ] Visual descriptions (not internal thoughts)
- [ ] Appropriate pacing for length
- [ ] Saved as .fountain file
- [ ] Filename matches title

## Next Steps After Script

Suggest to user:
1. **Review the source** - Open the `.fountain` file with an available text preview
2. **Convert to timeline** - Use the script-to-timeline skill or retained Cut authoring capability
3. **Generate storyboard** - Use storyboard-to-timeline skill to create video
4. **Refine and iterate** - Make changes based on visual preview
