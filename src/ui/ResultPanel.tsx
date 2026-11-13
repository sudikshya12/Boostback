import { CheckCircle2, ChevronDown, Download, Film, Home, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { observations, OUTCOME_DETAIL, OUTCOME_LABEL, type Recording } from '../sim';
import { downloadJSON } from '../game/persistence';
import { useGame } from '../game/store';
import { chartEvents, LineChart } from './Charts';
import { Button, Kbd } from './primitives';

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">{label}</span>
      <span className="num text-[19px] text-ink">
        {value}
        <span className="text-[12px] text-ink-faint ml-1">{unit}</span>
      </span>
    </div>
  );
}

export function Analysis({ rec }: { rec: Recording }) {
  const r = rec.report!;
  const obs = observations(rec);
  const events = chartEvents(rec.events);
  const s = rec.samples;
  const maxAlt = Math.max(...s.map((p) => p.alt));
  const maxDescent = Math.max(...s.map((p) => -p.vy));
  const avgThr = s.reduce((a, p) => a + p.thr, 0) / Math.max(1, s.length);

  return (
    <div className="flex flex-col gap-4 pt-1" data-testid="analysis">
      {obs.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {obs.map((o, i) => (
            <li
              key={i}
              className={`text-[14px] leading-snug pl-3 border-l-2 ${
                o.tone === 'good' ? 'border-success' : o.tone === 'warn' ? 'border-caution' : 'border-guide'
              }`}
            >
              {o.text}
            </li>
          ))}
        </ul>
      )}
      <LineChart
        title="Altitude"
        unit="m"
        samples={s}
        series={[{ key: 'alt', label: '', color: '#f3ede2', get: (p) => p.alt }]}
        events={events}
        yMin={0}
        summary={`Started at ${Math.round(maxAlt)} metres, contact at ${r.t.toFixed(1)} seconds.`}
      />
      <LineChart
        title="Vertical speed"
        unit="m/s"
        samples={s}
        series={[{ key: 'vy', label: '', color: '#63d3e6', get: (p) => p.vy }]}
        events={events}
        limit={{ value: -rec.scenario.limits.vertical, label: `limit −${rec.scenario.limits.vertical}` }}
        summary={`Fastest descent ${maxDescent.toFixed(1)} metres per second; ${(-r.vy).toFixed(1)} at contact.`}
      />
      <LineChart
        title="Throttle"
        unit="%"
        samples={s}
        series={[
          { key: 'thr', label: 'applied', color: '#f2b155', get: (p) => p.thr * 100 },
          { key: 'cmd', label: 'command', color: '#f3ede2', get: (p) => p.thrCmd * 100, dashed: true },
        ]}
        events={events}
        yMin={0}
        yMax={100}
        summary={`Average throttle ${Math.round(avgThr * 100)} percent.`}
      />
      {events.length > 0 && (
        <ol className="flex flex-col gap-1 text-[12.5px] text-ink-dim">
          {events.map((e, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="num text-guide">{i + 1}</span>
              <span>
                {e.label} <span className="num text-ink-faint">{e.t.toFixed(1)} s</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {r.checks.length > 0 && (
        <table className="w-full text-[13px]">
          <caption className="text-left text-ink-faint text-[11px] uppercase tracking-[0.12em] pb-1.5">Touchdown checks</caption>
          <thead className="sr-only">
            <tr>
              <th>Check</th>
              <th>Value</th>
              <th>Limit</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {r.checks.map((c) => (
              <tr key={c.id} className="border-t border-white/6">
                <td className="py-1.5 text-ink-dim">{c.label}</td>
                <td className="py-1.5 num text-right">
                  {c.value.toFixed(c.unit === '%' ? 0 : 1)}
                  {c.unit === '°' ? '°' : ` ${c.unit}`}
                </td>
                <td className="py-1.5 num text-right text-ink-faint">
                  {c.id === 'legs' ? '= 100%' : `≤ ${c.limit.toFixed(1)}${c.unit === '°' ? '°' : ` ${c.unit}`}`}
                </td>
                <td className={`py-1.5 pl-3 text-right font-medium ${c.pass ? 'text-success' : 'text-danger'}`}>
                  {c.pass ? '✓ Pass' : '✕ Fail'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[12px] text-ink-faint leading-snug">
        Seed {rec.seed} · {rec.scenario.name} · {rec.controlMode === 'assisted' ? 'attitude assist' : 'direct gimbal'} · sim v{rec.simVersion}
        {rec.pilot === 'demo' && ' · flown by the demo controller'}
      </p>
      <div>
        <Button variant="ghost" className="!px-2 -ml-2 text-[13px]" onClick={() => downloadJSON(`boostback-${rec.scenarioId}-${rec.id}.json`, rec)}>
          <Download size={15} aria-hidden /> Export flight recording (JSON)
        </Button>
      </div>
    </div>
  );
}

export function ResultPanel() {
  const rec = useGame((s) => s.lastRecording);
  const newBest = useGame((s) => s.newBest);
  const demo = useGame((s) => s.demo);
  const restart = useGame((s) => s.restart);
  const watchReplay = useGame((s) => s.watchReplay);
  const toMenu = useGame((s) => s.toMenu);
  const [open, setOpen] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => primary.current?.focus({ preventScroll: true }), []);
  if (!rec?.report) return null;
  const r = rec.report;
  const ok = r.outcome === 'landed';
  const onDeck = r.surface === 'deck';

  return (
    <div
      className="fixed z-20 left-3 right-3 bottom-3 sm:left-6 sm:right-auto sm:top-6 sm:bottom-auto sm:w-[380px] max-h-[calc(100dvh-24px)] sm:max-h-[calc(100dvh-48px)] overflow-y-auto panel !bg-panel/85 p-5 rise-in"
      role="region"
      aria-label="Flight result"
      data-testid="result"
    >
      <div className="flex items-start gap-3">
        {ok ? <CheckCircle2 className="text-success shrink-0 mt-0.5" size={26} aria-hidden /> : <XCircle className="text-danger shrink-0 mt-0.5" size={26} aria-hidden />}
        <div className="min-w-0">
          <h2 className={`text-[21px] font-semibold tracking-tight leading-tight ${ok ? 'text-success' : 'text-ink'}`} data-testid="outcome">
            {ok ? 'Touchdown confirmed' : OUTCOME_LABEL[r.outcome]}
          </h2>
          <p className="text-[14px] text-ink-dim mt-0.5">{OUTCOME_DETAIL[r.outcome]}</p>
          {newBest && !demo && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-caution">
              <Trophy size={14} aria-hidden /> New best for this scenario
            </p>
          )}
          {demo && <p className="mt-1.5 text-[13px] text-guide">Flown by the demo controller</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <Stat label="Touchdown" value={onDeck ? (-r.vy).toFixed(1) : '—'} unit={onDeck ? 'm/s' : ''} />
        <Stat label="From centre" value={r.distanceFromCenter.toFixed(1)} unit="m" />
        <Stat label="Fuel left" value={Math.round(r.fuelFraction * 100).toString()} unit="%" />
      </div>

      <div className="flex gap-2.5 mt-5">
        <Button ref={primary} variant="primary" onClick={restart} className="flex-1" data-testid="try-again">
          <RotateCcw size={16} aria-hidden /> Try again
        </Button>
        <Button onClick={() => watchReplay()} className="flex-1" data-testid="watch-replay">
          <Film size={16} aria-hidden /> Watch replay
        </Button>
      </div>
      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 text-[14px] text-ink-dim hover:text-ink min-h-9 cursor-pointer"
          data-testid="toggle-analysis"
        >
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          {open ? 'Hide analysis' : 'Flight analysis'}
        </button>
        <span className="text-[12px] text-ink-faint hidden sm:flex items-center gap-1.5">
          <Kbd>R</Kbd> retry
        </span>
        <button type="button" onClick={toMenu} className="inline-flex items-center gap-1.5 text-[13px] text-ink-dim hover:text-ink min-h-9 cursor-pointer">
          <Home size={14} aria-hidden /> Menu
        </button>
      </div>
      {open && <Analysis rec={rec} />}
    </div>
  );
}
