import type { MessageBundle } from '@neko/shared';

export const promptTemplates = {
  'promptTemplates.title': 'Prompt Templates',
  'promptTemplates.all': 'All',
  'promptTemplates.categories.editing': 'Editing',
  'promptTemplates.categories.generation': 'Generation',
  'promptTemplates.categories.analysis': 'Analysis',
  'promptTemplates.categories.custom': 'Custom',

  'promptTemplates.noTemplates': 'No templates in this category',
  'promptTemplates.backToList': 'Back to list',
  'promptTemplates.parameters': 'Parameters',
  'promptTemplates.preview': 'Preview',
  'promptTemplates.useTemplate': 'Use This Template',
  'promptTemplates.templates.trimSilence.name': 'Trim Silence',
  'promptTemplates.templates.trimSilence.description': 'Auto detect and trim silent parts in video',
  'promptTemplates.templates.trimSilence.prompt':
    'Please analyze the selected video clip, find parts where audio is silent for more than {{threshold}} seconds, and help me trim these silent parts.',
  'promptTemplates.templates.trimSilence.threshold': 'Silence threshold (seconds)',
  'promptTemplates.templates.autoSubtitles.name': 'Auto Subtitles',
  'promptTemplates.templates.autoSubtitles.description':
    'Generate subtitles for selected video clip',
  'promptTemplates.templates.autoSubtitles.prompt':
    'Please generate subtitles for the selected video clip. Use {{language}} language, with {{style}} style.',
  'promptTemplates.templates.autoSubtitles.language': 'Language',
  'promptTemplates.templates.autoSubtitles.style': 'Style',
  'promptTemplates.templates.autoSubtitles.languages.chinese': 'Chinese',
  'promptTemplates.templates.autoSubtitles.languages.english': 'English',
  'promptTemplates.templates.autoSubtitles.languages.japanese': 'Japanese',
  'promptTemplates.templates.autoSubtitles.styles.formal': 'Formal',
  'promptTemplates.templates.autoSubtitles.styles.casual': 'Casual',
  'promptTemplates.templates.autoSubtitles.styles.humorous': 'Humorous',
  'promptTemplates.templates.matchCut.name': 'Match Cut',
  'promptTemplates.templates.matchCut.description': 'Auto edit based on music beats',
  'promptTemplates.templates.matchCut.prompt':
    'Please analyze the audio track beats and auto-split video track clips at each beat point to create edits matching the music rhythm.',
  'promptTemplates.templates.colorCorrection.name': 'Color Correction',
  'promptTemplates.templates.colorCorrection.description': 'Auto adjust video color balance',
  'promptTemplates.templates.colorCorrection.prompt':
    'Please analyze the selected video colors and provide color correction suggestions. Target style: {{style}}.',
  'promptTemplates.templates.colorCorrection.targetStyle': 'Target style',
  'promptTemplates.templates.colorCorrection.styleOptions.cinematic': 'Cinematic',
  'promptTemplates.templates.colorCorrection.styleOptions.fresh': 'Fresh',
  'promptTemplates.templates.colorCorrection.styleOptions.vintage': 'Vintage',
  'promptTemplates.templates.colorCorrection.styleOptions.highContrast': 'High contrast',
  'promptTemplates.templates.generateBRoll.name': 'Generate B-Roll',
  'promptTemplates.templates.generateBRoll.description':
    'Generate supplementary footage based on main video content',
  'promptTemplates.templates.generateBRoll.prompt':
    'Analyze the current video content and generate suitable B-Roll supplementary footage for the following time range: {{timeRange}}. Style requirements: {{style}}.',
  'promptTemplates.templates.generateBRoll.timeRange': 'Time range',
  'promptTemplates.templates.generateBRoll.style': 'Style',
  'promptTemplates.templates.generateThumbnail.name': 'Generate Thumbnail',
  'promptTemplates.templates.generateThumbnail.description':
    'Generate attractive cover image for video',
  'promptTemplates.templates.generateThumbnail.prompt':
    'Please generate an attractive cover image based on the current video content. Requirements: {{requirements}}.',
  'promptTemplates.templates.generateThumbnail.requirements': 'Requirements',
  'promptTemplates.templates.generateTransition.name': 'Generate Transition',
  'promptTemplates.templates.generateTransition.description':
    'Generate smooth transition effects between adjacent clips',
  'promptTemplates.templates.generateTransition.prompt':
    'Please generate suitable transition effects between the selected {{count}} adjacent video clips. Transition type: {{transitionType}}.',
  'promptTemplates.templates.generateTransition.clipCount': 'Number of clips',
  'promptTemplates.templates.generateTransition.transitionType': 'Transition type',
  'promptTemplates.templates.generateTransition.transitionTypes.fade': 'Fade',
  'promptTemplates.templates.generateTransition.transitionTypes.slide': 'Slide',
  'promptTemplates.templates.generateTransition.transitionTypes.zoom': 'Zoom',
  'promptTemplates.templates.generateTransition.transitionTypes.rotate': 'Rotate',
  'promptTemplates.templates.generateTransition.transitionTypes.auto': 'Auto',
  'promptTemplates.templates.analyzePacing.name': 'Analyze Pacing',
  'promptTemplates.templates.analyzePacing.description':
    'Analyze video editing rhythm and provide optimization suggestions',
  'promptTemplates.templates.analyzePacing.prompt':
    "Please analyze the current project's editing rhythm, including: 1) Clip duration distribution 2) Transition frequency 3) Shot type changes. And provide optimization suggestions.",
  'promptTemplates.templates.checkContinuity.name': 'Check Continuity',
  'promptTemplates.templates.checkContinuity.description':
    'Check visual continuity between video clips',
  'promptTemplates.templates.checkContinuity.prompt':
    'Please check the visual continuity between adjacent clips on the current timeline, find possible jump cuts or inconsistent places.',
  'promptTemplates.templates.analyzeAudio.name': 'Audio Analysis',
  'promptTemplates.templates.analyzeAudio.description': 'Analyze audio quality and issues',
  'promptTemplates.templates.analyzeAudio.prompt':
    'Please analyze the current video audio track, check: 1) Volume balance 2) Any noise 3) Voice clarity. And provide improvement suggestions.',
  'promptTemplates.templates.contentSummary.name': 'Content Summary',
  'promptTemplates.templates.contentSummary.description': 'Generate brief summary of video content',
  'promptTemplates.templates.contentSummary.prompt':
    'Please analyze the current video content and generate a brief summary, including: theme, key scenes, duration and suitable platform suggestions.',
} as const satisfies MessageBundle;
