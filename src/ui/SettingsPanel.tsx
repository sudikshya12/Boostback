import { Download, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { OUTCOME_LABEL, PRESETS } from '../sim';
import { downloadJSON, type MotionPref, type Quality, type TouchPref } from '../game/persistence';
import { useGame } from '../game/store';
import { Button, Dialog, Segmented } from './primitives';

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b border-white/6 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14.5px] text-ink">{label}</span>
        {hint && <span className="text-[12px] text-ink-faint text-right">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function SettingsPanel() {
  const settings = useGame((s) => s.settings);
  const data = useGame((s) => s.data);
  const lastRecording = useGame((s) => s.lastRecording);
  const phase = useGame((s) => s.phase);
  const update = useGame((s) => s.updateSettings);
  const close = () => useGame.getState().openPanel(null);
  const importRecording = useGame((s) => s.importRecording);
  const clearHistory = useGame((s) => s.clearHistory);
  const watchReplay = useGame((s) => s.watchReplay);
  const storageWarning = useGame((s) => s.storageWarning);
  const file = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const inFlight = phase === 'playing' || phase === 'paused';

  return (
    <Dialog title="Settings" onClose={close}>
      <div className="flex flex-col">
        <Row label="Sound" hint="Synthesized in the browser">
          <div className="flex items-center gap-3">
            <Segmented<'on' | 'off'>
              label="Sound"
              size="sm"
              value={settings.muted ? 'off' : 'on'}
              onChange={(v) => update({ muted: v === 'off' })}
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Muted' },
              ]}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              aria-label="Volume"
              onChange={(e) => update({ volume: parseFloat(e.target.value) })}
              className="bb-range flex-1"
            />
          </div>
        </Row>
        <Row label="Visual quality" hint="Physics is identical at every level">
          <Segmented<Quality>
            label="Visual quality"
            size="sm"
            value={settings.quality}
            onChange={(v) => update({ quality: v })}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />
        </Row>
        <Row label="Motion" hint="Reduced: no camera drift, fewer effects">
          <Segmented<MotionPref>
            label="Motion"
            size="sm"
            value={settings.motion}
            onChange={(v) => update({ motion: v })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'reduce', label: 'Reduced' },
              { value: 'full', label: 'Full' },
            ]}
          />
        </Row>
        <Row label="Touch controls">
          <Segmented<TouchPref>
            label="Touch controls"
            size="sm"
            value={settings.touch}
            onChange={(v) => update({ touch: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'on', label: 'Always' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </Row>
        <Row label="Steering" hint={inFlight ? 'Applies to the next attempt' : 'Direct gimbal is for experienced pilots'}>
          <Segmented<'assisted' | 'direct'>
            label="Steering mode"
            size="sm"
            value={settings.controlMode}
            onChange={(v) => update({ controlMode: v })}
            options={[
              { value: 'assisted', label: 'Attitude assist' },
              { value: 'direct', label: 'Direct gimbal' },
            ]}
          />
        </Row>
        <Row label="Previous-attempt ghost" hint="Same scenario and steering only">
          <Segmented<'on' | 'off'>
            label="Previous-attempt ghost"
            size="sm"
            value={settings.ghost ? 'on' : 'off'}
            onChange={(v) => update({ ghost: v === 'on' })}
            options={[
              { value: 'on', label: 'Show' },
              { value: 'off', label: 'Hide' },
            ]}
          />
        </Row>
        <Row label="Flight recordings" hint={`${data.replays.length} stored on this device`}>
          {data.replays.length > 0 && !inFlight && (
            <ul className="flex flex-col gap-1 mb-1">
              {data.replays.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => watchReplay(r, 'library')}
                    className="w-full text-left text-[13px] text-ink-dim hover:text-ink flex justify-between gap-2 min-h-8 cursor-pointer"
                  >
                    <span>
                      {PRESETS[r.scenarioId].name} · {r.report ? OUTCOME_LABEL[r.report.outcome] : 'Incomplete'}
                    </span>
                    <span className="num text-ink-faint">{new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="!min-h-9 text-[13px]"
              disabled={!lastRecording}
              onClick={() => lastRecording && downloadJSON(`boostback-${lastRecording.scenarioId}-${lastRecording.id}.json`, lastRecording)}
            >
              <Download size={15} aria-hidden /> Export last
            </Button>
            <Button className="!min-h-9 text-[13px]" disabled={inFlight} onClick={() => file.current?.click()}>
              <Upload size={15} aria-hidden /> Import…
            </Button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 5_000_000) return setImportError('That file is too large to be a flight recording.');
                const err = importRecording(await f.text());
                setImportError(err);
              }}
            />
            {confirmClear ? (
              <Button variant="danger" className="!min-h-9 text-[13px]" onClick={() => { clearHistory(); setConfirmClear(false); }}>
                Confirm clear
              </Button>
            ) : (
              <Button variant="ghost" className="!min-h-9 text-[13px]" onClick={() => setConfirmClear(true)}>
                <Trash2 size={15} aria-hidden /> Clear history
              </Button>
            )}
          </div>
          {importError && (
            <p role="alert" className="text-[13px] text-danger mt-1">
              {importError}
            </p>
          )}
          {storageWarning && <p className="text-[12.5px] text-caution mt-1">{storageWarning}</p>}
        </Row>
      </div>
    </Dialog>
  );
}
