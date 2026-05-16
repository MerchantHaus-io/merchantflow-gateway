import { useCallback, useEffect, useState } from 'react';

interface UseChatSoundsOptions {
  enabled?: boolean;
  volume?: number;
}

export const useChatSounds = (options: UseChatSoundsOptions = {}) => {
  const { enabled = true, volume = 0.5 } = options;
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('chat-sound-enabled');
    return saved !== null ? saved === 'true' : enabled;
  });

  const playFile = useCallback((path: string) => {
    if (!soundEnabled) return;
    try {
      const audio = new Audio(path);
      audio.volume = volume;
      audio.play().catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }, [soundEnabled, volume]);

  const playMessageSound = useCallback(() => {
    playFile('/sounds/incoming-message.wav');
  }, [playFile]);

  const playSentSound = useCallback(() => {
    playFile('/sounds/outgoing-message.wav');
  }, [playFile]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('chat-sound-enabled', String(newValue));
      return newValue;
    });
  }, []);

  return {
    soundEnabled,
    setSoundEnabled,
    toggleSound,
    playMessageSound,
    playSentSound,
  };
};
