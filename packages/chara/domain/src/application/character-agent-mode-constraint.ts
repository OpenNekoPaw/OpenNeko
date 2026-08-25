export interface CharacterAgentModeConstraint {
  readonly mode: 'companion' | 'narrative';
  readonly skills: 'configured' | 'none';
  readonly tools: 'configured' | 'none';
  readonly externalReferences: 'configured' | 'none';
}

export function projectCharacterAgentModeConstraint(
  mode: 'companion' | 'narrative',
): CharacterAgentModeConstraint {
  return mode === 'narrative'
    ? {
        mode,
        skills: 'none',
        tools: 'none',
        externalReferences: 'none',
      }
    : {
        mode,
        skills: 'configured',
        tools: 'configured',
        externalReferences: 'configured',
      };
}
