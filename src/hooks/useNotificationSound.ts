/**
 * Unified notification sound utility using Web Audio API.
 * Three distinct tones: message, notification, call.
 * Respects the chatSoundEnabled localStorage preference.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function isSoundEnabled(): boolean {
  return localStorage.getItem('chatSoundEnabled') !== 'false';
}

/** Play an audio file from the public/sounds directory */
function playAudioFile(path: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(path);
      audio.volume = 0.5;
      audio.play().then(resolve).catch(() => resolve());
    } catch {
      resolve();
    }
  });
}

/** Play incoming message sound */
function playMessageTone() {
  playAudioFile('/sounds/incoming-message.wav');
}

/** Play a single 600 Hz bell-like tone (general notification) */
function playNotificationTone() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  gain.gain.setValueAtTime(0.18, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

/** Play a repeating two-note ringtone pattern. Returns a stop() handle. */
function playCallTone(): { stop: () => void } {
  const ctx = getAudioContext();
  if (!ctx) return { stop: () => {} };

  let stopped = false;
  let timeout: ReturnType<typeof setTimeout>;
  const oscillators: OscillatorNode[] = [];

  function ring() {
    if (stopped || !ctx) return;

    // Two-note beep: high then low
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'square';
      osc.frequency.setValueAtTime(i === 0 ? 880 : 660, ctx.currentTime + i * 0.18);
      gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.15);

      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.15);
      oscillators.push(osc);
    }

    // Repeat every 1.2 seconds
    timeout = setTimeout(ring, 1200);
  }

  ring();

  // Auto-stop after 10 seconds
  const autoStop = setTimeout(() => {
    stopped = true;
    clearTimeout(timeout);
  }, 10000);

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timeout);
      clearTimeout(autoStop);
    },
  };
}

// ── Deduplication for message sounds (prevents FloatingChat + Toast double-ping) ──
const recentlyPlayedMessageIds = new Set<string>();

export function markMessageSoundPlayed(messageId: string) {
  recentlyPlayedMessageIds.add(messageId);
  setTimeout(() => recentlyPlayedMessageIds.delete(messageId), 5000);
}

export function wasMessageSoundPlayed(messageId: string): boolean {
  return recentlyPlayedMessageIds.has(messageId);
}

// ── Public API ──

/**
 * Play a notification sound. Returns a stop handle for the 'call' type.
 */
/** Play outgoing message sound */
export function playOutgoingMessageSound() {
  if (!isSoundEnabled()) return;
  playAudioFile('/sounds/outgoing-message.wav');
}

/** Play notice board add/complete sound */
export function playNoticeBoardSound() {
  if (!isSoundEnabled()) return;
  playAudioFile('/sounds/notice-board-add.wav');
}

/**
 * Play a short, uplifting three-note jingle to confirm a successful login.
 * Ascending major triad arpeggio (C5 → E5 → G5) with a soft sine timbre.
 */
export function playLoginJingle() {
  if (!isSoundEnabled()) return;
  playAudioFile('/sounds/login-jingle.wav');
}

export function playNotificationSound(
  type: 'message' | 'notification' | 'call'
): { stop: () => void } | void {
  if (!isSoundEnabled()) return;

  switch (type) {
    case 'message':
      playMessageTone();
      return;
    case 'notification':
      playNotificationTone();
      return;
    case 'call':
      return playCallTone();
  }
}
