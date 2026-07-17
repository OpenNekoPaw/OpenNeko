import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  Agent,
  formatSkillInvocation,
  InMemorySessionRepo,
  loadSourcedSkills,
  type AgentEvent,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import {
  createAssistantMessageEventStream,
  InMemoryCredentialStore,
  Type,
  type AssistantMessage,
  type Model,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";

const FIXTURE_MODEL = {
  id: "fixture-model",
  name: "Fixture Model",
  api: "openai-completions",
  provider: "fixture-provider",
  baseUrl: "https://example.invalid/v1",
  reasoning: false,
  input: ["text"],
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  contextWindow: 4_096,
  maxTokens: 1_024,
} satisfies Model<"openai-completions">;

function assistantMessage(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
  errorMessage?: string,
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: FIXTURE_MODEL.api,
    provider: FIXTURE_MODEL.provider,
    model: FIXTURE_MODEL.id,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }),
    timestamp: Date.now(),
  };
}

function completedStream(message: AssistantMessage) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message });
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      stream.push({ type: "error", reason: message.stopReason, error: message });
      return;
    }
    stream.push({ type: "done", reason: message.stopReason, message });
  });
  return stream;
}

describe("Pi public API characterization", () => {
  it("emits lifecycle and tool events through Agent without a private executor", async () => {
    const parameters = Type.Object({ value: Type.String() });
    const tool: AgentTool<typeof parameters, { echoed: string }> = {
      name: "echo",
      label: "Echo",
      description: "Echo a value",
      parameters,
      async execute(_toolCallId, params, _signal, onUpdate) {
        onUpdate?.({
          content: [{ type: "text", text: "working" }],
          details: { echoed: params.value },
        });
        return {
          content: [{ type: "text", text: params.value }],
          details: { echoed: params.value },
        };
      },
    };
    const responses = [
      assistantMessage(
        [
          {
            type: "toolCall",
            id: "tool-call-1",
            name: "echo",
            arguments: { value: "hello" },
          },
        ],
        "toolUse",
      ),
      assistantMessage([{ type: "text", text: "done" }], "stop"),
    ];
    const events: AgentEvent[] = [];
    const agent = new Agent({
      initialState: {
        model: FIXTURE_MODEL,
        systemPrompt: "fixture",
        tools: [tool],
      },
      streamFn: () => {
        const response = responses.shift();
        if (response === undefined) {
          throw new Error("Unexpected extra Pi model turn");
        }
        return completedStream(response);
      },
    });
    agent.subscribe((event) => {
      events.push(event);
    });

    await agent.prompt("run the tool");

    expect(events.map((event) => event.type)).toEqual([
      "agent_start",
      "turn_start",
      "message_start",
      "message_end",
      "message_start",
      "message_end",
      "tool_execution_start",
      "tool_execution_update",
      "tool_execution_end",
      "message_start",
      "message_end",
      "turn_end",
      "turn_start",
      "message_start",
      "message_end",
      "turn_end",
      "agent_end",
    ]);
    expect(agent.state.messages).toHaveLength(4);
    expect(responses).toHaveLength(0);
  });

  it("propagates Agent.abort through the provider stream signal", async () => {
    let notifyStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    let observedSignal: AbortSignal | undefined;
    const agent = new Agent({
      initialState: { model: FIXTURE_MODEL },
      streamFn: (_model, _context, options?: SimpleStreamOptions) => {
        const stream = createAssistantMessageEventStream();
        observedSignal = options?.signal;
        queueMicrotask(() => {
          const partial = assistantMessage([], "stop");
          stream.push({ type: "start", partial });
          notifyStarted?.();
          options?.signal?.addEventListener(
            "abort",
            () => {
              const aborted = assistantMessage([], "aborted", "cancelled by test");
              stream.push({ type: "error", reason: "aborted", error: aborted });
            },
            { once: true },
          );
        });
        return stream;
      },
    });

    const prompt = agent.prompt("cancel me");
    await started;
    agent.abort();
    await prompt;

    expect(observedSignal?.aborted).toBe(true);
    expect(agent.state.errorMessage).toBe("cancelled by test");
    expect(agent.state.isStreaming).toBe(false);
  });

  it("reopens and forks a session through the public repository contract", async () => {
    const repo = new InMemorySessionRepo();
    const source = await repo.create({ id: "source" });
    const firstEntryId = await source.appendMessage({
      role: "user",
      content: "first",
      timestamp: 1,
    });
    await source.appendMessage(assistantMessage([{ type: "text", text: "second" }], "stop"));

    const reopened = await repo.open(await source.getMetadata());
    const reopenedContext = await reopened.buildContext();
    const branch = await repo.fork(await source.getMetadata(), {
      entryId: firstEntryId,
      position: "at",
      id: "branch",
    });
    await branch.appendMessage({ role: "user", content: "branch-only", timestamp: 2 });

    expect(reopenedContext.messages).toHaveLength(2);
    expect((await branch.getMetadata()).id).toBe("branch");
    expect(await source.getEntries()).toHaveLength(2);
    expect(await branch.getEntries()).toHaveLength(2);
  });

  it("preserves application-defined Skill provenance and formats invocation", async () => {
    const root = await mkdtemp(join(tmpdir(), "neko-pi-skills-"));
    const builtin = join(root, "builtin");
    const project = join(root, "project");
    const builtinSkill = join(builtin, "builtin-skill");
    const projectSkill = join(project, "project-skill");
    await mkdir(builtinSkill, { recursive: true });
    await mkdir(projectSkill, { recursive: true });
    await writeFile(
      join(builtinSkill, "SKILL.md"),
      "---\nname: builtin-skill\ndescription: Builtin fixture\n---\nBuiltin instructions.\n",
      "utf8",
    );
    await writeFile(
      join(projectSkill, "SKILL.md"),
      "---\nname: project-skill\ndescription: Project fixture\n---\nProject instructions.\n",
      "utf8",
    );
    const env = new NodeExecutionEnv({ cwd: root });

    try {
      const loaded = await loadSourcedSkills(env, [
        { path: builtin, source: { kind: "builtin" as const } },
        { path: project, source: { kind: "project" as const } },
      ]);

      expect(loaded.diagnostics).toEqual([]);
      expect(
        loaded.skills.map(({ skill, source }) => ({ name: skill.name, source: source.kind })),
      ).toEqual([
        { name: "builtin-skill", source: "builtin" },
        { name: "project-skill", source: "project" },
      ]);
      expect(formatSkillInvocation(loaded.skills[1]!.skill, "Use concise output")).toContain(
        "Use concise output",
      );
    } finally {
      await env.cleanup();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("serializes application-owned credential writes per provider", async () => {
    const store = new InMemoryCredentialStore();
    const observations: string[] = [];

    await Promise.all([
      store.modify("newapi", async (current) => {
        observations.push(`first:${current?.type ?? "missing"}`);
        await Promise.resolve();
        return { type: "api_key", key: "first" };
      }),
      store.modify("newapi", async (current) => {
        observations.push(`second:${current?.type ?? "missing"}`);
        return { type: "api_key", key: "second" };
      }),
    ]);

    expect(observations).toEqual(["first:missing", "second:api_key"]);
    expect(await store.read("newapi")).toEqual({ type: "api_key", key: "second" });
    await store.delete("newapi");
    expect(await store.read("newapi")).toBeUndefined();
  });
});
