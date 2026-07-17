import type {
  NarrativeConnectionSnapshot,
  NarrativeGraphSnapshot,
  NarrativeNodeSnapshot,
  VariableEffect,
} from './narrative-preview';

export type NarrativeRuntimeStatus = 'idle' | 'playing' | 'waiting-choice' | 'ended' | 'error';

export type NarrativeVariableValue = string | number | boolean | null;

export type NarrativeRuntimeVariables = Readonly<Record<string, NarrativeVariableValue>>;

export interface NarrativeChoiceOption {
  readonly connection: NarrativeConnectionSnapshot;
  readonly label: string;
  readonly targetNodeId: string;
  readonly condition?: string;
  readonly conditionMet: boolean;
  readonly disabled: boolean;
  readonly diagnostics: readonly ConditionDiagnostic[];
}

export interface NarrativeHistoryEntry {
  readonly nodeId: string;
  readonly variables: NarrativeRuntimeVariables;
  readonly choiceIndex?: number;
}

export interface NarrativeEndingStats {
  readonly endingNodeId: string;
  readonly endingLabel?: string;
  readonly visitedCount: number;
  readonly totalNodes: number;
  readonly pathTaken: readonly string[];
  readonly variableSnapshot: NarrativeRuntimeVariables;
}

export interface NarrativeRuntimeState {
  readonly status: NarrativeRuntimeStatus;
  readonly revision: number;
  readonly graph?: NarrativeGraphSnapshot;
  readonly currentNode?: NarrativeNodeSnapshot;
  readonly variables: NarrativeRuntimeVariables;
  readonly history: readonly NarrativeHistoryEntry[];
  readonly path: readonly string[];
  readonly choices: readonly NarrativeChoiceOption[];
  readonly endingStats?: NarrativeEndingStats;
  readonly diagnostics: readonly NarrativeRuntimeDiagnostic[];
}

export type NarrativeRuntimeDiagnosticCode =
  | 'runtime-no-graph'
  | 'runtime-no-entry'
  | 'runtime-node-missing'
  | 'runtime-choice-disabled'
  | 'runtime-choice-target-missing'
  | 'runtime-unsupported-variable-effect';

export interface NarrativeRuntimeDiagnostic {
  readonly code: NarrativeRuntimeDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly nodeId?: string;
}

export type ConditionEvaluationStatus = 'supported' | 'unsupported' | 'missing-variable';

export interface ConditionDiagnostic {
  readonly code: 'condition-unsupported' | 'condition-missing-variable';
  readonly message: string;
  readonly variableName?: string;
}

export interface ConditionEvaluationResult {
  readonly status: ConditionEvaluationStatus;
  readonly result: boolean;
  readonly diagnostics: readonly ConditionDiagnostic[];
}

export interface NarrativeRuntimeOptions {
  readonly conditionEvaluator?: ConditionEvaluator;
}

export interface ConditionEvaluator {
  evaluate(
    expression: string | undefined,
    variables: NarrativeRuntimeVariables,
  ): ConditionEvaluationResult;
}

const COMPARISON_PATTERN =
  /^([A-Za-z_][A-Za-z0-9_]*)\s*(==|!=|>=|<=|>|<)\s*(true|false|null|-?\d+(?:\.\d+)?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/;
const TRUTHY_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)$/;
const NEGATED_PATTERN = /^!\s*([A-Za-z_][A-Za-z0-9_]*)$/;

export class WhitelistConditionEvaluator implements ConditionEvaluator {
  evaluate(
    expression: string | undefined,
    variables: NarrativeRuntimeVariables,
  ): ConditionEvaluationResult {
    const condition = expression?.trim();
    if (!condition) {
      return supported(true);
    }

    const comparison = COMPARISON_PATTERN.exec(condition);
    if (comparison) {
      const variableName = comparison[1] ?? '';
      const operator = comparison[2] ?? '==';
      const expected = parseLiteral(comparison[3] ?? '');
      const actual = variables[variableName];
      if (actual === undefined) {
        return missingVariable(variableName);
      }
      return supported(compareValues(actual, expected, operator));
    }

    const truthy = TRUTHY_PATTERN.exec(condition);
    if (truthy) {
      const variableName = truthy[1] ?? '';
      const actual = variables[variableName];
      if (actual === undefined) {
        return missingVariable(variableName);
      }
      return supported(Boolean(actual));
    }

    const negated = NEGATED_PATTERN.exec(condition);
    if (negated) {
      const variableName = negated[1] ?? '';
      const actual = variables[variableName];
      if (actual === undefined) {
        return missingVariable(variableName);
      }
      return supported(!actual);
    }

    return {
      status: 'unsupported',
      result: false,
      diagnostics: [
        {
          code: 'condition-unsupported',
          message: `Unsupported condition syntax: ${condition}`,
        },
      ],
    };
  }
}

