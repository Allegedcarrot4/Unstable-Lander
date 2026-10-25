import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize, Minimize, Pause, Play, RotateCcw } from 'lucide-react';
import LanderScene, {
  estimateImpactTime,
  isGroundVisible,
  type Flight,
  type Phase,
} from '@/components/LanderScene';

type GameSnapshot = { phase: Phase; flight: Flight; message: string };
type PersonalStats = {
  best: number | null;
  landings: number;
  attempts: number;
  bestDaily: number | null;
};

const STORAGE_KEY = 'unstable-lander-personal-stats-v1';
const initialFlight = (mode: 'standard' | 'daily' = 'standard'): Flight => ({
  x: mode === 'daily' ? 22 : 49,
  y: 13.5,
  vx: mode === 'daily' ? 1.45 : 1.2,
  vy: 0.1,
  angle: 0,
  angleVelocity: 0,
  elapsed: 0,
  flips: 0,
  maxSpeed: mode === 'daily' ? 1.45 : 1.2,
  maxHeight: 40.5,
  engineStarts: 0,
  wasThrusting: false,
  thrust: false,
  mode,
  padX: 74,
  score: 0,
});

const readStats = (): PersonalStats => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return {
        best: null,
        landings: 0,
        attempts: 0,
        bestDaily: null,
        ...JSON.parse(saved),
      };
    }
  } catch {
    // Local storage is optional.
  }
  return { best: null, landings: 0, attempts: 0, bestDaily: null };
};

const normalizedAngle = (angle: number) =>
  ((angle + 180) % 360 + 360) % 360 - 180;

const speedMph = (flight: Flight) =>
  Math.hypot(flight.vx, flight.vy) * 2.23694;

const formatClock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

