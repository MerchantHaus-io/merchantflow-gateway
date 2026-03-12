import { useEffect, useRef, memo } from "react";

const STAR_COUNT = 220;
const SPEED = 0.15;

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  opacity: number;
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

const Starfield = memo(function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number>(0);

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
      lastTime = time;

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      for (const star of starsRef.current) {
        // Gentle drift
        star.y -= SPEED * (0.5 + star.z) * dt;
        star.x += Math.sin(time * 0.0003 + star.z * 10) * 0.04 * dt;

        // Twinkle
        const twinkle = 0.5 + 0.5 * Math.sin(time * 0.002 + star.z * 20);
        const alpha = star.opacity * (0.6 + 0.4 * twinkle);

        // Wrap
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
      className="pointer-events-none fixed inset-0 z-[1]"
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    />
  );
});

export default Starfield;