export function createDefaultConditionEvaluator(): ConditionEvaluator {
  return new WhitelistConditionEvaluator();
}

export class NarrativeRuntime {
  private graph: NarrativeGraphSnapshot | undefined;
  private currentNodeId: string | undefined;
  private variables: NarrativeRuntimeVariables = {};
  private history: NarrativeHistoryEntry[] = [];
  private path: string[] = [];
  private diagnostics: NarrativeRuntimeDiagnostic[] = [];
  private status: NarrativeRuntimeState['status'] = 'idle';
  private readonly conditionEvaluator: ConditionEvaluator;

  constructor(options: NarrativeRuntimeOptions = {}) {
    this.conditionEvaluator = options.conditionEvaluator ?? createDefaultConditionEvaluator();
  }

  get state(): NarrativeRuntimeState {
    const currentNode = this.getCurrentNode();
    const choices = currentNode ? this.getChoicesForNode(currentNode.nodeId) : [];
    return {
      status: this.status,
      revision: this.graph?.revision ?? 0,
      ...(this.graph ? { graph: this.graph } : {}),
      ...(currentNode ? { currentNode } : {}),
      variables: this.variables,
      history: this.history,
      path: this.path,
      choices,
      ...(this.status === 'ended' && currentNode
        ? { endingStats: this.createEndingStats(currentNode) }
        : {}),
      diagnostics: this.diagnostics,
    };
  }

  load(snapshot: NarrativeGraphSnapshot): NarrativeRuntimeState {
    this.graph = snapshot;
    this.variables = createInitialVariables(snapshot);
    this.history = [];
    this.path = [];
    this.diagnostics = [];
    this.currentNodeId = undefined;
    this.status = 'idle';
    return this.state;
  }

  start(): NarrativeRuntimeState {
    const graph = this.requireGraph();
    if (!graph) return this.state;

    const entryNodeId = resolveEntryNodeId(graph);
    if (!entryNodeId) {
      this.status = 'error';
      this.diagnostics = [
        {
          code: 'runtime-no-entry',
          severity: 'error',
          message: 'Narrative graph has no playable entry node.',
        },
      ];
      return this.state;
    }

    this.history = [];
    this.path = [entryNodeId];
    return this.enterNode(entryNodeId);
  }

  reset(): NarrativeRuntimeState {
    if (!this.graph) return this.state;
    this.variables = createInitialVariables(this.graph);
    this.history = [];
    this.path = [];
    this.currentNodeId = undefined;
    this.diagnostics = [];
    this.status = 'idle';
    return this.state;
  }

  advance(choiceIndex?: number): NarrativeRuntimeState {
    const graph = this.requireGraph();
    const current = this.getCurrentNode();
    if (!graph || !current) return this.state;

    const choices = this.getChoicesForNode(current.nodeId);
    if (choices.length === 0) {
      this.status = current.type === 'narrative-ending' ? 'ended' : 'waiting-choice';
      return this.state;
    }

    const index = choiceIndex ?? 0;
    const selected = choices[index];
    if (!selected || selected.disabled) {
      this.diagnostics = [
        ...this.diagnostics,
        {
          code: 'runtime-choice-disabled',
          severity: 'warning',
          message: 'The selected choice is unavailable.',
          nodeId: current.nodeId,
        },
      ];
      this.status = 'waiting-choice';
      return this.state;
    }

    const target = findNode(graph, selected.targetNodeId);
    if (!target) {
      this.status = 'error';
      this.diagnostics = [
        ...this.diagnostics,
        {
          code: 'runtime-choice-target-missing',
          severity: 'error',
          message: `Choice target "${selected.targetNodeId}" is missing.`,
          nodeId: current.nodeId,
        },
      ];
      return this.state;
    }

    this.history = [
      ...this.history,
      {
        nodeId: current.nodeId,
        variables: this.variables,
        choiceIndex: index,
      },
    ];
    this.path = [...this.path, target.nodeId];
    return this.enterNode(target.nodeId);
  }

