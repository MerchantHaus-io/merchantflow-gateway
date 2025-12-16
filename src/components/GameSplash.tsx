import { useEffect } from "react";

interface GameSplashProps {
  type: "1up" | "level-up" | "death";
  show: boolean;
  onComplete: () => void;
}

const GameSplash = ({ type, show, onComplete }: GameSplashProps) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onComplete();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  const config = {
    "1up": {
      text: "1UP",
      color: "text-green-400",
      shadow: "0 0 20px #22c55e, 0 0 40px #22c55e, 0 0 60px #22c55e",
      size: "text-4xl md:text-5xl",
    },
    "level-up": {
      text: "LEVEL UP",
      color: "text-yellow-400",
      shadow: "0 0 20px #facc15, 0 0 40px #facc15, 0 0 60px #facc15",
      size: "text-4xl md:text-5xl",
    },
    death: {
      text: "YOU DIED",
      color: "text-red-600",
      shadow: "0 0 30px #dc2626, 0 0 60px #dc2626, 0 0 90px #dc2626",
      size: "text-6xl md:text-8xl",
    },
  };

  const { text, color, shadow, size } = config[type];

  return (
    <div className="fixed bottom-8 right-8 z-[9999] animate-fade-in pointer-events-none">
      <h1
        className={`${size} font-black ${color} tracking-widest`}
        style={{
          textShadow: shadow,
          fontFamily: '"Press Start 2P", monospace, system-ui',
        }}
      >
        {text}
      </h1>
    </div>
  );
};

export default GameSplash;
