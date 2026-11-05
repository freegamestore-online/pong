import { describe, it, expect, vi } from "vitest";
import { createState, resizeState, sizeCanvas, stepBall, MAX_BALL_SPEED, MAX_DT } from "../components/Game";

describe("stepBall", () => {
  it("caps ball speed however long the rally", () => {
    const s = createState(800, 600);
    s.serveTimer = 0;
    for (let i = 0; i < 200; i++) {
      s.ballX = 30;
      s.ballY = s.playerY;
      s.ballVX = -1;
      s.ballVY = 0;
      expect(stepBall(s, 1)).toBe("playerHit");
    }
    expect(s.ballSpeed).toBe(MAX_BALL_SPEED);
  });

  it("cannot tunnel through a paddle at top speed on a lag-spike frame", () => {
    for (let offset = 0; offset < 20; offset += 0.5) {
      const s = createState(800, 600);
      s.serveTimer = 0;
      s.rallyCount = 1000;
      s.ballX = 200 + offset;
      s.ballY = s.playerY;
      s.ballVX = -MAX_BALL_SPEED;
      s.ballVY = 0;
      let event = null;
      while (event === null) event = stepBall(s, MAX_DT);
      expect(event).toBe("playerHit");
    }
  });
});

describe("createState", () => {
  it("holds the first serve at centre", () => {
    const s = createState(800, 600);
    expect(s.serveTimer).toBeGreaterThan(0);
    stepBall(s, 1);
    expect(s.ballX).toBe(400);
  });
});

describe("resizeState", () => {
  it("keeps ball and paddles at the same relative position", () => {
    const s = createState(800, 600);
    s.ballX = 700;
    s.ballY = 150;
    s.playerY = 300;
    s.aiY = 450;
    resizeState(s, 400, 300);
    expect([s.ballX, s.ballY, s.playerY, s.aiY]).toEqual([350, 75, 150, 225]);
    // The ball was inside the court and stays inside: no free point
    expect(stepBall(s, 0)).toBeNull();
  });
});

describe("sizeCanvas", () => {
  it("sizes the backing store in device pixels and scales drawing to CSS pixels", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const canvas = document.createElement("canvas");
    const setTransform = vi.fn();
    sizeCanvas(canvas, { setTransform } as unknown as CanvasRenderingContext2D, 300, 200);
    expect([canvas.width, canvas.height]).toEqual([900, 600]);
    expect(setTransform).toHaveBeenCalledWith(3, 0, 0, 3, 0, 0);
    vi.unstubAllGlobals();
  });
});
