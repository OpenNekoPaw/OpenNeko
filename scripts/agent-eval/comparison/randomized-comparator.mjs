export function createRandomizedEvidenceComparison(input, options = {}) {
  const swap = (options.random ?? Math.random)() >= 0.5;
  const ordered = swap
    ? [input.rightEvidence, input.leftEvidence]
    : [input.leftEvidence, input.rightEvidence];
  return {
    projection: {
      schema: 'neko.agent-eval.randomized-comparison.v2',
      publicContract: input.publicContract,
      options: [
        { id: 'option-1', evidence: ordered[0] },
        { id: 'option-2', evidence: ordered[1] },
      ],
    },
    mapping: swap
      ? { 'option-1': input.rightId, 'option-2': input.leftId }
      : { 'option-1': input.leftId, 'option-2': input.rightId },
  };
}

export function resolveRandomizedPreference(selection, mapping) {
  const resolved = mapping[selection];
  if (!resolved) throw new Error(`unknown randomized comparison option: ${selection}`);
  return resolved;
}
