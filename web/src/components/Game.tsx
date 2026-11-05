import { useRef, useEffect } from "react";
import { useGameSounds } from "@freegamestore/games";

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  onStats?: (stats: { playerScore: number; aiScore: number }) => void;
  paused?: boolean;
}

const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 10;
const PADDLE_MARGIN = 20;
const WINNING_SCORE = 11;
const BASE_BALL_SPEED = 5;
const SPEED_INCREMENT = 0.3;
const AI_SPEED = 4.5;
const SERVE_DELAY = 45; // frames (~0.75s) the ball waits at centre before a serve
// The paddle hit window is BALL_SIZE + PADDLE_WIDTH = 22px deep. Keeping the
// largest per-frame step (MAX_BALL_SPEED * MAX_DT = 18px) inside it means the
// ball cannot tunnel through a paddle, even on a lag spike.
export const MAX_BALL_SPEED = 12;
export const MAX_DT = 1.5; // frames

export interface GameState {
  playerY: number;
  aiY: number;
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  playerScore: number;
  aiScore: number;
  ballSpeed: number;
  rallyCount: number;
  serveTimer: number;
  alive: boolean;
  canvasW: number;
  canvasH: number;
}

export function createState(w: number, h: number): GameState {
  const s: GameState = {
    playerY: h / 2,
    aiY: h / 2,
    ballX: 0,
    ballY: 0,
    ballVX: 0,
    ballVY: 0,
    playerScore: 0,
    aiScore: 0,
    ballSpeed: BASE_BALL_SPEED,
    rallyCount: 0,
    serveTimer: 0,
    alive: true,
    canvasW: w,
    canvasH: h,
  };
  resetBall(s); // the first serve waits too, so a Restart doesn't fire the ball instantly
  return s;
}

function resetBall(s: GameState) {
  s.ballX = s.canvasW / 2;
  s.ballY = s.canvasH / 2;
  s.ballSpeed = BASE_BALL_SPEED;
  s.rallyCount = 0;
  s.serveTimer = SERVE_DELAY;
  const angle = (Math.random() * 0.5 - 0.25) * Math.PI;
  const dir = Math.random() < 0.5 ? 1 : -1;
  s.ballVX = Math.cos(angle) * s.ballSpeed * dir;
  s.ballVY = Math.sin(angle) * s.ballSpeed;
}

/** Keep paddles and ball at the same relative place when the canvas resizes. */
export function resizeState(s: GameState, w: number, h: number): void {
  if (s.canvasW > 0 && s.canvasH > 0) {
    const sx = w / s.canvasW;
    const sy = h / s.canvasH;
    s.ballX *= sx;
    s.ballY *= sy;
    s.playerY *= sy;
    s.aiY *= sy;
  }
  s.canvasW = w;
  s.canvasH = h;
}

/** Size the backing store in device pixels; drawing stays in CSS pixels. */
export function sizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function bounceOffPaddle(s: GameState, paddleY: number, dir: 1 | -1): void {
  s.rallyCount++;
  s.ballSpeed = Math.min(BASE_BALL_SPEED + s.rallyCount * SPEED_INCREMENT, MAX_BALL_SPEED);
  const hitPos = (s.ballY - paddleY) / (PADDLE_HEIGHT / 2); // -1 to 1
  const angle = hitPos * (Math.PI / 4); // max 45 degrees
  s.ballVX = dir * Math.cos(angle) * s.ballSpeed;
  s.ballVY = Math.sin(angle) * s.ballSpeed;
}

export type BallEvent = "playerHit" | "aiHit" | "playerPoint" | "aiPoint" | null;

/** Move the ball one step: walls, paddles and scoring (increments the score). */
export function stepBall(s: GameState, dt: number): BallEvent {
  // Held at centre during the serve delay
  if (s.serveTimer > 0) {
    s.serveTimer -= dt;
  } else {
    s.ballX += s.ballVX * dt;
    s.ballY += s.ballVY * dt;
  }

  // Ball bounce off top/bottom
  if (s.ballY - BALL_SIZE / 2 <= 0) {
    s.ballY = BALL_SIZE / 2;
    s.ballVY = Math.abs(s.ballVY);
  }
  if (s.ballY + BALL_SIZE / 2 >= s.canvasH) {
    s.ballY = s.canvasH - BALL_SIZE / 2;
    s.ballVY = -Math.abs(s.ballVY);
  }

  // Player paddle collision (left side)
  const playerPaddleX = PADDLE_MARGIN + PADDLE_WIDTH;
  if (
    s.ballVX < 0 &&
    s.ballX - BALL_SIZE / 2 <= playerPaddleX &&
    s.ballX - BALL_SIZE / 2 >= PADDLE_MARGIN - BALL_SIZE &&
    s.ballY >= s.playerY - PADDLE_HEIGHT / 2 &&
    s.ballY <= s.playerY + PADDLE_HEIGHT / 2
  ) {
    s.ballX = playerPaddleX + BALL_SIZE / 2;
    bounceOffPaddle(s, s.playerY, 1);
    return "playerHit";
  }

  // AI paddle collision (right side)
  const aiPaddleX = s.canvasW - PADDLE_MARGIN - PADDLE_WIDTH;
  if (
    s.ballVX > 0 &&
    s.ballX + BALL_SIZE / 2 >= aiPaddleX &&
    s.ballX + BALL_SIZE / 2 <= s.canvasW - PADDLE_MARGIN + BALL_SIZE &&
    s.ballY >= s.aiY - PADDLE_HEIGHT / 2 &&
    s.ballY <= s.aiY + PADDLE_HEIGHT / 2
  ) {
    s.ballX = aiPaddleX - BALL_SIZE / 2;
    bounceOffPaddle(s, s.aiY, -1);
    return "aiHit";
  }

  // Ball passes left wall (AI scores)
  if (s.ballX + BALL_SIZE / 2 < 0) {
    s.aiScore++;
    return "aiPoint";
  }
  // Ball passes right wall (player scores)
  if (s.ballX - BALL_SIZE / 2 > s.canvasW) {
    s.playerScore++;
    return "playerPoint";
  }
  return null;
}

