export function assertOrderedWorkflowEvents(assertion, steps) {
  let previous = { stepIndex: -1, itemIndex: -1, domain: undefined };
  const observed = [];
  for (const event of assertion.events) {
    const position = findEventPosition(event, steps, previous);
    if (!position) {
      throw new Error(`process event was not observed in order: ${JSON.stringify(event)}`);
    }
    observed.push({ event, stepIndex: position.stepIndex, itemIndex: position.itemIndex });
    previous = position;
  }
  return { observed };
}

function findEventPosition(event, steps, after) {
  const domain = event.kind;
  for (let stepIndex = Math.max(after.stepIndex, 0); stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    const items = eventItems(event, step);
    const start =
      stepIndex === after.stepIndex && domain === after.domain ? after.itemIndex + 1 : 0;
    for (let itemIndex = start; itemIndex < items.length; itemIndex += 1) {
      if (matchesProcessEvent(event, items[itemIndex])) {
        return { stepIndex, itemIndex, domain };
      }
    }
  }
  return undefined;
}

function eventItems(event, step) {
  if (event.kind === 'workflow-step') return [step];
  const snapshot = step?.snapshot;
  if (!snapshot) return [];
  if (event.kind === 'turn') return arrayOrEmpty(snapshot.turns);
  if (event.kind === 'tool') {
    return arrayOrEmpty(snapshot.turns).flatMap((turn) => arrayOrEmpty(turn?.toolCalls));
  }
  if (event.kind === 'timeline') {
    return arrayOrEmpty(snapshot.turns)
      .flatMap((turn) => arrayOrEmpty(turn?.timeline))
      .sort((left, right) => (left?.sequence ?? 0) - (right?.sequence ?? 0));
  }
  return [...arrayOrEmpty(snapshot.continuations)].sort(
    (left, right) => (left?.timestamp ?? 0) - (right?.timestamp ?? 0),
  );
}

function matchesProcessEvent(event, item) {
  if (event.kind === 'workflow-step') {
    return item?.id === event.stepId && (!event.method || item?.method === event.method);
  }
  if (event.kind === 'turn') {
    return (
      item?.role === event.role &&
      (!event.source || item?.source === event.source) &&
      (!event.contentContains || item?.content?.includes(event.contentContains))
    );
  }
  if (event.kind === 'timeline') {
    return (
      item?.kind === event.eventKind &&
      (!event.status || item?.status === event.status) &&
      (!event.toolName || item?.toolName === event.toolName) &&
      (!event.contentContains || item?.content?.includes(event.contentContains))
    );
  }
  if (event.kind === 'tool') {
    return item?.name === event.name && (!event.status || item?.status === event.status);
  }
  return item?.source === event.source && (!event.status || item?.status === event.status);
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}
