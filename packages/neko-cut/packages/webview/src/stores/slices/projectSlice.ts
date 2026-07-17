/**
 * Project Slice
 * 管理项目数据和基本操作
 */

import { StateCreator } from 'zustand';
import type { ProjectData } from '../../types';

export interface ProjectSlice {
  // State
  project: ProjectData | null;
  /** Project root directory (.nkv file location) for resolving relative media paths */
  projectRoot: string | null;

  // Actions
  setProject: (project: ProjectData, projectRoot?: string) => void;
  updateProject: (updates: Partial<ProjectData>) => void;

  // Computed
  getTotalDuration: () => number;
}

export const createProjectSlice: StateCreator<ProjectSlice, [], [], ProjectSlice> = (set, get) => ({
  // Initial state
  project: null,
  projectRoot: null,

  // Actions
  setProject: (project, projectRoot) => {
    const newProjectRoot = projectRoot ?? get().projectRoot;
    set({
      project,
      projectRoot: newProjectRoot,
    });
  },

  updateProject: (updates) => {
    const { project } = get();
    if (!project) return;
    set({ project: { ...project, ...updates } });
  },

  // Computed
  getTotalDuration: () => {
    const { project } = get();
    if (!project) return 0;

    let maxEnd = 0;
    for (const track of project.tracks) {
      for (const element of track.elements) {
        const endTime = element.startTime + element.duration - element.trimStart - element.trimEnd;
        if (endTime > maxEnd) maxEnd = endTime;
      }
    }
    return maxEnd;
  },
});
