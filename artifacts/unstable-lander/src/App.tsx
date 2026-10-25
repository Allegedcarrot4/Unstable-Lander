import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ArrowLeft, ArrowRight, ArrowUp, CircleHelp, Pause, Play, RotateCcw, X } from 'lucide-react';

type Phase = 'ready' | 'running' | 'paused' | 'landed' | 'crashed';
type Flight = {
  x: number; y: number; vx: number; vy: number; angle: number; angleVelocity: number;
  elapsed: number; flips: number; maxSpeed: number; maxHeight: number; engineStarts: number;
  wasThrusting: boolean; thrust: boolean; mode: 'standard' | 'daily'; padX: number; score: number;
};
type PersonalStats = { best: number | null; landings: number; attempts: number; bestDaily: number | null };
type GameSnapshot = { phase: Phase; flight: Flight; message: string };

const queryClient = new QueryClient();
const STORAGE_KEY = 'unstable-lander-personal-stats-v1';
const initialFlight = (mode: 'standard' | 'daily' = 'standard'): Flight => ({
  x: mode === 'daily' ? 22 : 49, y: 13.5, vx: mode === 'daily' ? 1.45 : 1.2, vy: 0.1,
  angle: 0, angleVelocity: 0, elapsed: 0, flips: 0, maxSpeed: mode === 'daily' ? 1.45 : 1.2, maxHeight: 41.5,
  engineStarts: 0, wasThrusting: false, thrust: false, mode, padX: mode === 'daily' ? 38 : 69, score: 0,
});
const initialSnapshot: GameSnapshot = { phase: 'ready', flight: initialFlight(), message: '' };
const readStats = (): PersonalStats => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...{ best: null, landings: 0, attempts: 0, bestDaily: null }, ...JSON.parse(saved) };
  } catch { /* storage may be unavailable in private browsing */ }
  return { best: null, landings: 0, attempts: 0, bestDaily: null };
};
const normalizedAngle = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;
const speedLabel = (f: Flight) => Math.hypot(f.vx, f.vy);
const dateLabel = () => new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());

