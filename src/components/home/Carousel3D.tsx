import { useRef, useState, useCallback, useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface CarouselItem {
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
  color: "primary" | "teal" | "gold" | "success" | "warning";
  external?: boolean;
}

interface Carousel3DProps {
  items: CarouselItem[];
}

const iconColorMap: Record<string, string> = {
  primary: "text-primary-foreground",
  teal: "text-teal-foreground",
  gold: "text-gold-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
};

const glowColorMap: Record<string, string> = {
  primary: "shadow-[0_0_20px_hsl(348_83%_47%/0.4)]",
  teal: "shadow-[0_0_20px_hsl(174_72%_46%/0.4)]",
  gold: "shadow-[0_0_20px_hsl(43_51%_58%/0.4)]",
  success: "shadow-[0_0_20px_hsl(142_76%_36%/0.4)]",
  warning: "shadow-[0_0_20px_hsl(38_92%_50%/0.4)]",
};

const bgColorMap: Record<string, string> = {
  primary: "bg-primary",
  teal: "bg-teal",
  gold: "bg-gold",
  success: "bg-success",
  warning: "bg-warning",
};

export function Carousel3D({ items }: Carousel3DProps) {
  const navigate = useNavigate();
  const sliderRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const rotationRef = useRef(0);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startRotation = useRef(0);
  const dragDistance = useRef(0);
  const autoRotate = useRef(true);
  const autoResumeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Only used for snap animation class toggle
  const [snapping, setSnapping] = useState(false);

  const quantity = items.length;
  const increment = 360 / quantity;
  const cardSpacing = 185;
  const radius = Math.max(220, Math.round((quantity * cardSpacing) / (2 * Math.PI)));

  // Apply rotation directly to DOM — no React state updates per frame
  const applyRotation = useCallback(() => {
    if (sliderRef.current) {
      sliderRef.current.style.transform = `perspective(1500px) rotateX(-14deg) rotateY(${rotationRef.current}deg)`;
    }
  }, []);

  // Auto-rotate loop — pure DOM, zero state updates
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      if (autoRotate.current && !isDragging.current) {
        rotationRef.current += 0.04;
        applyRotation();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [applyRotation]);

  const stopAutoRotate = useCallback(() => {
    autoRotate.current = false;
    clearTimeout(autoResumeTimer.current);
  }, []);

  const resumeAutoRotate = useCallback((delay = 4000) => {
    clearTimeout(autoResumeTimer.current);
    autoResumeTimer.current = setTimeout(() => {
      autoRotate.current = true;
    }, delay);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      stopAutoRotate();
      isDragging.current = true;
      startX.current = e.clientX;
      startRotation.current = rotationRef.current;
      dragDistance.current = 0;
      setSnapping(false);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [stopAutoRotate]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const walk = (e.clientX - startX.current) * 0.35;
    dragDistance.current = Math.abs(walk);
    rotationRef.current = startRotation.current + walk;
    applyRotation();
  }, [applyRotation]);

  const onPointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    resumeAutoRotate();
  }, [resumeAutoRotate]);

  const handleItemClick = useCallback(
    (item: CarouselItem, index: number) => {
      if (dragDistance.current > 5) return;

      const targetRotation = -(index * increment);
      const currentMod = ((rotationRef.current % 360) + 360) % 360;
      const targetMod = ((targetRotation % 360) + 360) % 360;
      let diff = targetMod - currentMod;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      if (Math.abs(diff) < 2) {
        if (item.external) {
          window.open(item.url, "_blank");
        } else {
          navigate(item.url);
        }
        return;
      }

      // Animate snap via CSS transition
      stopAutoRotate();
      setActiveIndex(index);
      setSnapping(true);
      rotationRef.current += diff;
      applyRotation();
      setTimeout(() => {
        setActiveIndex(null);
        setSnapping(false);
        resumeAutoRotate(2000);
      }, 800);
    },
    [increment, navigate, stopAutoRotate, resumeAutoRotate, applyRotation]
  );

  return (
    <div className="relative w-full select-none mt-10 overflow-visible" style={{ height: "clamp(320px, 44vh, 440px)" }}>
      <div
        ref={sliderRef}
        className={cn(
          "absolute cursor-grab active:cursor-grabbing touch-none",
          snapping && "transition-transform duration-700 ease-out"
        )}
        style={{
          width: "160px",
          height: "210px",
          top: "28%",
          left: "calc(50% - 75px)",
          transformStyle: "preserve-3d",
          transform: `perspective(1500px) rotateX(-14deg) rotateY(0deg)`,
          willChange: "transform",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {items.map((item, i) => {
          const angle = i * increment;
          const isActive = activeIndex === i;
          return (
            <div
              key={item.url}
              className="absolute inset-0 group/card"
              style={{
                transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                transformStyle: "preserve-3d",
              }}
              onClick={() => handleItemClick(item, i)}
            >
              <div
                className={cn(
                  "w-full h-full rounded-xl border flex flex-col items-center justify-center gap-2.5 pointer-events-none",
                  "bg-card border-border/60 transition-transform duration-300",
                  "group-hover/card:scale-110",
                  isActive && "ring-2 ring-primary/60 scale-105",
                  glowColorMap[item.color]
                )}
                style={{
                  boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <div
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center transition-transform duration-300 group-hover/card:scale-125",
                    bgColorMap[item.color]
                  )}
                >
                  <item.icon className={cn("h-7 w-7 transition-transform duration-300 group-hover/card:scale-110", iconColorMap[item.color])} strokeWidth={1.8} />
                </div>
                <span className="text-[11px] font-bold text-foreground font-display text-center leading-tight px-2 drop-shadow-sm transition-transform duration-300 group-hover/card:scale-115">
                  {item.title}
                </span>
              </div>

              {/* Floating label — use text-shadow instead of backdrop-blur over animated 3D */}
              <div
                className="absolute -top-7 left-1/2 whitespace-nowrap pointer-events-none"
                style={{ transform: "translateX(-50%) translateZ(30px)" }}
              >
                <span className="text-[10px] font-semibold text-foreground/80 dark:text-muted-foreground bg-card px-2.5 py-1 rounded-full border border-border/50 shadow-sm"
                  style={{ textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
                >
                  {item.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ground shadow */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full opacity-20 dark:opacity-30"
        style={{
          width: `${radius * 1.8}px`,
          height: "60px",
          background: "radial-gradient(ellipse, hsl(var(--primary) / 0.15) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-muted-foreground/60 text-[10px] font-medium">
        <span>← drag to explore →</span>
      </div>
    </div>
  );
}