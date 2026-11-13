import { create } from 'zustand';
import {
  compatibilityKey,
  PRESETS,
  validateRecording,
  type DifficultyId,
  type FlightEvent,
  type GuidanceId,
  type Recording,
} from '../sim';
import { audio } from './audio';
import {
  clearHistory,
  loadData,
  recordAttempt,
  saveData,
  type Settings,
  type StoredData,
} from './persistence';
import { runtime } from './runtime';

/** Explicit application states. */
export type AppPhase = 'ready' | 'tutorial' | 'playing' | 'paused' | 'landed' | 'failed' | 'replay';
export type Panel = null | 'settings' | 'about';

export interface ReplayOverlays {
  path: boolean;
  velocity: boolean;
  thrust: boolean;
  boundary: boolean;
}

interface GameState {
  phase: AppPhase;
  /** Phase to return to when the tutorial closes. */
  tutorialReturn: 'ready' | 'start';
  settings: Settings;
  data: StoredData;
  panel: Panel;
  message: GuidanceId | null;
  demo: boolean;
  lastRecording: Recording | null;
  newBest: boolean;
  /** Where "Back" from a replay goes. */
  replaySource: 'result' | 'library';
  replayPlaying: boolean;
  replaySpeed: number;
  replayCamera: 'side' | 'cinematic';
  overlays: ReplayOverlays;
  storageWarning: string | null;
  toast: string | null;
  /** Increments for every new flight (drives the start curtain). */
  attempt: number;

  init(): void;
  setDifficulty(id: DifficultyId): void;
  updateSettings(patch: Partial<Settings>): void;
  openPanel(p: Panel): void;
  openTutorial(fromStart: boolean): void;
  closeTutorial(start: boolean): void;
  startDescent(): void;
  watchDemo(): void;
  beginFlight(demo: boolean): void;
  pause(): void;
  resume(): void;
  restart(): void;
  toMenu(): void;
  watchReplay(rec?: Recording, source?: 'result' | 'library'): void;
  exitReplay(): void;
  setReplayPlaying(p: boolean): void;
  setReplaySpeed(s: number): void;
  setReplayCamera(c: 'side' | 'cinematic'): void;
  toggleOverlay(k: keyof ReplayOverlays): void;
  importRecording(json: string): string | null;
  clearHistory(): void;
  showToast(text: string): void;
}

let endTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function persist(data: StoredData, set: (p: Partial<GameState>) => void) {
  if (!saveData(data)) set({ storageWarning: 'Browser storage is unavailable or full; history will not be kept.' });
}

/** Most recent compatible player attempt, used as the "Previous attempt" ghost. */
function pickGhost(state: GameState): Recording | null {
  if (!state.settings.ghost) return null;
  const key = compatibilityKey(runtime.scenario, state.settings.controlMode);
  const candidates = [state.lastRecording, ...state.data.replays].filter(
    (r): r is Recording => !!r && r.pilot === 'player' && compatibilityKey(r.scenario, r.controlMode) === key,
  );
  return candidates[0] ?? null;
}

