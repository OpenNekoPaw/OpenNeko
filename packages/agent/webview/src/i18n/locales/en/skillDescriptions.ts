import type { MessageBundle } from '@neko/ui/i18n';

export const skillDescriptions = {
  'skillDescriptions.audio-mixing':
    'Audio mixing and sound design assistant. Use after the Agent has confirmed the user intends to mix audio, adjust levels, add or balance music, normalize sound, fade audio, or apply ducking.',
  'skillDescriptions.character-creator':
    'Create a reviewable character draft from a user concept, prompt, or authorized project evidence. Use when the user wants to design a new role, turn source material into a character setting, or quickly fill a newly selected Character authoring target without publishing or starting roleplay.',
  'skillDescriptions.color-grading':
    'Color grading and correction assistant. Use after the Agent has confirmed the user intends to adjust color, exposure, contrast, white balance, LUTs, saturation, or a cinematic/film look.',
  'skillDescriptions.image':
    'Generate, edit, extend, enhance, colorize, compose, split, or prepare images through capability-neutral operations.',
  'skillDescriptions.media-production':
    'Guide adaptive source-to-deliverable production by selecting current owning capabilities and reassessing each actual result.',
  'skillDescriptions.media-quality-review':
    'Review creative assets, Storyboards, projects, final cuts, and exported deliverables with revision-bound evidence and policy-driven Gates.',
  'skillDescriptions.scene-to-music':
    'Analyze timeline scenes and plan matching background music, then hand off to music generation and timeline authoring capabilities when available. Use after the Agent has confirmed the user intends to score a scene, add background music, or generate music for a timeline.',
  'skillDescriptions.script-generation':
    'Professional screenplay and script writing assistant with genre templates and iterative refinement. Use after the Agent has confirmed the user intends to create or revise a screenplay, Fountain script, story structure, character arc, or script template.',
  'skillDescriptions.script-to-timeline':
    'Script to timeline conversion assistant. Use after the Agent has confirmed the user intends to convert a Fountain script or screenplay into a timeline/video project.',
  'skillDescriptions.skill-creator':
    'Guide for creating or updating reusable portable Agent Skills. Use when the user wants to design, create, refine, validate, or forward-test a Skill package without imposing a host-specific authoring gate.',
  'skillDescriptions.storyboard':
    'Explore prompts, text, scripts, documents, comics, image sequences, or existing Storyboards as flexible Markdown, and create canonical structured Storyboards only on explicit professional intent.',
  'skillDescriptions.subtitle-assistant':
    'Subtitle and captioning assistant. Use after the Agent has confirmed the user intends to create, edit, time, translate, import, or export subtitles/captions such as SRT or VTT.',
  'skillDescriptions.video':
    'Generate or transform a single video clip from prompts, images, keyframes, or reference video, separate from timeline editing.',
  'skillDescriptions.video-editing':
    'Video editing assistant for timeline operations. Use after the Agent has confirmed the user intends to edit a timeline, trim or split clips, merge clips, add transitions, or adjust timing.',
} as const satisfies MessageBundle;
