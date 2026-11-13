import {
  compactRecording,
  compatibilityKey,
  type ControlMode,
  type DifficultyId,
  type OutcomeKind,
  type Recording,
} from '../sim';

export type Quality = 'low' | 'medium' | 'high';
export type MotionPref = 'system' | 'reduce' | 'full';
export type TouchPref = 'auto' | 'on' | 'off';

export interface Settings {
  difficulty: DifficultyId;
  controlMode: ControlMode;
  volume: number;
  muted: boolean;
  quality: Quality;
  motion: MotionPref;
  touch: TouchPref;
  ghost: boolean;
  tutorialSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'training',
  controlMode: 'assisted',
  volume: 0.7,
  muted: false,
  quality: 'high',
  motion: 'system',
  touch: 'auto',
  ghost: true,
  tutorialSeen: false,
};

export interface AttemptSummary {
  id: string;
  createdAt: string;
  key: string;
  scenarioId: DifficultyId;
  controlMode: ControlMode;
  seed: number;
  pilot: 'player' | 'demo';
  outcome: OutcomeKind;
  touchdownSpeed: number;
  distance: number;
  fuelFraction: number;
  duration: number;
}

export interface StoredData {
  storageVersion: 1;
  settings: Settings;
  /** Best successful landing per compatibility key (lowest touchdown speed, then closest). */
  bests: Record<string, AttemptSummary>;
  recent: AttemptSummary[];
  replays: Recording[];
}

const KEY = 'boostback:v1';
export const MAX_RECENT = 20;
export const MAX_REPLAYS = 5;

function empty(): StoredData {
  return { storageVersion: 1, settings: { ...DEFAULT_SETTINGS }, bests: {}, recent: [], replays: [] };
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadData(): StoredData {
  const ls = storage();
  if (!ls) return empty();
  try {
    const raw = ls.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    if (parsed.storageVersion !== 1) return empty();
    return {
      storageVersion: 1,
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      bests: parsed.bests ?? {},
      recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT) : [],
      replays: Array.isArray(parsed.replays) ? parsed.replays.slice(0, MAX_REPLAYS) : [],
    };
  } catch {
    return empty();
  }
}

/**
 * Save, shedding the oldest stored replays if the browser quota is exceeded.
 * Returns false if even the minimal data could not be written.
 */
export function saveData(data: StoredData): boolean {
  const ls = storage();
  if (!ls) return false;
  const attempt = { ...data, replays: data.replays.slice() };
  for (;;) {
    try {
      ls.setItem(KEY, JSON.stringify(attempt));
      return true;
    } catch {
      if (attempt.replays.length === 0) return false;
      attempt.replays.pop();
    }
  }
}

export function clearHistory(data: StoredData): StoredData {
  return { ...data, bests: {}, recent: [], replays: [] };
}

export function summarize(rec: Recording): AttemptSummary | null {
  const r = rec.report;
  if (!r) return null;
  return {
    id: rec.id,
    createdAt: rec.createdAt,
    key: compatibilityKey(rec.scenario, rec.controlMode),
    scenarioId: rec.scenarioId,
    controlMode: rec.controlMode,
    seed: rec.seed,
    pilot: rec.pilot,
    outcome: r.outcome,
    touchdownSpeed: Math.max(0, -r.vy),
    distance: r.distanceFromCenter,
    fuelFraction: r.fuelFraction,
    duration: r.t,
  };
}

function better(a: AttemptSummary, b: AttemptSummary | undefined) {
  if (!b) return true;
  if (Math.abs(a.touchdownSpeed - b.touchdownSpeed) > 0.05) return a.touchdownSpeed < b.touchdownSpeed;
  return a.distance < b.distance;
}

/** Record a finished attempt. Demo flights are kept out of bests and history. */
export function recordAttempt(data: StoredData, rec: Recording): { data: StoredData; newBest: boolean } {
  const sum = summarize(rec);
  if (!sum || rec.pilot === 'demo') return { data, newBest: false };
  const bests = { ...data.bests };
  let newBest = false;
  if (sum.outcome === 'landed' && better(sum, bests[sum.key])) {
    newBest = true;
    bests[sum.key] = sum;
  }
  const recent = [sum, ...data.recent].slice(0, MAX_RECENT);
  const replays = [compactRecording(rec), ...data.replays].slice(0, MAX_REPLAYS);
  return { data: { ...data, bests, recent, replays }, newBest };
}

export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