export const useGame = create<GameState>()((set, get) => ({
  phase: 'ready',
  tutorialReturn: 'ready',
  settings: loadData().settings,
  data: loadData(),
  panel: null,
  message: null,
  demo: false,
  lastRecording: null,
  newBest: false,
  replaySource: 'result',
  replayPlaying: false,
  replaySpeed: 1,
  replayCamera: 'side',
  overlays: { path: true, velocity: false, thrust: false, boundary: true },
  storageWarning: null,
  toast: null,
  attempt: 0,

  init() {
    const data = loadData();
    set({ data, settings: data.settings });
    runtime.load(PRESETS[data.settings.difficulty], data.settings.controlMode);
    audio.setVolume(data.settings.volume, data.settings.muted);

    runtime.listeners = {
      onMessage: (id) => set({ message: id }),
      onEvent: (ev: FlightEvent) => {
        if (ev.type === 'legsCommanded' || ev.type === 'legsAuto') audio.legs();
      },
      onReplayTick: (_t, playing) => {
        if (playing !== get().replayPlaying) set({ replayPlaying: playing });
      },
      onEnd: (sim) => {
        const rec = sim.getRecording();
        const outcome = rec.report!.outcome;
        if (outcome === 'landed') audio.success();
        else if (outcome === 'oceanImpact') audio.splash();
        else if (outcome !== 'outOfBounds') audio.crash(outcome === 'outsideZone' ? 0.3 : 1);
        const { data, newBest } = recordAttempt(get().data, rec);
        persist(data, set);
        set({ lastRecording: rec, data, newBest });
        // Hold a clear view of the outcome briefly before the result panel.
        if (endTimer) clearTimeout(endTimer);
        endTimer = setTimeout(() => {
          if (get().phase === 'playing') set({ phase: outcome === 'landed' ? 'landed' : 'failed' });
        }, 1100);
      },
    };
  },

  setDifficulty(id) {
    get().updateSettings({ difficulty: id });
    runtime.load(PRESETS[id], get().settings.controlMode);
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    const data = { ...get().data, settings };
    set({ settings, data });
    persist(data, set);
    audio.setVolume(settings.volume, settings.muted);
    if (patch.controlMode && get().phase === 'ready') runtime.load(runtime.scenario, settings.controlMode);
    if (patch.ghost !== undefined) runtime.setGhost(settings.ghost ? pickGhost(get()) : null);
  },

  openPanel(p) {
    set({ panel: p });
  },

  openTutorial(fromStart) {
    set({ phase: 'tutorial', tutorialReturn: fromStart ? 'start' : 'ready' });
  },

  closeTutorial(start) {
    get().updateSettings({ tutorialSeen: true });
    if (start) get().beginFlight(false);
    else set({ phase: 'ready' });
  },

  startDescent() {
    audio.unlock();
    if (!get().settings.tutorialSeen) get().openTutorial(true);
    else get().beginFlight(false);
  },

  watchDemo() {
    audio.unlock();
    get().beginFlight(true);
  },

  beginFlight(demo) {
    if (endTimer) clearTimeout(endTimer);
    audio.unlock();
    const s = get();
    if (runtime.scenario.id !== s.settings.difficulty || runtime.controlMode !== s.settings.controlMode) {
      runtime.load(PRESETS[s.settings.difficulty], s.settings.controlMode);
    }
    runtime.setGhost(demo ? null : pickGhost(s));
    runtime.start({ demo });
    set({ phase: 'playing', demo, newBest: false, panel: null, message: null, attempt: get().attempt + 1 });
  },

  pause() {
    // Only an active flight can pause; the brief hold after an outcome cannot.
    if (get().phase !== 'playing' || runtime.mode !== 'flying') return;
    runtime.pause();
    audio.suspend();
    set({ phase: 'paused' });
  },

  resume() {
    if (get().phase !== 'paused') return;
    audio.unlock();
    runtime.resume();
    set({ phase: 'playing', panel: null });
  },

  restart() {
    get().beginFlight(false);
  },

  toMenu() {
    if (endTimer) clearTimeout(endTimer);
    audio.silence();
    runtime.load(PRESETS[get().settings.difficulty], get().settings.controlMode);
    set({ phase: 'ready', demo: false, message: null, panel: null });
  },

  watchReplay(rec, source = 'result') {
    const r = rec ?? get().lastRecording;
    if (!r) return;
    audio.silence();
    runtime.startReplay(r);
    set({ phase: 'replay', replaySource: source, replayPlaying: true, replaySpeed: 1, panel: null });
  },

  exitReplay() {
    const { replaySource, lastRecording } = get();
    runtime.replay = null;
    if (replaySource === 'result' && lastRecording && runtime.sim.ended) {
      runtime.mode = 'ended';
      set({ phase: lastRecording.report?.outcome === 'landed' ? 'landed' : 'failed' });
    } else {
      get().toMenu();
    }
  },

  setReplayPlaying(p) {
    const r = runtime.replay;
    if (!r) return;
    if (p && r.time >= r.duration) r.time = 0;
    r.playing = p;
    set({ replayPlaying: p });
  },

  setReplaySpeed(s) {
    if (runtime.replay) runtime.replay.speed = s;
    set({ replaySpeed: s });
  },

  setReplayCamera(c) {
    set({ replayCamera: c });
  },

  toggleOverlay(k) {
    set({ overlays: { ...get().overlays, [k]: !get().overlays[k] } });
  },

  importRecording(json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return 'That file is not valid JSON.';
    }
    const res = validateRecording(parsed);
    if (!res.ok) return res.error;
    get().watchReplay(res.recording, 'library');
    return null;
  },

  clearHistory() {
    const data = clearHistory(get().data);
    persist(data, set);
    runtime.setGhost(null);
    set({ data, lastRecording: null });
    get().showToast('Flight history cleared');
  },

  showToast(text) {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: text });
    toastTimer = setTimeout(() => set({ toast: null }), 2600);
  },
}));
