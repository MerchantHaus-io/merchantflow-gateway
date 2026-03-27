import { useEffect, useRef, memo } from "react";

const STAR_COUNT = 220;
const SPEED = 0.15;

// Shooting star timing
const SHOOT_MIN_DELAY = 8000; // 8s
const SHOOT_MAX_DELAY = 20000; // 20s

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  opacity: number;
}

interface ShootingStar {
  x: number;
  y: number;
  angle: number;
  speed: number;
  length: number;
  progress: number;
  duration: number;
  active: boolean;
}

function createStars(w: number, h: number): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    z: Math.random(),
    size: Math.random() * 1.8 + 0.4,
    opacity: Math.random() * 0.6 + 0.2,
  }));
}

function spawnShootingStar(w: number, h: number): ShootingStar {
  // Spawn from top or left edge, streak downward-right at a slight angle
  const fromTop = Math.random() > 0.3;
  const x = fromTop ? Math.random() * w * 0.8 : 0;
  const y = fromTop ? 0 : Math.random() * h * 0.4;
  const angle = (Math.PI / 6) + Math.random() * (Math.PI / 6); // 30°–60° downward
  return {
    x,
    y,
    angle,
    speed: 1,
    length: 80 + Math.random() * 100, // 80–180px tail
    progress: 0,
    duration: 400 + Math.random() * 400, // 0.4–0.8s
    active: true,
  };
}

function randomDelay(): number {
  return SHOOT_MIN_DELAY + Math.random() * (SHOOT_MAX_DELAY - SHOOT_MIN_DELAY);
}

const Starfield = memo(function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number>(0);
  const shootRef = useRef<ShootingStar>({ x: 0, y: 0, angle: 0, speed: 0, length: 0, progress: 0, duration: 0, active: false });
  const nextSpawnRef = useRef<number>(Date.now() + randomDelay());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      starsRef.current = createStars(canvas.offsetWidth, canvas.offsetHeight);
    };

    resize();
    window.addEventListener("resize", resize);

    let lastTime = 0;
    const animate = (time: number) => {
      const dt = lastTime ? (time - lastTime) / 16 : 1;
      const dtMs = lastTime ? time - lastTime : 16;
      lastTime = time;

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      // ── Regular stars ──
      for (const star of starsRef.current) {
        star.y -= SPEED * (0.5 + star.z) * dt;
        star.x += Math.sin(time * 0.0003 + star.z * 10) * 0.04 * dt;

        const twinkle = 0.5 + 0.5 * Math.sin(time * 0.002 + star.z * 20);
        const alpha = star.opacity * (0.6 + 0.4 * twinkle);

        if (star.y < -2) {
          star.y = h + 2;
          star.x = Math.random() * w;
        }
        if (star.x < -2) star.x = w + 2;
        if (star.x > w + 2) star.x = -2;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }

      // ── Shooting star ──
      const shoot = shootRef.current;
      const now = Date.now();

      if (!shoot.active && now >= nextSpawnRef.current) {
        shootRef.current = spawnShootingStar(w, h);
      }

      if (shoot.active) {
        shoot.progress += dtMs / shoot.duration;

        if (shoot.progress >= 1) {
          shoot.active = false;
          nextSpawnRef.current = now + randomDelay();
        } else {
          const t = shoot.progress;
          const headDist = t * (w * 0.45 + shoot.length);
          const headX = shoot.x + Math.cos(shoot.angle) * headDist;
          const headY = shoot.y + Math.sin(shoot.angle) * headDist;
          const tailX = headX - Math.cos(shoot.angle) * shoot.length;
          const tailY = headY - Math.sin(shoot.angle) * shoot.length;

          // Fade in at start, fade out at end
          const fade = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;

          const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
          grad.addColorStop(0, `rgba(255,255,255,0)`);
          grad.addColorStop(0.6, `rgba(255,255,255,${0.3 * fade})`);
          grad.addColorStop(1, `rgba(255,255,255,${0.9 * fade})`);

          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(headX, headY);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5;
          ctx.lineCap = "round";
          ctx.stroke();

          // Bright head dot
          ctx.beginPath();
          ctx.arc(headX, headY, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${0.95 * fade})`;
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[2] opacity-50"
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
});

export default Starfield;