function Scene({ flight, phase, mode }: { flight: Flight; phase: Phase; mode: 'standard' | 'daily' }) {
  const stars = Array.from({ length: 50 }, (_, i) => ({
    x: ((i * 73 + 19) % 887) + 5, y: ((i * 47 + 14) % 330) + 28,
    r: i % 9 === 0 ? 1.55 : i % 4 === 0 ? 1.05 : 0.65,
    opacity: 0.2 + ((i * 13) % 7) * 0.075,
  }));
  const px = flight.x * 9;
  const py = 35 + flight.y * (395 / 54);
  const landerAngle = normalizedAngle(flight.angle);
  const padCenter = (flight.padX + 6.5) * 9;
  return (
    <div className="scene" aria-label="Lunar flight simulation">
      <svg viewBox="0 0 900 500" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Lander above a cratered lunar surface">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#252d40" /><stop offset="57%" stopColor="#1b2231" /><stop offset="100%" stopColor="#292b31" />
          </linearGradient>
          <linearGradient id="moon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#77766f" /><stop offset="100%" stopColor="#35383c" />
          </linearGradient>
          <radialGradient id="haze"><stop offset="0%" stopColor="#9e8c62" stopOpacity=".2" /><stop offset="100%" stopColor="#9e8c62" stopOpacity="0" /></radialGradient>
          <filter id="blur"><feGaussianBlur stdDeviation="10" /></filter>
        </defs>
        <rect width="900" height="500" fill="url(#sky)" />
        <ellipse cx="650" cy="260" rx="310" ry="170" fill="url(#haze)" />
        <circle cx="741" cy="93" r="44" fill="#d5c99f" opacity=".09" filter="url(#blur)" />
        <circle cx="741" cy="93" r="26" fill="#c8c6b6" opacity=".25" />
        <path d="M729 82c10-9 26-4 29 6 3 10-8 13-10 22-8 2-15-3-17-11-6-4-6-11-2-17Z" fill="#8e918e" opacity=".19" />
        {stars.map((star, i) => <circle key={i} cx={star.x} cy={star.y} r={star.r} fill="#e5e0ce" opacity={star.opacity} />)}
        <path d="M0 388 58 369l39 14 57-35 48 30 58-16 49 24 62-40 47 27 46-12 51 31 54-23 46 18 52-28 59 17 48-27 44 23 51-11 50 17v89H0Z" fill="#252a31" opacity=".8" />
        <path d="M0 416 62 400l42 11 62-31 47 34 45-13 50 21 51-26 42 19 48-15 57 25 53-19 44 15 53-22 52 20 47-23 44 16 45-12 56 19v72H0Z" fill="#34383c" />
        <path d="M0 447q62-11 116 2t105 0q74-15 138 2t118-4q71-13 130 2t122-1q82-12 171 2v50H0Z" fill="url(#moon)" />
        <path d="M0 447q62-11 116 2t105 0q74-15 138 2t118-4q71-13 130 2t122-1q82-12 171 2" fill="none" stroke="#9b9a8c" strokeOpacity=".38" strokeWidth="1.5" />
        <g fill="none" stroke="#9c9b8e" opacity=".25">
          <ellipse cx="132" cy="463" rx="22" ry="5" /><ellipse cx="365" cy="476" rx="31" ry="6" />
          <ellipse cx="557" cy="460" rx="16" ry="4" /><ellipse cx="813" cy="470" rx="28" ry="6" />
          <path d="m185 462 8 3 14-2m218 11 13-3 12 2m210-18 12 3 10-2" />
        </g>
        <path d={`M${padCenter - 57} 444h114`} stroke="#d8c36f" strokeWidth="2" />
        <path d={`M${padCenter - 57} 444v-9m114 9v-9`} stroke="#d8c36f" strokeWidth="1.5" />
        <path d={`M${padCenter} 427v-12m-5 5 5-5 5 5`} stroke="#d8c36f" strokeOpacity=".55" strokeWidth="1.2" fill="none" />
        <text x={padCenter} y="407" textAnchor="middle" fill="#d4bd72" fontSize="8" fontFamily="DM Mono, monospace" letterSpacing="2">{mode === 'daily' ? 'DAILY / B' : 'LANDING ZONE'}</text>
        <path d={`M${padCenter - 79} 456h158`} stroke="#d8c36f" strokeOpacity=".16" strokeDasharray="3 7" />
        {phase === 'running' && flight.thrust && <path d={`M${px - 6} ${py + 18} L${px} ${py + 43 + Math.sin(flight.elapsed * 30) * 4} L${px + 6} ${py + 18}Z`} fill="#e4a45d" opacity=".88" />}
        <g transform={`translate(${px} ${py}) rotate(${landerAngle})`}>
          <path d="M-12 9 0-12 12 9 8 13H-8Z" fill="#d8d5c9" stroke="#fff5d9" strokeWidth="1.3" />
          <path d="M-5 3 0-5 5 3Z" fill="#747d80" />
          <path d="M-9 9h18M-12 9l-5 8m5-8-1 7m23-7 5 8m-5-8 1 7" stroke="#d8d5c9" strokeWidth="1.5" fill="none" />
          <circle cx="0" cy="7" r="2" fill="#dfc46d" />
        </g>
        <g fill="#bbc2c8" fontSize="8" fontFamily="DM Mono, monospace" opacity=".68">
          <text x="22" y="35">LUNAR SURFACE / 01</text>
          <text x="22" y="49">GRAVITY  1.62 M/S²</text>
          <text x="878" y="35" textAnchor="end">SECTOR {mode === 'daily' ? 'B-04' : 'A-17'}</text>
          <text x="878" y="49" textAnchor="end">ALT {Math.max(0, Math.round((54 - flight.y) * 10))} M</text>
        </g>
        <path d="M20 70h20m-20 0v20m860-20h-20m20 0v20M20 430h20m-20 0v-20m860 20h-20m20 0v-20" stroke="#c2c7ca" strokeOpacity=".25" />
      </svg>
      <div className="scene-hud">
        <span>FLIGHT RECORDER <span style={{ color: '#8fae9c' }}>●</span></span>
        <span className="hud-right">{phase === 'running' ? 'LIVE TELEMETRY' : phase === 'paused' ? 'HOLD POSITION' : 'FLIGHT STANDBY'}</span>
      </div>
    </div>
  );
}

