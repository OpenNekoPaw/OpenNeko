import type * as vscode from 'vscode';

import type { SkillHostRecord } from '@neko/agent/pi';
import type { AgentMessageRuntimeRequest } from '@neko/agent/runtime';

export interface SkillHandlerDeps {
  readonly listSkills?: () => Promise<readonly SkillHostRecord[]>;
  readonly invoke?: (webview: vscode.Webview, request: AgentMessageRuntimeRequest) => Promise<void>;
}

/** Thin Host presenter for the Pi Skill catalog and explicit Skill turns. */
export class SkillHandler {
  private deps: SkillHandlerDeps;

  constructor(deps: SkillHandlerDeps = {}) {
    this.deps = deps;
  }

  setDependencies(deps: SkillHandlerDeps): void {
    this.deps = deps;
  }

  async sendSkillsList(webview: vscode.Webview): Promise<void> {
    const skills = await this.requireListSkills()();
    await webview.postMessage({
      type: 'skillsList',
      skills: skills.map(projectSkillSummary),
    });
  }

  handleSkillInvocation(
    webview: vscode.Webview,
    skillName: string,
    conversationId: string,
    args?: string,
  ): Promise<void> {
    const normalizedName = skillName.trim();
    if (!normalizedName) throw new Error('Pi Skill invocation requires a Skill name.');
    const suffix = args?.trim();
    return this.requireInvoke()(webview, {
      conversationId,
      messageText: `$${normalizedName}${suffix ? ` ${suffix}` : ''}`,
      sessionMode: 'agent',
    });
  }

  private requireListSkills(): NonNullable<SkillHandlerDeps['listSkills']> {
    if (!this.deps.listSkills) throw new Error('Pi Skill catalog is unavailable.');
    return this.deps.listSkills;
  }

  private requireInvoke(): NonNullable<SkillHandlerDeps['invoke']> {
    if (!this.deps.invoke) throw new Error('Pi Skill invocation runtime is unavailable.');
    return this.deps.invoke;
  }
}

function projectSkillSummary(record: SkillHostRecord) {
  return {
    name: record.name,
    description: record.description,
    source: record.source.kind,
    enabled: record.enabled && record.trusted,
    type: 'skill' as const,
  };
}
