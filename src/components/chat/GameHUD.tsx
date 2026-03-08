import React, { useMemo } from "react";
import { Heart, Flame, Sparkles, Crosshair, Zap, Pause } from "lucide-react";

// ── TYPES ─────────────────────────────────────────────────────────────────────

export interface GameHUDProps {
  score: number;
  health: number;
  maxHealth: number;
  combo: number;
  comboMultiplier: number;
  specialPercent: number; // 0-100
  wave: number;
  totalWaves: number;
  enemiesRemaining: number;
  powerLevel: number;
  isPaused: boolean;
  onPause: () => void;
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

function ScorePanel({ score }: { score: number }) {
  return (
    <div className="relative bg-gradient-to-br from-black/80 to-black/60 backdrop-blur-md rounded-lg border border-cyan-500/30 px-3 py-2 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent pointer-events-none" />
      <p className="text-[10px] font-bold tracking-wider text-cyan-400/80 uppercase select-none">Score</p>
      <p className="text-2xl font-mono tabular-nums text-white leading-none mt-0.5 select-none">{score.toLocaleString()}</p>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
    </div>
  );
}

function HealthBar({ health, maxHealth }: { health: number; maxHealth: number }) {
  const pct = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const isLow = pct < 25;
  const isMid = pct >= 25 && pct <= 50;

  const barColor = isLow ? "bg-red-500" : isMid ? "bg-yellow-400" : "bg-emerald-500";
  const iconBg = isLow ? "bg-red-500/30" : isMid ? "bg-yellow-400/30" : "bg-emerald-500/30";
  const iconColor = isLow ? "text-red-400" : isMid ? "text-yellow-400" : "text-emerald-400";

  return (
    <div
      className={`relative bg-gradient-to-br from-black/80 to-black/60 backdrop-blur-md rounded-lg border px-3 py-2 transition-all duration-200 ${
        isLow ? "border-red-500/60 shadow-lg shadow-red-500/20 animate-pulse" : "border-white/10"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 md:w-7 md:h-7 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
          <Heart className={`w-3 h-3 md:w-4 md:h-4 ${iconColor}`} fill="currentColor" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold tracking-wider text-white/60 uppercase select-none">HP</span>
            <span className="text-[10px] font-mono tabular-nums text-white/80 select-none">
              {health}/{maxHealth}
            </span>
          </div>
          <div className="relative h-2.5 w-full bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} rounded-full transition-all duration-300`}
              style={{ width: `${pct}%` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent rounded-full pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ComboIndicator({ combo, multiplier }: { combo: number; multiplier: number }) {
  if (combo < 2) return null;

  const isHigh = combo >= 10;
  const isMed = combo >= 5;

  const borderColor = isHigh ? "border-pink-500/40" : isMed ? "border-yellow-500/40" : "border-cyan-500/40";
  const textColor = isHigh ? "text-pink-400" : isMed ? "text-yellow-400" : "text-cyan-400";
  const iconColor = isHigh ? "text-pink-400" : isMed ? "text-yellow-400" : "text-cyan-400";
  const shadow = isHigh
    ? "shadow-lg shadow-pink-500/30"
    : isMed
      ? "shadow-lg shadow-yellow-500/20"
      : "shadow-md shadow-cyan-500/15";

  return (
    <div
      className={`relative bg-gradient-to-br from-black/80 to-black/60 backdrop-blur-md rounded-lg border ${borderColor} ${shadow} px-3 py-2 animate-pulse transition-all duration-200`}
    >
      <div className="flex items-center gap-2">
        <Flame className={`w-3.5 h-3.5 md:w-4 md:h-4 ${iconColor}`} />
        <div>
          <span className={`text-lg md:text-xl font-mono font-bold tabular-nums leading-none ${textColor} select-none`}>
            {combo}x
          </span>
          <span className="text-[9px] text-white/40 block select-none">×{multiplier.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

function SpecialAttackIndicator({ percent, isMobile }: { percent: number; isMobile?: boolean }) {
  const isReady = percent >= 100;
  const isCharging = percent >= 80 && percent < 100;

  const circumference = 2 * Math.PI * 18;
  const dashOffset = circumference - (circumference * Math.min(percent, 100)) / 100;

  return (
    <div
      className={`relative bg-gradient-to-br from-black/80 to-black/60 backdrop-blur-md rounded-lg border transition-all duration-200 px-2 py-2 ${
        isReady
          ? "border-yellow-400/60 shadow-lg shadow-yellow-400/20"
          : "border-white/10"
      }`}
      style={
        isReady
          ? { boxShadow: "0 0 12px rgba(251,191,36,0.3), 0 0 24px rgba(251,191,36,0.1)" }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        {/* SVG ring */}
        <div className="relative w-10 h-10 md:w-12 md:h-12 shrink-0">
          <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
            <circle
              cx="20"
              cy="20"
              r="18"
              fill="none"
              stroke={isReady ? "#fbbf24" : isCharging ? "#facc15" : "rgba(255,255,255,0.3)"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isReady && (
              <div className="absolute inset-1 rounded-full bg-yellow-400/20 animate-ping" style={{ animationDuration: "1.5s" }} />
            )}
            <Sparkles
              className={`w-4 h-4 md:w-5 md:h-5 transition-colors ${
                isReady ? "text-yellow-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" : isCharging ? "text-yellow-400/70" : "text-white/30"
              }`}
            />
          </div>
        </div>
        <div className="flex flex-col select-none">
          {isReady ? (
            <span className="text-[11px] font-bold text-yellow-300 tracking-wide animate-pulse">READY!</span>
          ) : (
            <span className="text-sm font-mono tabular-nums text-white/80">{Math.round(percent)}%</span>
          )}
          <span className="text-[9px] text-white/40 tracking-wider uppercase">Special</span>
          {!isMobile && <span className="text-[8px] text-white/25 tracking-widest mt-0.5">Q KEY</span>}
        </div>
      </div>
    </div>
  );
}

function WaveDisplay({ wave, totalWaves, compact }: { wave: number; totalWaves: number; compact?: boolean }) {
  return (
    <div className="relative bg-gradient-to-br from-black/80 to-black/60 backdrop-blur-md rounded-lg border border-purple-500/30 px-3 py-2 shadow-lg shadow-purple-500/10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent pointer-events-none" />
      <p className="text-[10px] font-bold tracking-wider text-purple-400/80 uppercase select-none">Wave</p>
      <div className={`flex items-baseline gap-1 ${compact ? "" : "mt-0.5"}`}>
        <span className={`${compact ? "text-xl" : "text-3xl"} font-mono tabular-nums font-bold text-purple-400 leading-none select-none`}>
          {wave}
        </span>
        <span className="text-white/30 text-sm select-none">/</span>
        <span className={`${compact ? "text-sm" : "text-lg"} font-mono tabular-nums text-white/50 leading-none select-none`}>
          {totalWaves}
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
  borderColor,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  borderColor: string;
  iconColor: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 bg-gradient-to-br from-black/80 to-black/60 backdrop-blur-md rounded-lg border ${borderColor} px-2.5 py-1.5`}>
      <Icon className={`w-3 h-3 md:w-3.5 md:h-3.5 ${iconColor}`} />
      <span className="text-[10px] md:text-xs font-mono tabular-nums text-white/80 select-none">{label}</span>
    </div>
  );
}

function PauseButton({ isPaused, onPause }: { isPaused: boolean; onPause: () => void }) {
  return (
    <button
      onClick={onPause}
      title={isPaused ? "Resume" : "Pause"}
      className="pointer-events-auto relative bg-gradient-to-br from-black/80 to-black/60 backdrop-blur-md rounded-lg border border-white/10 p-2 transition-all duration-200 hover:scale-105 active:scale-95 hover:border-cyan-500/40 group"
    >
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-cyan-500/0 to-cyan-500/0 group-hover:from-cyan-500/5 group-hover:to-transparent transition-all duration-200 pointer-events-none" />
      <Pause className="w-4 h-4 md:w-5 md:h-5 text-white/60 group-hover:text-cyan-400 transition-colors" />
    </button>
  );
}

// ── MAIN HUD ──────────────────────────────────────────────────────────────────

const GameHUD: React.FC<GameHUDProps> = React.memo(({
  score,
  health,
  maxHealth,
  combo,
  comboMultiplier,
  specialPercent,
  wave,
  totalWaves,
  enemiesRemaining,
  powerLevel,
  isPaused,
  onPause,
}) => {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div
      className="absolute z-30 pointer-events-none select-none"
      style={{
        top: "max(12px, env(safe-area-inset-top))",
        left: "max(12px, calc(env(safe-area-inset-left) + 12px))",
        right: "max(12px, calc(env(safe-area-inset-right) + 12px))",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* ── Left Column ── */}
        <div className="flex flex-col gap-2 min-w-0">
          <ScorePanel score={score} />
          <HealthBar health={health} maxHealth={maxHealth} />
          <ComboIndicator combo={combo} multiplier={comboMultiplier} />
          {/* Special – mobile only shows here */}
          <div className="md:hidden">
            <SpecialAttackIndicator percent={specialPercent} isMobile />
          </div>
        </div>

        {/* ── Center Column (desktop only) ── */}
        <div className="hidden md:flex flex-col items-center">
          <WaveDisplay wave={wave} totalWaves={totalWaves} />
        </div>

        {/* ── Right Column ── */}
        <div className="flex flex-col gap-2 items-end min-w-0">
          <PauseButton isPaused={isPaused} onPause={onPause} />

          {/* Wave – mobile only */}
          <div className="md:hidden">
            <WaveDisplay wave={wave} totalWaves={totalWaves} compact />
          </div>

          {/* Stats pills */}
          <StatPill
            icon={Crosshair}
            label={`${enemiesRemaining}`}
            borderColor="border-orange-500/30"
            iconColor="text-orange-400"
          />
          <StatPill
            icon={Zap}
            label={`LV${powerLevel}`}
            borderColor="border-yellow-500/30"
            iconColor="text-yellow-400"
          />

          {/* Special – desktop only */}
          <div className="hidden md:block">
            <SpecialAttackIndicator percent={specialPercent} />
          </div>
        </div>
      </div>
    </div>
  );
});

GameHUD.displayName = "GameHUD";

export default GameHUD;