  stepBack(): NarrativeRuntimeState {
    const previous = this.history[this.history.length - 1];
    if (!previous) return this.state;

    this.history = this.history.slice(0, -1);
    this.variables = previous.variables;
    this.currentNodeId = previous.nodeId;
    this.path = this.path.slice(0, Math.max(1, this.path.lastIndexOf(previous.nodeId) + 1));
    this.status = this.getChoicesForNode(previous.nodeId).length > 0 ? 'waiting-choice' : 'playing';
    return this.state;
  }

  jumpTo(nodeId: string): NarrativeRuntimeState {
    const graph = this.requireGraph();
    if (!graph) return this.state;
    if (!findNode(graph, nodeId)) {
      this.status = 'error';
      this.diagnostics = [
        ...this.diagnostics,
        {
          code: 'runtime-node-missing',
          severity: 'error',
          message: `Narrative node "${nodeId}" is missing.`,
          nodeId,
        },
      ];
      return this.state;
    }

    this.history = [];
    this.path = [nodeId];
    return this.enterNode(nodeId);
  }

  setVariables(values: Readonly<Record<string, unknown>>): NarrativeRuntimeState {
    this.variables = normalizeVariableRecord(values);
    return this.state;
  }

  getChoicesForNode(nodeId: string): readonly NarrativeChoiceOption[] {
    const graph = this.graph;
    if (!graph) return [];

    return graph.connections
      .filter((connection) => connection.sourceNodeId === nodeId)
      .slice()
      .sort((left, right) => left.priority - right.priority)
      .map((connection) => this.toChoiceOption(connection));
  }

  private enterNode(nodeId: string): NarrativeRuntimeState {
    const graph = this.requireGraph();
    if (!graph) return this.state;
    const node = findNode(graph, nodeId);
    if (!node) {
      this.status = 'error';
      this.diagnostics = [
        ...this.diagnostics,
        {
          code: 'runtime-node-missing',
          severity: 'error',
          message: `Narrative node "${nodeId}" is missing.`,
          nodeId,
        },
      ];
      return this.state;
    }

    this.currentNodeId = nodeId;
    this.variables = applySceneVariableEffects(
      this.variables,
      node.scene?.variableEffects ?? [],
      (variableId) => resolveVariableKey(variableId, graph),
      (diagnostic) => {
        this.diagnostics = [...this.diagnostics, { ...diagnostic, nodeId }];
      },
    );

    if (node.type === 'narrative-ending') {
      this.status = 'ended';
      return this.state;
    }

    this.status = this.getChoicesForNode(nodeId).length > 0 ? 'waiting-choice' : 'playing';
    return this.state;
  }

  private requireGraph(): NarrativeGraphSnapshot | undefined {
    if (this.graph) return this.graph;
    this.status = 'error';
    this.diagnostics = [
      {
        code: 'runtime-no-graph',
        severity: 'error',
        message: 'Narrative runtime has no graph loaded.',
      },
    ];
    return undefined;
  }

  private getCurrentNode(): NarrativeNodeSnapshot | undefined {
    return this.graph && this.currentNodeId ? findNode(this.graph, this.currentNodeId) : undefined;
  }

  private toChoiceOption(connection: NarrativeConnectionSnapshot): NarrativeChoiceOption {
    const evaluation = this.conditionEvaluator.evaluate(connection.condition, this.variables);
    return {
      connection,
      label: connection.choiceText ?? 'Continue',
      targetNodeId: connection.targetNodeId,
      condition: connection.condition,
      conditionMet: evaluation.result,
      disabled: !evaluation.result,
      diagnostics: evaluation.diagnostics,
    };
  }

  private createEndingStats(node: NarrativeNodeSnapshot): NarrativeEndingStats {
    const totalNodes = this.graph?.nodes.length ?? 0;
    return {
      endingNodeId: node.nodeId,
      endingLabel: node.ending?.endingLabel ?? node.label,
      visitedCount: new Set(this.path).size,
      totalNodes,
      pathTaken: this.path,
      variableSnapshot: this.variables,
    };
  }
}

