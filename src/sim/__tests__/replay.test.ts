import { describe, expect, it } from 'vitest';
import { PRESETS } from '../config';
import { observations } from '../analysis';
import { compactRecording, recordingDuration, sampleAt, validateRecording } from '../replay';
import { Simulation } from '../simulation';
import { calmScenario, flyDemo, HOLD, place, runUntilEnd } from './helpers';

describe('recording and replay', () => {
  it('recording preserves the flight result and final state', () => {
    const sim = flyDemo('standard');
    const rec = sim.getRecording();
    expect(rec.report).toEqual(sim.report);
    const last = rec.samples[rec.samples.length - 1];
    expect(last.x).toBe(sim.state.x);
    expect(last.y).toBe(sim.state.y);
    expect(last.th).toBe(sim.state.theta);
    expect(recordingDuration(rec)).toBeCloseTo(sim.report!.t, 6);
    expect(rec.seed).toBe(PRESETS.standard.seed);
    expect(rec.events.at(-1)?.type).toBe('touchdown');
  });

  it('replay sampling reproduces recorded states exactly at sample times', () => {
    const rec = flyDemo('training').getRecording();
    for (const i of [0, 10, 200, rec.samples.length - 1]) {
      const s = rec.samples[i];
      const r = sampleAt(rec.samples, s.t);
      expect(r.x).toBeCloseTo(s.x, 9);
      expect(r.y).toBeCloseTo(s.y, 9);
      expect(r.th).toBeCloseTo(s.th, 9);
    }
  });

  it('replay interpolates between samples', () => {
    const rec = flyDemo('training').getRecording();
    const a = rec.samples[50];
    const b = rec.samples[51];
    const mid = sampleAt(rec.samples, (a.t + b.t) / 2);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 9);
  });

  it('compacted recordings survive a JSON round trip and validation', () => {
    const rec = compactRecording(flyDemo('challenge').getRecording());
    const parsed = JSON.parse(JSON.stringify(rec));
    const result = validateRecording(parsed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.recording.report?.outcome).toBe('landed');
      expect(result.recording.samples.at(-1)!.t).toBeCloseTo(rec.samples.at(-1)!.t, 3);
    }
  });

  it('rejects malformed imports', () => {
    expect(validateRecording(null).ok).toBe(false);
    expect(validateRecording({ format: 'other' }).ok).toBe(false);
    const rec = JSON.parse(JSON.stringify(flyDemo('training').getRecording()));
    rec.samples[3].x = 'NaN';
    expect(validateRecording(rec).ok).toBe(false);
  });

  it('observations are backed by the recorded flight', () => {
    const sim = place(new Simulation(calmScenario()), { clearance: 0.05, vy: -6 });
    runUntilEnd(sim, HOLD);
    const obs = observations(sim.getRecording());
    expect(obs[0].text).toContain(`${(-sim.report!.vy).toFixed(1)} m/s`);
    expect(obs[0].text).toContain('above the 3.0 m/s landing limit');
    expect(obs.length).toBeLessThanOrEqual(2);
  });
});
