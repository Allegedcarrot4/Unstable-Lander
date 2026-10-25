import { useEffect, useRef, type MutableRefObject } from 'react';

export type Flight = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angleVelocity: number;
  elapsed: number;
  flips: number;
  maxSpeed: number;
  maxHeight: number;
  engineStarts: number;
  wasThrusting: boolean;
  thrust: boolean;
  mode: 'standard' | 'daily';
  padX: number;
  score: number;
};

export type Phase = 'ready' | 'running' | 'paused' | 'landed' | 'crashed';

const stars = Array.from({ length: 112 }, (_, index) => ({
  x: ((index * 137.51 + 19) % 997) / 997,
  y: ((index * 71.73 + 41) % 991) / 991,
  size: index % 13 === 0 ? 1.5 : index % 4 === 0 ? 1 : 0.65,
  alpha: 0.24 + ((index * 11) % 7) * 0.08,
}));

const terrainProfile: Array<[number, number]> = [
  [0, 0.03], [0.035, -0.01], [0.075, 0.045], [0.12, -0.045],
  [0.16, -0.12], [0.19, -0.04], [0.205, 0.34], [0.235, 0.34],
  [0.26, 0.015], [0.31, 0.045], [0.35, 0.07], [0.4, -0.03],
  [0.45, 0.015], [0.49, 0.07], [0.54, 0.025], [0.59, -0.07],
  [0.64, -0.035], [0.69, 0.015], [0.72, 0.075], [0.74, 0],
  [0.87, 0], [0.91, -0.13], [0.96, -0.105], [1, -0.17],
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizedAngle = (angle: number) =>
  ((angle + 180) % 360 + 360) % 360 - 180;

export function estimateImpactTime(flight: Flight) {
  const distance = 54 - flight.y;
  if (distance <= 0) return null;

  const radians = (flight.angle * Math.PI) / 180;
  const gravity = flight.mode === 'daily' ? 6.1 : 5.2;
  const acceleration = gravity - (flight.thrust ? Math.cos(radians) * 10.7 : 0);
  if (Math.abs(acceleration) < 0.025) {
    return flight.vy > 0 ? distance / flight.vy : null;
  }

  const discriminant =
    flight.vy * flight.vy + 2 * acceleration * distance;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const possibleTimes = [
    (-flight.vy + root) / acceleration,
    (-flight.vy - root) / acceleration,
  ].filter((time) => Number.isFinite(time) && time > 0);

  return possibleTimes.length ? Math.min(...possibleTimes) : null;
}

function drawArrow(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 9;
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.lineTo(
    x2 - head * Math.cos(angle - Math.PI / 5),
    y2 - head * Math.sin(angle - Math.PI / 5),
  );
  context.moveTo(x2, y2);
  context.lineTo(
    x2 - head * Math.cos(angle + Math.PI / 5),
    y2 - head * Math.sin(angle + Math.PI / 5),
  );
  context.stroke();
}

function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  flight: Flight,
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#030712';
  context.fillRect(0, 0, width, height);

  const skyGlow = context.createRadialGradient(
    width * 0.5,
    height * 0.18,
    0,
    width * 0.5,
    height * 0.18,
    height * 0.78,
  );
  skyGlow.addColorStop(0, 'rgba(15, 27, 55, 0.32)');
  skyGlow.addColorStop(1, 'rgba(3, 7, 18, 0)');
  context.fillStyle = skyGlow;
  context.fillRect(0, 0, width, height);

  for (const star of stars) {
    context.globalAlpha = star.alpha;
    context.fillStyle = '#dce5fa';
    context.fillRect(star.x * width, star.y * height, star.size, star.size);
  }
  context.globalAlpha = 1;

  const craftSize = clamp(width * 0.044, 22, 48);
  const craftX = (flight.x / 100) * width;
  const craftY = height * 0.14;
  const terrainScale = Math.min(height, width * 0.195);
  const groundY =
    craftY +
    craftSize * 0.54 +
    ((54 - flight.y) * height) / 80;

  if (groundY < height + height * 0.18 && groundY > -height * 0.5) {
    context.beginPath();
    context.moveTo(0, height);
    for (const [x, offset] of terrainProfile) {
      context.lineTo(x * width, groundY + offset * terrainScale);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = '#77777d';
    context.fill();

    context.beginPath();
    terrainProfile.forEach(([x, offset], index) => {
      const y = groundY + offset * terrainScale;
      if (index === 0) context.moveTo(x * width, y);
      else context.lineTo(x * width, y);
    });
    context.strokeStyle = 'rgba(211, 213, 222, 0.32)';
    context.lineWidth = 1;
    context.stroke();

    const padStart = (flight.padX / 100) * width;
    const padEnd = ((flight.padX + 13) / 100) * width;
    context.strokeStyle = '#e4e7f1';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(padStart, groundY);
    context.lineTo(padEnd, groundY);
    context.stroke();
    context.fillStyle = '#e4e7f1';
    context.font = `${Math.max(9, width * 0.009)}px ui-monospace, monospace`;
    context.textAlign = 'center';
    context.fillText('+0', (padStart + padEnd) / 2, groundY - 7);
  }

  const forecast = estimateImpactTime(flight);
  const projectedSeconds = clamp(forecast ?? 5, 1, 18);
  const wind = flight.mode === 'daily' ? Math.sin(flight.elapsed * 1.7) * 0.95 : 0;
  const projectedX = clamp(
    flight.x + flight.vx * projectedSeconds + 0.5 * wind * projectedSeconds ** 2,
    1,
    99,
  );
  const speedMph = Math.hypot(flight.vx, flight.vy) * 2.23694;
  const angle = Math.abs(normalizedAngle(flight.angle));
  const safeApproach = speedMph <= 15 && angle <= 12 && Math.abs(flight.vy) * 2.23694 <= 11;
  const forecastColor = safeApproach ? '#65ed91' : '#fa5864';
  const impactX = (projectedX / 100) * width;

  if (groundY < height + height * 0.18) {
    context.save();
    context.setLineDash([5, 7]);
    context.globalAlpha = 0.74;
    drawArrow(
      context,
      craftX,
      craftY + craftSize * 0.45,
      impactX,
      Math.min(height - 8, groundY - 5),
      forecastColor,
      1.5,
    );
    context.restore();
  } else {
    const direction = Math.atan2(flight.vy, flight.vx);
    drawArrow(
      context,
      craftX,
      craftY + craftSize * 0.45,
      craftX + Math.cos(direction) * craftSize * 2.3,
      craftY + craftSize * 0.45 + Math.sin(direction) * craftSize * 2.3,
      forecastColor,
      1.5,
    );
  }

  const radians = (flight.angle * Math.PI) / 180;
  const noseX = craftX + Math.sin(radians) * craftSize * 1.45;
  const noseY = craftY - Math.cos(radians) * craftSize * 1.45;
  drawArrow(context, craftX, craftY, noseX, noseY, '#f1d779', 2);

  context.save();
  context.translate(craftX, craftY);
  context.rotate(radians);

  if (flight.thrust) {
    const flameLength = craftSize * (0.86 + Math.sin(flight.elapsed * 28) * 0.12);
    context.beginPath();
    context.moveTo(-craftSize * 0.12, craftSize * 0.39);
    context.lineTo(0, craftSize * 0.39 + flameLength);
    context.lineTo(craftSize * 0.12, craftSize * 0.39);
    context.closePath();
    context.fillStyle = '#ff9d54';
    context.fill();
  }

  context.beginPath();
  context.moveTo(0, -craftSize * 0.58);
  context.lineTo(craftSize * 0.43, craftSize * 0.3);
  context.lineTo(craftSize * 0.3, craftSize * 0.42);
  context.lineTo(-craftSize * 0.3, craftSize * 0.42);
  context.lineTo(-craftSize * 0.43, craftSize * 0.3);
  context.closePath();
  context.fillStyle = '#dfe4ea';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(-craftSize * 0.26, craftSize * 0.32);
  context.lineTo(-craftSize * 0.53, craftSize * 0.68);
  context.moveTo(craftSize * 0.26, craftSize * 0.32);
  context.lineTo(craftSize * 0.53, craftSize * 0.68);
  context.moveTo(-craftSize * 0.53, craftSize * 0.68);
  context.lineTo(-craftSize * 0.27, craftSize * 0.68);
  context.moveTo(craftSize * 0.53, craftSize * 0.68);
  context.lineTo(craftSize * 0.27, craftSize * 0.68);
  context.strokeStyle = '#dfe4ea';
  context.lineWidth = 2;
  context.stroke();

  context.beginPath();
  context.arc(0, craftSize * 0.08, craftSize * 0.1, 0, Math.PI * 2);
  context.fillStyle = '#53616f';
  context.fill();
  context.restore();

  if (forecast && forecast < 10 && flight.vy > 3.5) {
    context.beginPath();
    context.arc(impactX, Math.min(height - 9, groundY - 5), 4, 0, Math.PI * 2);
    context.strokeStyle = forecastColor;
    context.lineWidth = 1.5;
    context.stroke();
  }
}

type Props = {
  flightRef: MutableRefObject<Flight>;
};

export default function LanderScene({ flightRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = () => {
      drawScene(context, width, height, flightRef.current);
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [flightRef]);

  return (
    <canvas
      ref={canvasRef}
      className="lander-scene"
      aria-label="Lander, projected flight path, landing angle, stars, and lunar terrain"
      role="img"
    />
  );
}