function createInitialVariables(snapshot: NarrativeGraphSnapshot): NarrativeRuntimeVariables {
  const values: Record<string, NarrativeVariableValue> = {};
  for (const variable of snapshot.metadata.variables ?? []) {
    values[variable.name] = normalizeVariableValue(variable.value);
  }
  return values;
}

function normalizeVariableRecord(
  values: Readonly<Record<string, unknown>>,
): NarrativeRuntimeVariables {
  const result: Record<string, NarrativeVariableValue> = {};
  for (const [key, value] of Object.entries(values)) {
    result[key] = normalizeVariableValue(value);
  }
  return result;
}

function normalizeVariableValue(value: unknown): NarrativeVariableValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : null;
}

function applySceneVariableEffects(
  variables: NarrativeRuntimeVariables,
  effects: readonly VariableEffect[],
  resolveVariableKey: (variableId: string) => string,
  report: (diagnostic: NarrativeRuntimeDiagnostic) => void,
): NarrativeRuntimeVariables {
  let next: Record<string, NarrativeVariableValue> = { ...variables };
  for (const effect of effects) {
    const variableKey = resolveVariableKey(effect.variableId);
    const current = next[variableKey];
    const value = normalizeVariableValue(effect.value);
    switch (effect.operation) {
      case 'set':
        next = { ...next, [variableKey]: value };
        break;
      case 'add':
      case 'subtract':
        if (typeof current === 'number' && typeof value === 'number') {
          next = {
            ...next,
            [variableKey]: effect.operation === 'add' ? current + value : current - value,
          };
        } else {
          report({
            code: 'runtime-unsupported-variable-effect',
            severity: 'warning',
            message: `Variable effect "${effect.operation}" requires numeric values.`,
          });
        }
        break;
      case 'toggle':
        if (typeof current === 'boolean') {
          next = { ...next, [variableKey]: !current };
        } else {
          report({
            code: 'runtime-unsupported-variable-effect',
            severity: 'warning',
            message: 'Variable effect "toggle" requires a boolean value.',
          });
        }
        break;
    }
  }
  return next;
}

function resolveVariableKey(variableId: string, snapshot: NarrativeGraphSnapshot): string {
  return (
    snapshot.metadata.variables.find((variable) => variable.id === variableId)?.name ?? variableId
  );
}

function resolveEntryNodeId(snapshot: NarrativeGraphSnapshot): string | undefined {
  return (
    snapshot.nodes.find((node) => node.type === 'narrative-start')?.nodeId ??
    snapshot.metadata.entryNodeId ??
    snapshot.nodes[0]?.nodeId
  );
}

function findNode(
  snapshot: NarrativeGraphSnapshot,
  nodeId: string,
): NarrativeNodeSnapshot | undefined {
  return snapshot.nodes.find((node) => node.nodeId === nodeId);
}

function parseLiteral(raw: string): NarrativeVariableValue {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d/.test(raw)) return Number(raw);
  return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
}

function compareValues(
  actual: NarrativeVariableValue,
  expected: NarrativeVariableValue,
  operator: string,
): boolean {
  switch (operator) {
    case '==':
      return actual === expected;
    case '!=':
      return actual !== expected;
    case '>':
    case '>=':
    case '<':
    case '<=':
      return compareOrderedValues(actual, expected, operator);
    default:
      return false;
  }
}

function compareOrderedValues(
  actual: NarrativeVariableValue,
  expected: NarrativeVariableValue,
  operator: string,
): boolean {
  if (typeof actual !== 'number' || typeof expected !== 'number') {
    return false;
  }

  switch (operator) {
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
    default:
      return false;
  }
}

function supported(result: boolean): ConditionEvaluationResult {
  return { status: 'supported', result, diagnostics: [] };
}

function missingVariable(variableName: string): ConditionEvaluationResult {
  return {
    status: 'missing-variable',
    result: false,
    diagnostics: [
      {
        code: 'condition-missing-variable',
        message: `Condition variable "${variableName}" is not defined.`,
        variableName,
      },
    ],
  };
}
