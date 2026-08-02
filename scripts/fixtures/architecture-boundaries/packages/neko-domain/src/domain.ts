import { ipcRenderer } from 'electron';
import { shellFixture } from '../../../../apps/neko-desktop/src/main/shell';

export const domainFixture = { ipcRenderer, shellFixture };
