/**
 * Phase 8 — persistent audit trail for adversarial test attempts (both the deterministic
 * tool-executor scenarios and the live-agent demo). Same pattern as treasury/mandates/ and
 * treasury/settlements/: a tracked JSON file, no secrets, real record of what was actually
 * attempted and what actually happened on-chain.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOG_PATH = path.join(REPO_ROOT, 'treasury', 'adversarial-log.json');

export interface AdversarialLogEntry {
  timestamp: string;
  mode: 'deterministic' | 'live-agent';
  scenario: string;
  workflowId: string;
  inputs: Record<string, unknown>;
  expectedOutcome?: string;
  actualOutcome: string;
  passed?: boolean;
}

function readLog(): AdversarialLogEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  return JSON.parse(readFileSync(LOG_PATH, 'utf8')) as AdversarialLogEntry[];
}

export function logAdversarialAttempt(entry: Omit<AdversarialLogEntry, 'timestamp'>): void {
  const entries = readLog();
  entries.push({ timestamp: new Date().toISOString(), ...entry });
  mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2) + '\n');
}
