import { loadEnvFile } from 'node:process';
import path from 'node:path';

export function loadEnvironment(root) {
  try { loadEnvFile(path.join(root, '.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
