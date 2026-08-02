// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentContextPayload } from '@neko/agent-contracts';
import type { ContentLocator } from '@neko/content';
import { AgentContextChip } from './AgentContextChip';

describe('AgentContextChip', () => {
  it('projects the canonical context discriminator for functional evidence', () => {
    const payload: AgentContextPayload = {
      type: '3d-reference',
      id: '3d-reference:fixture:1',
      label: 'Neutral mannequin',
      summary: 'Pose and camera reference',
      data: {
        contractVersion: 1,
        staging: {
          schemaVersion: 1,
          sessionId: 'fixture',
          revision: 1,
          subject: {
            kind: 'builtin-preset',
            presetId: 'guide-neutral-mannequin',
            presetVersion: 1,
            fingerprint: 'preset-fingerprint',
            presetKind: 'mannequin',
            appearancePolicy: 'guide-only',
            allowedPurposes: ['pose', 'camera'],
          },
          selectedPurposes: ['pose', 'camera'],
          camera: {
            cameraId: 'front',
            position: { x: 0, y: 1, z: 3 },
            target: { x: 0, y: 1, z: 0 },
            fieldOfViewDeg: 45,
            aspectRatio: 1,
          },
          pose: { poseId: 'standing', joints: [] },
        },
        outputs: [
          {
            kind: 'pose',
            sessionId: 'fixture',
            revision: 1,
            controlImage: contentLocator('pose-control'),
            controlMode: 'pose',
            joints: [],
          },
          {
            kind: 'camera',
            sessionId: 'fixture',
            revision: 1,
            camera: {
              cameraId: 'front',
              position: { x: 0, y: 1, z: 3 },
              target: { x: 0, y: 1, z: 0 },
              fieldOfViewDeg: 45,
              aspectRatio: 1,
            },
          },
        ],
      },
    };
    const { container } = render(<AgentContextChip payload={payload} />);

    expect(container.querySelector('[data-agent-context-type="3d-reference"]')).not.toBeNull();
    expect(screen.getByText('Neutral mannequin')).toBeTruthy();
    expect(screen.getByText('pose · camera · guide-only')).toBeTruthy();
  });
});

function contentLocator(id: string): ContentLocator {
  return { kind: 'workspace-file', path: `references/${id}.png` };
}
