import { homedir } from 'node:os';
import { resolve } from 'node:path';

export function withCanonicalUserConfiguration(env, userHome = homedir()) {
  return {
    ...env,
    OPENNEKO_AGENT_EVAL_CONFIG_PATH: resolve(userHome, '.neko', 'config.toml'),
  };
}
