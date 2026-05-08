import { useRef, useEffect, useCallback } from "react";

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
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

interface GameState {
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
  alive: boolean;
  canvasW: number;
  canvasH: number;
}

function createState(w: number, h: number): GameState {
  const angle = (Math.random() * 0.5 - 0.25) * Math.PI;
  const dir = Math.random() < 0.5 ? 1 : -1;
  return {
    playerY: h / 2,
    aiY: h / 2,
    ballX: w / 2,
    ballY: h / 2,
    ballVX: Math.cos(angle) * BASE_BALL_SPEED * dir,
    ballVY: Math.sin(angle) * BASE_BALL_SPEED,
    playerScore: 0,
    aiScore: 0,
    ballSpeed: BASE_BALL_SPEED,
    rallyCount: 0,
    alive: true,
    canvasW: w,
    canvasH: h,
  };
}

function resetBall(s: GameState) {
  s.ballX = s.canvasW / 2;
  s.ballY = s.canvasH / 2;
  s.ballSpeed = BASE_BALL_SPEED;
  s.rallyCount = 0;
  const angle = (Math.random() * 0.5 - 0.25) * Math.PI;
  const dir = Math.random() < 0.5 ? 1 : -1;
  s.ballVX = Math.cos(angle) * s.ballSpeed * dir;
  s.ballVY = Math.sin(angle) * s.ballSpeed;
}

export function Game({ onScore, onGameOver, paused }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const onScoreRef = useRef(onScore);
  const onGameOverRef = useRef(onGameOver);
  const pausedRef = useRef(paused);
  onScoreRef.current = onScore;
  onGameOverRef.current = onGameOver;
  pausedRef.current = paused;

  // Touch support: track touch Y on left half of screen
  const touchYRef = useRef<number | null>(null);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = w;
    canvas.height = h;
    if (stateRef.current) {
      stateRef.current.canvasW = w;
      stateRef.current.canvasH = h;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    resize();
    stateRef.current = createState(canvas.width, canvas.height);

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    const handleTouchStart = (e: TouchEvent) => {
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i]!;
        if (touch.clientX < window.innerWidth / 2) {
          touchYRef.current = touch.clientY;
        }
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i]!;
        if (touch.clientX < window.innerWidth / 2) {
          touchYRef.current = touch.clientY;
        }
      }
    };
    const handleTouchEnd = () => {
      touchYRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("resize", resize);
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true });

    const ctx = canvas.getContext("2d")!;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.667, 3); // normalize to ~60fps
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

      // Move ball
      s.ballX += s.ballVX * dt;
      s.ballY += s.ballVY * dt;

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
        s.rallyCount++;
        s.ballSpeed = BASE_BALL_SPEED + s.rallyCount * SPEED_INCREMENT;
        const hitPos = (s.ballY - s.playerY) / (PADDLE_HEIGHT / 2); // -1 to 1
        const angle = hitPos * (Math.PI / 4); // max 45 degrees
        s.ballVX = Math.cos(angle) * s.ballSpeed;
        s.ballVY = Math.sin(angle) * s.ballSpeed;
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
        s.rallyCount++;
        s.ballSpeed = BASE_BALL_SPEED + s.rallyCount * SPEED_INCREMENT;
        const hitPos = (s.ballY - s.aiY) / (PADDLE_HEIGHT / 2); // -1 to 1
        const angle = hitPos * (Math.PI / 4); // max 45 degrees
        s.ballVX = -(Math.cos(angle) * s.ballSpeed);
        s.ballVY = Math.sin(angle) * s.ballSpeed;
      }

      // Score: ball passes left wall (AI scores)
      if (s.ballX + BALL_SIZE / 2 < 0) {
        s.aiScore++;
        if (s.aiScore >= WINNING_SCORE) {
          s.alive = false;
          onScoreRef.current(0); // player lost
          onGameOverRef.current();
          return;
        }
        resetBall(s);
      }

      // Score: ball passes right wall (player scores)
      if (s.ballX - BALL_SIZE / 2 > s.canvasW) {
        s.playerScore++;
        const scoreDiff = s.playerScore - s.aiScore;
        onScoreRef.current(Math.max(0, scoreDiff));
        if (s.playerScore >= WINNING_SCORE) {
          s.alive = false;
          onGameOverRef.current();
          return;
        }
        resetBall(s);
      }

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

      // Scores on canvas
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "bold 48px Fraunces, serif";
      ctx.textAlign = "center";
      ctx.fillText(String(s.playerScore), s.canvasW / 2 - 60, 60);
      ctx.fillText(String(s.aiScore), s.canvasW / 2 + 60, 60);

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
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [resize]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ touchAction: "none" }}
    />
  );
}
