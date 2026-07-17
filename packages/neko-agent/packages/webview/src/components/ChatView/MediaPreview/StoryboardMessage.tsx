/**
 * StoryboardMessage - Scene-grouped storyboard display (ADR-3)
 *
 * Renders a generated storyboard as scene-grouped image grid with:
 * - Scene heading (INT/EXT, location, time of day)
 * - Shot images in a responsive grid per scene
 * - "Regenerate" and "Edit in Canvas ↗" action buttons per scene
 *
 * This is the ADR-3 "chat as creative decision timeline" embodiment.
 */

import { useState, useCallback, memo } from 'react';
import { ChevronDownIcon as ChevronIcon } from '@neko/shared/icons';
import { AgentHostMessages } from '@/messages';
import { SendToMenu, type PluginsAvailable } from '@/components/ChatView/SendToMenu';
import { projectStoryboardScenesAssetBatch } from '@/presenters/storyboard-transfer-presenter';

/** A single shot within a scene */
export interface StoryboardShot {
  /** Webview-safe image URI */
  url: string;
  /** Original local file path */
  localPath?: string;
  /** Shot scale label */
  shotScale?: string;
  /** Shot index within the scene */
  shotIndex: number;
}

/** A single scene group */
export interface StoryboardScene {
  sceneIndex: number;
  /** Scene heading (e.g. "INT. CAFE - DAY") */
  heading: string;
  shots: StoryboardShot[];
}

interface StoryboardMessageProps {
  /** Scenes with their shots */
  scenes: StoryboardScene[];
  /** Available neko-suite plugins for "Send to" */
  plugins?: PluginsAvailable;
  /** Callback to regenerate a specific scene */
  onRegenerateScene?: (sceneIndex: number) => void;
  className?: string;
}

function StoryboardMessageComponent({
  scenes,
  plugins,
  onRegenerateScene,
  className,
}: StoryboardMessageProps) {
  const assetBatchPayload = projectStoryboardScenesAssetBatch(scenes);

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {scenes.map((scene) => (
        <SceneGroup
          key={`scene-${scene.sceneIndex}`}
          scene={scene}
          plugins={plugins}
          assetBatchPayload={assetBatchPayload}
          onRegenerate={onRegenerateScene}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SceneGroup - A single scene with its shots
// ---------------------------------------------------------------------------

function SceneGroup({
  scene,
  plugins,
  assetBatchPayload,
  onRegenerate,
}: {
  scene: StoryboardScene;
  plugins?: PluginsAvailable;
  assetBatchPayload?: ReturnType<typeof projectStoryboardScenesAssetBatch>;
  onRegenerate?: (sceneIndex: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleOpenShot = useCallback((shot: StoryboardShot) => {
    const pathToOpen = shot.localPath ?? shot.url;
    if (pathToOpen.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pathToOpen)) {
      AgentHostMessages.openFile(pathToOpen);
    } else {
      AgentHostMessages.openUrl(pathToOpen);
    }
  }, []);

  // Determine grid columns based on shot count
  const cols = scene.shots.length <= 2 ? scene.shots.length : 3;

  return (
    <div className="rounded border border-[var(--vscode-panel-border)] overflow-hidden">
      {/* Scene heading */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] cursor-pointer
          bg-[color-mix(in_srgb,var(--vscode-textBlockQuote-background)_95%,#3b82f6)]
          hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <SceneIcon className="w-3 h-3 text-[var(--vscode-charts-blue)] shrink-0" />
        <span className="font-medium text-[var(--vscode-foreground)]">
          Scene {scene.sceneIndex}
        </span>
        <span className="text-[var(--vscode-descriptionForeground)] truncate flex-1 text-[10px]">
          {scene.heading}
        </span>
        <span className="text-[10px] text-[var(--vscode-descriptionForeground)] shrink-0">
          {scene.shots.length} shots
        </span>
        <ChevronIcon
          className={`w-3 h-3 text-[var(--vscode-descriptionForeground)] transition-transform shrink-0
            ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Shot grid */}
      {isExpanded && (
        <div className="p-2 bg-[var(--vscode-editor-background)]">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {scene.shots.map((shot) => (
              <div
                key={`shot-${shot.shotIndex}`}
                className="relative cursor-pointer group rounded overflow-hidden"
                onClick={() => handleOpenShot(shot)}
              >
                <img
                  src={shot.url}
                  alt={`Scene ${scene.sceneIndex} Shot ${shot.shotIndex}`}
                  className="w-full aspect-video object-cover group-hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
                {/* Shot label */}
                <div className="absolute top-1 left-1 px-1 py-0.5 bg-black/60 rounded text-[8px] text-white/80">
                  {shot.shotScale ?? `Shot ${shot.shotIndex}`}
                </div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 mt-2">
            {onRegenerate && (
              <button
                onClick={() => onRegenerate(scene.sceneIndex)}
                className="px-1.5 py-0.5 rounded text-[10px]
                  bg-[var(--vscode-button-secondaryBackground)]
                  hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                  text-[var(--vscode-button-secondaryForeground)]
                  transition-colors"
              >
                ↻ Regenerate
              </button>
            )}
            <span className="flex-1" />
            {assetBatchPayload && plugins && (
              <>
                <SendToMenu
                  payload={assetBatchPayload}
                  mediaType="image"
                  plugins={plugins}
                  allowedTargets={['explorer']}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const StoryboardMessage = memo(StoryboardMessageComponent);

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SceneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
      />
    </svg>
  );
}