function Home() {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(initialSnapshot);
  const [stats, setStats] = useState<PersonalStats>(readStats);
  const [helpOpen, setHelpOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const flightRef = useRef<Flight>(initialFlight());
  const phaseRef = useRef<Phase>('ready');
  const keys = useRef({ up: false, left: false, right: false });
  const lastFrame = useRef(0);
  const noticeTimeout = useRef<number | undefined>(undefined);
  const mode = snapshot.flight.mode;
  const flight = snapshot.flight;

  const announce = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimeout.current);
    noticeTimeout.current = window.setTimeout(() => setNotice(''), 2200);
  }, []);

  const beginRun = useCallback((nextMode: 'standard' | 'daily' = 'standard') => {
    const fresh = initialFlight(nextMode);
    flightRef.current = fresh;
    phaseRef.current = 'running';
    keys.current = { up: false, left: false, right: false };
    setSnapshot({ phase: 'running', flight: { ...fresh }, message: '' });
    setStats((current) => {
      const next = { ...current, attempts: current.attempts + 1 };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* optional persistence */ }
      return next;
    });
  }, []);

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'running') {
      phaseRef.current = 'paused';
      keys.current = { up: false, left: false, right: false };
      setSnapshot((s) => ({ ...s, phase: 'paused' }));
    } else if (phaseRef.current === 'paused') {
      phaseRef.current = 'running';
      lastFrame.current = performance.now();
      setSnapshot((s) => ({ ...s, phase: 'running' }));
    }
  }, []);

  useEffect(() => {
    let frame = 0;
    let lastPublish = 0;
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (phaseRef.current !== 'running') { lastFrame.current = now; return; }
      const dt = Math.min((now - (lastFrame.current || now)) / 1000, 0.035);
      lastFrame.current = now;
      if (dt <= 0) return;
      const f = flightRef.current;
      const thrusting = keys.current.up;
      if (thrusting && !f.wasThrusting) f.engineStarts += 1;
      f.wasThrusting = thrusting;
      f.thrust = thrusting;
      if (keys.current.left) f.angleVelocity -= 190 * dt;
      if (keys.current.right) f.angleVelocity += 190 * dt;
      f.angleVelocity *= Math.exp(-1.15 * dt);
      f.angle += f.angleVelocity * dt;
      const radians = (f.angle * Math.PI) / 180;
      const gravity = f.mode === 'daily' ? 6.1 : 5.2;
      if (thrusting) {
        f.vx += Math.sin(radians) * 10.7 * dt;
        f.vy -= Math.cos(radians) * 10.7 * dt;
      }
      if (f.mode === 'daily') f.vx += Math.sin(f.elapsed * 1.7) * 0.95 * dt;
      f.vy += gravity * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.elapsed += dt;
      f.maxSpeed = Math.max(f.maxSpeed, speedLabel(f));
      f.maxHeight = Math.max(f.maxHeight, 54 - f.y);
      f.flips = Math.floor(Math.abs(f.angle) / 360);

      let terminal: Phase | null = null;
      let resultText = '';
      if (f.x < 2 || f.x > 98 || f.y < -4) {
        terminal = 'crashed'; resultText = 'LOST IN THE DARK';
      } else if (f.y >= 54) {
        f.y = 54;
        const upright = Math.abs(normalizedAngle(f.angle)) <= 12;
        const gentle = speedLabel(f) <= 3.25 && Math.abs(f.vy) <= 2.65;
        const onPad = f.x >= f.padX && f.x <= f.padX + 13;
        if (upright && gentle && onPad) {
          terminal = 'landed';
          f.score = Math.max(0, Math.round(10000 - f.elapsed * 22 - f.maxSpeed * 34 - f.flips * 145));
          resultText = 'CLEAN TOUCHDOWN';
        } else {
          terminal = 'crashed';
          resultText = !onPad ? 'MISSED THE LANDING PAD' : !upright ? 'LANDER NOT UPRIGHT' : 'IMPACT TOO FAST';
        }
      }
      if (terminal) {
        phaseRef.current = terminal;
        keys.current = { up: false, left: false, right: false };
        f.thrust = false;
        setSnapshot({ phase: terminal, flight: { ...f }, message: resultText });
        if (terminal === 'landed') {
          setStats((current) => {
            const best = current.best === null ? f.score : Math.max(current.best, f.score);
            const bestDaily = f.mode === 'daily'
              ? current.bestDaily === null ? f.score : Math.max(current.bestDaily, f.score)
              : current.bestDaily;
            const next = { ...current, best, bestDaily, landings: current.landings + 1 };
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* optional persistence */ }
            return next;
          });
        }
      } else if (now - lastPublish > 70) {
        lastPublish = now;
        setSnapshot({ phase: 'running', flight: { ...f }, message: '' });
      }
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault();
      if (event.repeat) return;
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') keys.current.up = true;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.current.left = true;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.current.right = true;
      if (event.key.toLowerCase() === 'p' && ['running', 'paused'].includes(phaseRef.current)) togglePause();
      if (event.key.toLowerCase() === 'r' && ['landed', 'crashed'].includes(phaseRef.current)) beginRun(flightRef.current.mode);
      if (event.key === 'Escape') { setHelpOpen(false); setLauncherOpen(false); }
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') keys.current.up = false;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keys.current.left = false;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keys.current.right = false;
    };
    const onBlur = () => { keys.current = { up: false, left: false, right: false }; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [beginRun, togglePause]);

  const setControl = (control: 'up' | 'left' | 'right', down: boolean) => {
    keys.current[control] = down;
  };
  const showHelp = () => { setHelpOpen((v) => !v); setLauncherOpen(false); };
  const speed = speedLabel(flight);
  const time = flight.elapsed.toFixed(1);
  const angle = Math.round(normalizedAngle(flight.angle));
  const active = snapshot.phase === 'running';
  const padOffset = mode === 'daily' ? 'B · CROSSWIND' : 'A · STABLE ORBIT';

  return (
    <main className="app-shell">
      <div className="chrome">
        <div className="browser-top">
          <div className="window-dots" aria-hidden="true"><i /><i /><i /></div>
          <div className="tab"><span className="tab-mark">◈</span>Unstable Lander</div>
          <button className="tab-add" aria-label="Open quick launcher" data-testid="button-quick-launch" onClick={() => { setLauncherOpen((v) => !v); setHelpOpen(false); }}>+</button>
        </div>
        <div className="address-row">
          <span aria-hidden="true">‹</span><span aria-hidden="true">›</span><span className="address-lock">●</span>
          <div className="address">play.unstable / lunar-landing</div>
          <div className="launchers" aria-label="Launcher shortcuts"><i className="launcher-dot active" /><i className="launcher-dot" /><i className="launcher-dot" /></div>
        </div>
        <section className="game-frame">
          <header className="game-header">
            <div className="brandline">
              <div className="brand-glyph" aria-hidden="true">◈</div>
              <div><div className="brand-title">Unstable Lander</div><div className="brand-sub">Lunar flight program · 01</div></div>
            </div>
            <div className="head-right">
              <div className="status-chip"><i className="status-led" /> SYSTEMS NOMINAL</div>
              <button className="icon-button" aria-label="Flight controls and help" data-testid="button-help" onClick={showHelp}><CircleHelp size={15} /></button>
            </div>
          </header>

          <div className="main-content">
            <div className="mission-row">
              <div>
                <div className="eyebrow">MISSION 01 <span style={{ color: '#727985' }}> / DESCENT TRAINING</span></div>
                <h1 className="mission-title">A little finesse goes a long way.</h1>
                <div className="mission-copy">Trim your drift. Find the pad. Make it look easy.</div>
              </div>
              <div className="challenge-tag"><span>FLIGHT PLAN</span><strong>{padOffset}</strong></div>
            </div>

            <div className="flight-layout">
              <Scene flight={flight} phase={snapshot.phase} mode={mode} />
              <aside className="telemetry" aria-label="Live flight telemetry">
                <div className="telemetry-head"><span>Flight data</span><span className="telemetry-live"><i />{active ? 'Recording' : 'Standby'}</span></div>
                <div className="metrics">
                  <div className="metric"><div className="metric-label">Speed</div><div className={`metric-value ${speed < 3.2 ? 'accent' : ''}`} data-testid="text-speed">{speed.toFixed(1)}<small>m/s</small></div></div>
                  <div className="metric"><div className="metric-label">Angle</div><div className="metric-value" data-testid="text-angle">{angle}<small>°</small></div></div>
                  <div className="metric"><div className="metric-label">Elapsed</div><div className="metric-value" data-testid="text-elapsed">{time}<small>s</small></div></div>
                  <div className="metric"><div className="metric-label">Flips</div><div className="metric-value" data-testid="text-flips">{flight.flips}<small>x</small></div></div>
                  <div className="metric"><div className="metric-label">Max speed</div><div className="metric-value" data-testid="text-max-speed">{flight.maxSpeed.toFixed(1)}<small>m/s</small></div></div>
                  <div className="metric"><div className="metric-label">Max height</div><div className="metric-value" data-testid="text-max-height">{flight.maxHeight.toFixed(1)}<small>m</small></div></div>
                  <div className="metric"><div className="metric-label">Engine starts</div><div className="metric-value" data-testid="text-engine-starts">{flight.engineStarts}<small>x</small></div></div>
                  <div className="metric"><div className="metric-label">Mode</div><div className="metric-value accent" style={{ fontSize: 11 }}>{mode === 'daily' ? 'DAILY' : 'OPEN'}</div></div>
                </div>
                <div className="best-box">
                  <div><div className="best-top"><span>Personal best</span><span>All-time</span></div><div className="best-score" data-testid="text-personal-best">{stats.best === null ? '— — —' : stats.best.toLocaleString()} <em>PTS</em></div></div>
                  <div><div className="best-top"><span>Daily best</span><span>{dateLabel()}</span></div><div className="best-score">{stats.bestDaily === null ? '— — —' : stats.bestDaily.toLocaleString()} <em>PTS</em></div></div>
                </div>
              </aside>
            </div>

            <div className="control-bar">
              <div className="key-guide" aria-label="Keyboard controls">
                <div className="key-cluster"><span className="key">←</span><span className="key">↑</span><span className="key">→</span></div>
                <div className="key-label"><b>STEER</b> &nbsp;LEFT / RIGHT · MAIN ENGINE</div>
              </div>
              <div className="control-actions">
                {snapshot.phase === 'ready' || snapshot.phase === 'landed' || snapshot.phase === 'crashed' ? (
                  <button className="secondary-button" data-testid="button-play-again" onClick={() => beginRun(mode)}><RotateCcw size={13} />{snapshot.phase === 'ready' ? 'Play' : 'Play again'}</button>
                ) : (
                  <button className="secondary-button" data-testid="button-pause-resume" onClick={togglePause}>{active ? <Pause size={13} /> : <Play size={13} />}{active ? 'Pause' : 'Resume'}</button>
                )}
                <button className="secondary-button daily" data-testid="button-daily-challenge" onClick={() => { beginRun('daily'); announce('Daily crosswind course selected.'); }}><span aria-hidden="true">✦</span>Daily run</button>
              </div>
              <div className="run-count"><strong>{stats.landings}</strong> CLEAN LANDINGS &nbsp;·&nbsp; <strong>{stats.attempts}</strong> RUNS</div>
            </div>
            <div className="mobile-controls" aria-label="Touch flight controls">
              <div className="touch-set">
                <button className="touch-key" aria-label="Rotate left" data-testid="button-touch-left" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setControl('left', true); }} onPointerUp={() => setControl('left', false)} onPointerCancel={() => setControl('left', false)}><ArrowLeft size={18} /></button>
                <button className="touch-key" aria-label="Main engine" data-testid="button-touch-thrust" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setControl('up', true); }} onPointerUp={() => setControl('up', false)} onPointerCancel={() => setControl('up', false)}><ArrowUp size={18} /></button>
                <button className="touch-key" aria-label="Rotate right" data-testid="button-touch-right" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setControl('right', true); }} onPointerUp={() => setControl('right', false)} onPointerCancel={() => setControl('right', false)}><ArrowRight size={18} /></button>
              </div>
            </div>
            <div className="bottom-row">
              <span>LAND GENTLY <strong>·</strong> UPRIGHT <strong>·</strong> ON THE MARKED PAD</span>
              <span>PAUSE <strong>P</strong> &nbsp;·&nbsp; RETRY <strong>R</strong> &nbsp;·&nbsp; LOCAL FLIGHT RECORD</span>
            </div>
          </div>
          {(snapshot.phase === 'ready' || snapshot.phase === 'paused' || snapshot.phase === 'landed' || snapshot.phase === 'crashed') && (
            <div className="overlay">
              <div className="overlay-card">
                <div className="overlay-kicker">{snapshot.phase === 'ready' ? mode === 'daily' ? 'DAILY FLIGHT' : 'SIMULATION READY' : snapshot.phase === 'paused' ? 'FLIGHT PAUSED' : snapshot.phase === 'landed' ? 'FLIGHT COMPLETE' : 'FLIGHT ENDED'}</div>
                <div className="overlay-title">{snapshot.phase === 'ready' ? 'Own the descent.' : snapshot.phase === 'paused' ? 'Holding position.' : snapshot.phase === 'landed' ? 'Softly done.' : 'Not quite.'}</div>
                <p className="overlay-text">{snapshot.phase === 'ready' ? 'A tiny lunar lander, one forgiving pad, and all the room in the sky. Your run starts when you do.' : snapshot.phase === 'paused' ? 'Take a breath. The surface can wait.' : snapshot.phase === 'landed' ? `${snapshot.message} · ${flight.score.toLocaleString()} points in ${flight.elapsed.toFixed(1)} seconds.` : `${snapshot.message}. Reset your approach and try another line.`}</p>
                {snapshot.phase === 'paused' ? (
                  <button className="primary-button" data-testid="button-overlay-resume" onClick={togglePause}><Play size={14} />Resume descent</button>
                ) : snapshot.phase === 'landed' || snapshot.phase === 'crashed' ? (
                  <button className="primary-button" data-testid="button-overlay-again" onClick={() => beginRun(mode)}><RotateCcw size={14} />Run it again</button>
                ) : (
                  <button className="primary-button" data-testid="button-overlay-play" onClick={() => beginRun(mode)}><Play size={14} fill="currentColor" />Begin descent</button>
                )}
                <span className="overlay-hint">{snapshot.phase === 'ready' ? 'ARROW KEYS TO FLY · SPACE IS NOT REQUIRED' : 'ARROWS TO STEER · P TO PAUSE'}</span>
              </div>
            </div>
          )}
          {notice && <div className="notice" role="status">{notice}</div>}
        </section>
      </div>
      {helpOpen && <div className="help-panel" role="dialog" aria-label="Flight controls">
        <div className="help-title">Flight controls <button className="help-close" aria-label="Close controls" onClick={() => setHelpOpen(false)}><X size={16} /></button></div>
        <div className="help-copy">
          <b>↑ Up</b> fires the main engine. Tap in short burns to control your fall.<br />
          <b>← / →</b> rotate the craft. Counter-steer early; drift takes a moment to settle.<br />
          Touch down on the gold pad, below 3.25 m/s, with your nose within 12° of upright.<br />
          <b>P</b> pauses the flight. <b>R</b> starts a fresh attempt after landing or impact.
        </div>
      </div>}
      {launcherOpen && <div className="help-panel" role="dialog" aria-label="Quick launcher">
        <div className="help-title">Launch desk <button className="help-close" aria-label="Close launcher" onClick={() => setLauncherOpen(false)}><X size={16} /></button></div>
        <div className="help-copy" style={{ display: 'grid', gap: 10 }}>
          <button className="secondary-button" onClick={() => { beginRun('standard'); setLauncherOpen(false); }}><Play size={13} />Open descent simulator</button>
          <button className="secondary-button daily" onClick={() => { beginRun('daily'); announce('Daily crosswind course selected.'); setLauncherOpen(false); }}>✦ Run today’s challenge</button>
          <button className="secondary-button" onClick={() => { setLauncherOpen(false); setHelpOpen(true); }}><CircleHelp size={13} />Control reference</button>
        </div>
      </div>}
    </main>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary><Router /></RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