export default function FullscreenGame() {
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => ({
    phase: 'ready',
    flight: initialFlight(),
    message: '',
  }));
  const [stats, setStats] = useState<PersonalStats>(readStats);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const flightRef = useRef(snapshot.flight);
  const phaseRef = useRef<Phase>('ready');
  const keysRef = useRef({ up: false, left: false, right: false });
  const lastFrameRef = useRef(0);
  const fullscreenRequestedRef = useRef(false);

  const enterFullscreen = useCallback(() => {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    const request = document.documentElement.requestFullscreen({
      navigationUI: 'hide',
    });
    void request.catch(() => {
      // The browser can deny fullscreen in embedded previews; the game still fills the viewport.
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      if (!fullscreenRequestedRef.current) {
        fullscreenRequestedRef.current = true;
        enterFullscreen();
      }
    }
  }, [enterFullscreen]);

  const beginRun = useCallback(
    (mode: 'standard' | 'daily' = 'standard') => {
      const fresh = initialFlight(mode);
      flightRef.current = fresh;
      phaseRef.current = 'running';
      keysRef.current = { up: false, left: false, right: false };
      lastFrameRef.current = performance.now();
      setSnapshot({ phase: 'running', flight: { ...fresh }, message: '' });
      setStats((current) => {
        const next = { ...current, attempts: current.attempts + 1 };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Local stats stay available in memory if storage is unavailable.
        }
        return next;
      });
      enterFullscreen();
    },
    [enterFullscreen],
  );

  const togglePause = useCallback(() => {
    if (phaseRef.current === 'running') {
      phaseRef.current = 'paused';
      keysRef.current = { up: false, left: false, right: false };
      setSnapshot((current) => ({ ...current, phase: 'paused' }));
    } else if (phaseRef.current === 'paused') {
      phaseRef.current = 'running';
      lastFrameRef.current = performance.now();
      setSnapshot((current) => ({ ...current, phase: 'running' }));
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const updateViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    let frame = 0;
    let lastPublish = 0;

    const animate = (now: number) => {
      frame = window.requestAnimationFrame(animate);
      if (phaseRef.current !== 'running') {
        lastFrameRef.current = now;
        return;
      }

      const dt = Math.min((now - (lastFrameRef.current || now)) / 1000, 1 / 30);
      lastFrameRef.current = now;
      if (dt <= 0) return;

      const flight = flightRef.current;
      const isThrusting = keysRef.current.up;
      if (isThrusting && !flight.wasThrusting) flight.engineStarts += 1;
      flight.wasThrusting = isThrusting;
      flight.thrust = isThrusting;

      if (keysRef.current.left) flight.angleVelocity -= 190 * dt;
      if (keysRef.current.right) flight.angleVelocity += 190 * dt;
      flight.angleVelocity *= Math.exp(-1.15 * dt);
      flight.angle += flight.angleVelocity * dt;

      const radians = (flight.angle * Math.PI) / 180;
      const gravity = flight.mode === 'daily' ? 6.1 : 5.2;
      if (isThrusting) {
        flight.vx += Math.sin(radians) * 10.7 * dt;
        flight.vy -= Math.cos(radians) * 10.7 * dt;
      }
      if (flight.mode === 'daily') {
        flight.vx += Math.sin(flight.elapsed * 1.7) * 0.95 * dt;
      }

      flight.vy += gravity * dt;
      flight.x += flight.vx * dt;
      flight.x = ((flight.x % 100) + 100) % 100;
      flight.y += flight.vy * dt;
      flight.elapsed += dt;
      flight.maxSpeed = Math.max(flight.maxSpeed, Math.hypot(flight.vx, flight.vy));
      flight.maxHeight = Math.max(flight.maxHeight, 54 - flight.y);
      flight.flips = Math.floor(Math.abs(flight.angle) / 360);

      let terminal: Phase | null = null;
      let message = '';
      if (!Number.isFinite(flight.x) || !Number.isFinite(flight.y)) {
        terminal = 'crashed';
        message = 'LOST IN THE DARK';
      } else if (flight.y >= 54) {
        flight.y = 54;
        const upright = Math.abs(normalizedAngle(flight.angle)) <= 12;
        const gentle =
          speedMph(flight) <= 15 && Math.abs(flight.vy) * 2.23694 <= 11;
        const onPad = flight.x >= flight.padX && flight.x <= flight.padX + 13;

        if (upright && gentle && onPad) {
          terminal = 'landed';
          flight.score = Math.max(
            0,
            Math.round(
              10000 -
                flight.elapsed * 22 -
                flight.maxSpeed * 34 -
                flight.flips * 145,
            ),
          );
          message = 'CLEAN TOUCHDOWN';
        } else {
          terminal = 'crashed';
          message = !onPad
            ? 'MISSED THE LANDING PAD'
            : !upright
              ? 'LANDER NOT UPRIGHT'
              : 'IMPACT TOO FAST';
        }
      }

      if (terminal) {
        phaseRef.current = terminal;
        keysRef.current = { up: false, left: false, right: false };
        flight.thrust = false;
        setSnapshot({ phase: terminal, flight: { ...flight }, message });

        if (terminal === 'landed') {
          setStats((current) => {
            const best =
              current.best === null ? flight.score : Math.max(current.best, flight.score);
            const bestDaily =
              flight.mode === 'daily'
                ? current.bestDaily === null
                  ? flight.score
                  : Math.max(current.bestDaily, flight.score)
                : current.bestDaily;
            const next = {
              ...current,
              best,
              bestDaily,
              landings: current.landings + 1,
            };
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
              // Keep the current session usable without storage.
            }
            return next;
          });
        }
      } else if (now - lastPublish >= 100) {
        lastPublish = now;
        setSnapshot({ phase: 'running', flight: { ...flight }, message: '' });
      }
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controlForKey = (key: string) => {
      if (key === 'ArrowUp' || key.toLowerCase() === 'w') return 'up';
      if (key === 'ArrowLeft' || key.toLowerCase() === 'a') return 'left';
      if (key === 'ArrowRight' || key.toLowerCase() === 'd') return 'right';
      return null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const control = controlForKey(event.key);
      if (control) {
        event.preventDefault();
        if (event.repeat) return;
        if (phaseRef.current === 'ready') {
          beginRun(flightRef.current.mode);
        }
        if (phaseRef.current === 'running') keysRef.current[control] = true;
        return;
      }

      if (event.key.toLowerCase() === 'p') {
        if (phaseRef.current === 'running' || phaseRef.current === 'paused') {
          event.preventDefault();
          togglePause();
        }
      }
      if (event.key.toLowerCase() === 'r') {
        if (phaseRef.current === 'landed' || phaseRef.current === 'crashed') {
          beginRun(flightRef.current.mode);
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const control = controlForKey(event.key);
      if (control) keysRef.current[control] = false;
    };
    const onBlur = () => {
      keysRef.current = { up: false, left: false, right: false };
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [beginRun, togglePause]);

  const setControl = (control: 'up' | 'left' | 'right', down: boolean) => {
    if (down && phaseRef.current === 'ready') beginRun(flightRef.current.mode);
    if (phaseRef.current === 'running') keysRef.current[control] = down;
  };

  const { phase, flight, message } = snapshot;
  const angle = Math.round(normalizedAngle(flight.angle));
  const speed = speedMph(flight);
  const altitude = Math.max(0, (54 - flight.y) * 3.28084);
  const impact = estimateImpactTime(flight);
  const showImpact = phase === 'running' && flight.vy > 3.5 && impact !== null;
  const groundVisible = isGroundVisible(flight, viewport.width, viewport.height);
  const readoutLeft = Math.max(
    12,
    Math.min(viewport.width - 166, (flight.x / 100) * viewport.width + 28),
  );
  const readoutTop = Math.max(52, viewport.height * 0.14 - 12);
  const approachSafe =
    speed <= 15 &&
    Math.abs(angle) <= 12 &&
    Math.abs(flight.vy) * 2.23694 <= 11;
  const stateLabel =
    phase === 'running'
      ? flight.thrust
        ? 'ENGINE BURN'
        : 'DESCENT LIVE'
      : phase === 'paused'
        ? 'FLIGHT PAUSED'
        : phase === 'landed'
          ? 'LANDING CONFIRMED'
          : phase === 'crashed'
            ? 'FLIGHT ENDED'
            : 'READY FOR FLIGHT';

  const startTouchControl = (
    event: React.PointerEvent<HTMLButtonElement>,
    control: 'up' | 'left' | 'right',
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setControl(control, true);
  };

  return (
    <main className="game-screen">
      <LanderScene flightRef={flightRef} phase={phase} />

      <div className="top-hud">
        <div className="game-mark">
          <span className="mark-symbol">◈</span>
          <span>UNSTABLE LANDER</span>
        </div>
        <div className="flight-status">
          <span className={`status-light ${phase}`} />
          {stateLabel}
        </div>
        <div className="top-actions">
          {(phase === 'running' || phase === 'paused') && (
            <button
              className="hud-button"
              aria-label={phase === 'running' ? 'Pause flight' : 'Resume flight'}
              title={phase === 'running' ? 'Pause (P)' : 'Resume (P)'}
              onClick={togglePause}
            >
              {phase === 'running' ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )}
          <button
            className="hud-button"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {groundVisible ? (
        <div
          className="ship-readout"
          aria-label="Flight instruments beside the lander"
          style={{ left: `${readoutLeft}px`, top: `${readoutTop}px` }}
        >
          <div className="ship-readout-row">
            <span>SPEED</span>
            <strong className={approachSafe ? 'safe-value' : 'danger-value'}>
              {speed.toFixed(1)} MPH
            </strong>
          </div>
          <div className="ship-readout-row">
            <span>ANGLE</span>
            <strong className={approachSafe ? 'safe-value' : 'danger-value'}>
              {angle}°
            </strong>
          </div>
          <div className={`ship-readout-row ${showImpact ? 'impact-countdown' : ''}`}>
            <span>{showImpact ? 'IMPACT IN' : 'FLIGHT TIME'}</span>
            <strong>
              {showImpact && impact !== null
                ? `${impact.toFixed(1)} SEC`
                : formatClock(flight.elapsed)}
            </strong>
          </div>
          <div className="ship-readout-row">
            <span>ALTITUDE</span>
            <strong className={approachSafe ? 'safe-value' : 'danger-value'}>
              {Math.round(altitude)} FT
            </strong>
          </div>
        </div>
      ) : (
        <div className="flight-hud" aria-label="Flight instruments">
          <div className="instrument instrument-left">
            <span className="instrument-label">SPEED</span>
            <strong className={approachSafe ? 'safe-value' : 'danger-value'}>
              {speed.toFixed(1)} <small>MPH</small>
            </strong>
            <span className="angle-readout">
              ANGLE <b className={approachSafe ? 'safe-value' : 'danger-value'}>{angle}°</b>
            </span>
          </div>

          <div className={`instrument instrument-center ${showImpact ? 'impact-countdown' : ''}`}>
            <span className="instrument-label">
              {showImpact ? 'IMPACT IN' : 'FLIGHT TIME'}
            </span>
            <strong>
              {showImpact && impact !== null
                ? `${impact.toFixed(1)} SEC`
                : formatClock(flight.elapsed)}
            </strong>
          </div>

          <div className="instrument instrument-right">
            <span className="instrument-label">ALTITUDE</span>
            <strong className={approachSafe ? 'safe-value' : 'danger-value'}>
              {Math.round(altitude)} <small>FT</small>
            </strong>
            <span className="angle-readout">
              {flight.mode === 'daily' ? 'DAILY CROSSWIND' : 'LUNAR SURFACE'}
            </span>
          </div>
        </div>
      )}

      <div className="control-hint" aria-label="Keyboard controls">
        <kbd>←</kbd><kbd>→</kbd> ROTATE <span>·</span> <kbd>↑</kbd> THRUST
        <span>·</span> P PAUSE
      </div>

      <div className="touch-controls" aria-label="Touch flight controls">
        <button
          aria-label="Rotate left"
          onPointerDown={(event) => startTouchControl(event, 'left')}
          onPointerUp={() => setControl('left', false)}
          onPointerCancel={() => setControl('left', false)}
        >
          ←
        </button>
        <button
          aria-label="Main engine"
          onPointerDown={(event) => startTouchControl(event, 'up')}
          onPointerUp={() => setControl('up', false)}
          onPointerCancel={() => setControl('up', false)}
        >
          ↑
        </button>
        <button
          aria-label="Rotate right"
          onPointerDown={(event) => startTouchControl(event, 'right')}
          onPointerUp={() => setControl('right', false)}
          onPointerCancel={() => setControl('right', false)}
        >
          →
        </button>
      </div>

      {phase !== 'running' && (
        <div className="game-overlay">
          <div className="overlay-card">
            <span className="overlay-kicker">
              {phase === 'ready'
                ? flight.mode === 'daily'
                  ? 'DAILY CROSSWIND'
                  : 'DESCENT TRAINING'
                : phase === 'paused'
                  ? 'FLIGHT PAUSED'
                  : phase === 'landed'
                    ? 'LANDING CONFIRMED'
                    : 'MISSION ENDED'}
            </span>
            <h1>
              {phase === 'ready'
                ? 'Own the descent.'
                : phase === 'paused'
                  ? 'Holding position.'
                  : phase === 'landed'
                    ? 'Softly done.'
                    : 'Not quite.'}
            </h1>
            <p>
              {phase === 'ready'
                ? 'Trim your drift, keep the nose upright, and set down on the white marker.'
                : phase === 'paused'
                  ? 'The lander is holding. Resume when you’re ready.'
                  : phase === 'landed'
                    ? `${message} · ${flight.score.toLocaleString()} points`
                    : `${message}. Adjust your approach and try again.`}
            </p>
            {phase === 'ready' ? (
              <div className="overlay-actions">
                <button className="primary-action" onClick={() => beginRun('standard')}>
                  <Play size={14} fill="currentColor" /> Start landing
                </button>
                <button className="secondary-action" onClick={() => beginRun('daily')}>
                  Daily crosswind
                </button>
              </div>
            ) : phase === 'paused' ? (
              <button className="primary-action" onClick={togglePause}>
                <Play size={14} fill="currentColor" /> Resume flight
              </button>
            ) : (
              <button
                className="primary-action"
                onClick={() => beginRun(flight.mode)}
              >
                <RotateCcw size={14} /> Try again
              </button>
            )}
            <span className="overlay-footnote">
              {phase === 'ready'
                ? 'ARROWS / WASD TO FLY · TAP TO START'
                : 'ARROWS / WASD TO STEER · R TO RETRY'}
            </span>
          </div>
        </div>
      )}

      <div className="personal-record" aria-live="polite">
        <span>{stats.landings} LANDINGS</span>
        <span>BEST {stats.best === null ? '— — —' : stats.best.toLocaleString()}</span>
      </div>
    </main>
  );
}
