/**
 * Hybrid Smart Audio Engine: Web Audio POS Chimes, Pre-recorded Studio Audio & Foreign Voice Lock
 * King's Grill HR - Zero-Config Audio Architecture
 */

// Singleton Web Audio Context
let audioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

// Preloaded Audio Elements Cache
const audioCache: Map<string, HTMLAudioElement> = new Map();

/** Get or initialize AudioContext with iOS WebKit unlock */
function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Preload audio clips into memory for instant (<10ms) playback */
export function preloadAudioClips(keys: string[]) {
  if (typeof window === 'undefined') return;
  keys.forEach(key => {
    try {
      if (!audioCache.has(key)) {
        const audio = new Audio(`/audio/${key}.mp3`);
        audio.preload = 'auto';
        audioCache.set(key, audio);
      }
    } catch { /* ignore */ }
  });
}

/** Auto unlock AudioContext on first user touch/click (crucial for iOS Safari) */
export function setupAudioUnlock() {
  if (typeof window === 'undefined' || isAudioUnlocked) return;

  const unlock = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          isAudioUnlocked = true;
        }).catch(() => {});
      } else {
        isAudioUnlocked = true;
      }
      
      // Warm up audio elements on first user gesture
      audioCache.forEach(audio => {
        audio.load();
      });
    } catch { /* ignore */ }

    // Remove listeners once unlocked
    ['touchstart', 'touchend', 'click', 'keydown'].forEach(evt => {
      window.removeEventListener(evt, unlock);
    });
  };

  ['touchstart', 'touchend', 'click', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlock, { once: true, passive: true });
  });
}

/** Mobile Haptic Feedback helper */
function triggerHaptic(pattern: number | number[]) {
  try {
    if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch { /* ignore */ }
}

/**
 * TẦNG 1: Web Audio API Chimes (Hoạt động 100% không phụ thuộc internet hay file)
 */

/** Play bright, pleasant POS double chime (587Hz -> 880Hz) */
export function playPosSuccess() {
  try {
    triggerHaptic([50, 40, 50]);
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Note 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Note 2: A5 (880 Hz) - Higher harmonic
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1);
    gain2.gain.setValueAtTime(0.22, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.5);
  } catch { /* AudioContext safeguard */ }
}

/** Play gentle POS warning chime (440Hz -> 330Hz) */
export function playPosWarning() {
  try {
    triggerHaptic(100);
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(330, now + 0.25);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);
  } catch { /* AudioContext safeguard */ }
}

/** Play firm POS error double-pip (260Hz) */
export function playPosError() {
  try {
    triggerHaptic([80, 50, 80]);
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Pip 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(260, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.14);

    // Pip 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(220, now + 0.15);
    gain2.gain.setValueAtTime(0.18, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.35);
  } catch { /* AudioContext safeguard */ }
}

/**
 * TẦNG 2A: Pre-recorded Studio Vietnamese Audio Player
 */
export async function playPreRecordedAudio(clipKey: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    let audio = audioCache.get(clipKey);
    if (!audio) {
      audio = new Audio(`/audio/${clipKey}.mp3`);
      audioCache.set(clipKey, audio);
    }

    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
    return true;
  } catch {
    // Autoplay blocked by Safari or network failure -> Fallback to Web Audio chime
    return false;
  }
}

/**
 * TẦNG 2B: Strict Vietnamese Voice Detection & Lock for Web Speech API
 * Tuyệt đối chặn không cho trình duyệt tự ý dùng voice tiếng Anh/tiếng lạ đọc tiếng Việt.
 */
export function getVietnameseSpeechVoice(): SpeechSynthesisVoice | null {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Search for Vietnamese language tag
    const viVoice = voices.find(v => {
      const lang = (v.lang || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      return (
        lang.startsWith('vi') ||
        lang.includes('viet') ||
        name.includes('vietnam') ||
        name.includes('tiếng việt') ||
        name.includes('linh') ||
        name.includes('hoaimy') ||
        name.includes('an')
      );
    });

    return viVoice || null;
  } catch {
    return null;
  }
}

/**
 * Phát lời thoại với rào chắn khóa giọng ngoại ngữ (Foreign Voice Lock)
 * Trả về true nếu phát được bằng giọng tiếng Việt chuẩn, trả về false nếu thiết bị không có voice tiếng Việt.
 */
export function speakWithVietnameseLock(text: string): boolean {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;

    const viVoice = getVietnameseSpeechVoice();
    if (!viVoice) {
      // THIẾT BỊ KHÔNG CÓ GIỌNG TIẾNG VIỆT:
      // Tuyệt đối KHÔNG gọi speechSynthesis.speak() vì sẽ bị phát âm giọng Anh kỳ dị!
      return false;
    }

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = viVoice;
    utterance.lang = viVoice.lang || 'vi-VN';
    utterance.rate = 1.05;
    utterance.onerror = () => {};

    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}