export function Game({ onScore, onGameOver, onStats, paused }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const onScoreRef = useRef(onScore);
  const onGameOverRef = useRef(onGameOver);
  const onStatsRef = useRef(onStats);
  const pausedRef = useRef(paused);
  const sounds = useGameSounds();
  const soundsRef = useRef(sounds);
  onScoreRef.current = onScore;
  onGameOverRef.current = onGameOver;
  onStatsRef.current = onStats;
  pausedRef.current = paused;
  soundsRef.current = sounds;

  // Touch support: track touch Y on left half of screen
  const touchYRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const parent = canvas.parentElement!;

    sizeCanvas(canvas, ctx, parent.clientWidth, parent.clientHeight);
    stateRef.current = createState(parent.clientWidth, parent.clientHeight);

    const resize = () => {
      sizeCanvas(canvas, ctx, parent.clientWidth, parent.clientHeight);
      resizeState(stateRef.current!, parent.clientWidth, parent.clientHeight);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };
    // A key released while the window is unfocused never fires keyup
    const handleBlur = () => {
      keysRef.current.clear();
    };

    const handleTouchStart = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i]!;
        if (touch.clientX < rect.left + rect.width / 2) {
          touchYRef.current = touch.clientY;
        }
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i]!;
        if (touch.clientX < rect.left + rect.width / 2) {
          touchYRef.current = touch.clientY;
        }
      }
    };
    const handleTouchEnd = () => {
      touchYRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("resize", resize);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true });
    canvas.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.667, MAX_DT); // normalize to ~60fps
      lastTime = now;

      const s = stateRef.current!;
      if (!s.alive) return;

      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const keys = keysRef.current;
      const playerSpeed = 6;

      // Player paddle movement (keyboard)
      if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) {
        s.playerY -= playerSpeed * dt;
      }
      if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) {
        s.playerY += playerSpeed * dt;
      }

      // Player paddle movement (touch)
      if (touchYRef.current !== null) {
        const canvasRect = canvas.getBoundingClientRect();
        const relativeY = touchYRef.current - canvasRect.top;
        const targetY = relativeY;
        const diff = targetY - s.playerY;
        const maxMove = playerSpeed * dt * 2;
        if (Math.abs(diff) > maxMove) {
          s.playerY += Math.sign(diff) * maxMove;
        } else {
          s.playerY = targetY;
        }
      }

      // Clamp player paddle
      s.playerY = Math.max(PADDLE_HEIGHT / 2, Math.min(s.canvasH - PADDLE_HEIGHT / 2, s.playerY));

      // AI paddle movement — tracks ball with slight delay
      const aiTarget = s.ballY;
      const aiDiff = aiTarget - s.aiY;
      const aiMove = AI_SPEED * dt;
      if (Math.abs(aiDiff) > aiMove) {
        s.aiY += Math.sign(aiDiff) * aiMove;
      } else {
        s.aiY = aiTarget;
      }
      s.aiY = Math.max(PADDLE_HEIGHT / 2, Math.min(s.canvasH - PADDLE_HEIGHT / 2, s.aiY));

      const event = stepBall(s, dt);
      if (event === "playerHit") soundsRef.current.playMove();

      if (event === "aiPoint") {
        soundsRef.current.playError();
        if (s.aiScore >= WINNING_SCORE) {
          s.alive = false;
          soundsRef.current.playGameOver();
          onScoreRef.current(0); // player lost
          onGameOverRef.current();
          return;
        }
        resetBall(s);
      }

      if (event === "playerPoint") {
        soundsRef.current.playScore();
        const scoreDiff = s.playerScore - s.aiScore;
        onScoreRef.current(Math.max(0, scoreDiff));
        if (s.playerScore >= WINNING_SCORE) {
          s.alive = false;
          soundsRef.current.playGameOver();
          onGameOverRef.current();
          return;
        }
        resetBall(s);
      }

      // Report stats
      onStatsRef.current?.({ playerScore: s.playerScore, aiScore: s.aiScore });

      // Draw
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, s.canvasW, s.canvasH);

      // Center line
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.canvasW / 2, 0);
      ctx.lineTo(s.canvasW / 2, s.canvasH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Player paddle
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        PADDLE_MARGIN,
        s.playerY - PADDLE_HEIGHT / 2,
        PADDLE_WIDTH,
        PADDLE_HEIGHT,
      );

      // AI paddle
      ctx.fillRect(
        s.canvasW - PADDLE_MARGIN - PADDLE_WIDTH,
        s.aiY - PADDLE_HEIGHT / 2,
        PADDLE_WIDTH,
        PADDLE_HEIGHT,
      );

      // Ball
      ctx.beginPath();
      ctx.arc(s.ballX, s.ballY, BALL_SIZE / 2, 0, Math.PI * 2);
      ctx.fill();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ touchAction: "none" }}
    />
  );
}
