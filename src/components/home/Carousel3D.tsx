import { useRef, useState, useEffect, useCallback } from "react";
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
  primary: "text-primary",
  teal: "text-teal",
  gold: "text-gold",
  success: "text-success",
  warning: "text-warning",
};

const glowColorMap: Record<string, string> = {
  primary: "shadow-[0_0_20px_hsl(348_83%_47%/0.4)]",
  teal: "shadow-[0_0_20px_hsl(174_72%_46%/0.4)]",
  gold: "shadow-[0_0_20px_hsl(43_51%_58%/0.4)]",
  success: "shadow-[0_0_20px_hsl(142_76%_36%/0.4)]",
  warning: "shadow-[0_0_20px_hsl(38_92%_50%/0.4)]",
};

const bgColorMap: Record<string, string> = {
  primary: "bg-primary/15",
  teal: "bg-teal/15",
  gold: "bg-gold/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
};

export function Carousel3D({ items }: Carousel3DProps) {
  const navigate = useNavigate();
  const sliderRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startRotation = useRef(0);
  const dragDistance = useRef(0);
  const autoRotate = useRef(true);
  const autoResumeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const quantity = items.length;
  const increment = 360 / quantity;
  // Adjust radius based on item count for spacing
  const radius = Math.max(320, quantity * 28);

  const updateRotation = useCallback((deg: number) => {
    rotationRef.current = deg;
    setRotation(deg);
  }, []);

  // Auto-rotate loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      if (autoRotate.current && !isDragging.current) {
        rotationRef.current += 0.04;
        setRotation(rotationRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

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

  // Pointer handlers
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      stopAutoRotate();
      isDragging.current = true;
      startX.current = e.clientX;
      startRotation.current = rotationRef.current;
      dragDistance.current = 0;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [stopAutoRotate]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const walk = (e.clientX - startX.current) * 0.35;
    dragDistance.current = Math.abs(walk);
    updateRotation(startRotation.current - walk);
  }, [updateRotation]);

  const onPointerUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    resumeAutoRotate();
  }, [resumeAutoRotate]);

  const handleItemClick = useCallback(
    (item: CarouselItem, index: number) => {
      if (dragDistance.current > 5) return; // was a drag, not a click

      // Snap to item
      const targetRotation = -(index * increment);
      const currentMod = ((rotationRef.current % 360) + 360) % 360;
      const targetMod = ((targetRotation % 360) + 360) % 360;
      let diff = targetMod - currentMod;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      const snapped = rotationRef.current + diff;

      if (Math.abs(diff) < 2) {
        // Already facing — navigate
        if (item.external) {
          window.open(item.url, "_blank");
        } else {
          navigate(item.url);
        }
        return;
      }

      // Animate snap
      stopAutoRotate();
      setActiveIndex(index);
      updateRotation(snapped);
      setTimeout(() => {
        setActiveIndex(null);
        resumeAutoRotate(2000);
      }, 800);
    },
    [increment, navigate, stopAutoRotate, resumeAutoRotate, updateRotation]
  );

  return (
    <div className="relative w-full select-none mt-6" style={{ height: "clamp(300px, 42vh, 420px)" }}>
      {/* 3D scene */}
      <div
        ref={sliderRef}
        className="absolute cursor-grab active:cursor-grabbing touch-none"
        style={{
          width: "140px",
          height: "170px",
          top: "12%",
          left: "calc(50% - 70px)",
          transformStyle: "preserve-3d",
          transform: `perspective(1500px) rotateX(-16deg) rotateY(${rotation}deg)`,
          transition: isDragging.current ? "none" : "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)",
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
              className="absolute inset-0"
              style={{
                transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                transition: "transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)",
              }}
              onClick={() => handleItemClick(item, i)}
            >
              {/* Card */}
              <div
                className={cn(
                  "w-full h-full rounded-xl border border-border/40 backdrop-blur-md flex flex-col items-center justify-center gap-2 pointer-events-none",
                  "bg-card/90 dark:bg-card/70",
                  isActive && "ring-2 ring-primary/60 scale-105",
                  glowColorMap[item.color]
                )}
                style={{
                  boxShadow: "0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
                  transition: "transform 0.3s, box-shadow 0.3s",
                }}
              >
                {/* Icon orb */}
                <div
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/10",
                    bgColorMap[item.color]
                  )}
                >
                  <item.icon className={cn("h-7 w-7", iconColorMap[item.color])} strokeWidth={1.8} />
                </div>

                {/* Title */}
                <span className="text-[11px] font-semibold text-foreground font-display text-center leading-tight px-1.5">
                  {item.title}
                </span>
              </div>

              {/* Floating label */}
              <div
                className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none"
                style={{ transform: "translateX(-50%) translateZ(30px)" }}
              >
                <span className="text-[10px] font-medium text-muted-foreground bg-card/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-border/30">
                  {item.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reflection / ground shadow */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full opacity-30"
        style={{
          width: `${radius * 1.8}px`,
          height: "60px",
          background: "radial-gradient(ellipse, hsl(var(--primary) / 0.15) 0%, transparent 70%)",
          filter: "blur(20px)",
        }}
      />

      {/* Drag hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-muted-foreground/50 text-[10px]">
        <span>← drag to explore →</span>
      </div>
    </div>
  );
}
