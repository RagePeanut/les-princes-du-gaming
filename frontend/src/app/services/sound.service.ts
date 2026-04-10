import { Injectable, signal } from '@angular/core';

type SoundName =
  | 'gameStart'
  | 'timerTick'
  | 'timerUrgent'
  | 'submit'
  | 'roundEnd'
  | 'gameEnd'
  | 'drop'
  | 'confirm'
  | 'countdown'
  | 'rouletteTick'
  | 'rouletteResult'
  | 'playerJoin'
  | 'settingChange'
  | 'toggleOn'
  | 'toggleOff'
  | 'copyLink';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private ctx: AudioContext | null = null;
  readonly muted = signal(this.loadMutedState());

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  toggleMute(): void {
    this.muted.update((v) => !v);
    try {
      localStorage.setItem('sound_muted', String(this.muted()));
    } catch {}
  }

  private loadMutedState(): boolean {
    try {
      return localStorage.getItem('sound_muted') === 'true';
    } catch {
      return false;
    }
  }

  play(sound: SoundName): void {
    if (this.muted()) return;
    try {
      this.sounds[sound]();
    } catch {}
  }

  private readonly sounds: Record<SoundName, () => void> = {
    gameStart: () => this.playTone([440, 554, 659, 880], 0.12, 'sine', 0.3),
    timerTick: () => this.playTone([800], 0.05, 'sine', 0.08),
    timerUrgent: () => this.playTone([900, 600], 0.08, 'square', 0.12),
    submit: () => this.playTone([523, 659], 0.1, 'sine', 0.2),
    roundEnd: () => this.playTone([523, 659, 784], 0.15, 'sine', 0.25),
    gameEnd: () => this.playTone([523, 659, 784, 1047], 0.18, 'sine', 0.3),
    drop: () => this.playTone([300, 400], 0.06, 'triangle', 0.12),
    confirm: () => this.playTone([600, 800], 0.08, 'sine', 0.18),
    countdown: () => this.playTone([440], 0.1, 'square', 0.1),
    rouletteTick: () => this.playTone([500], 0.03, 'triangle', 0.06),
    rouletteResult: () => this.playTone([440, 554, 659], 0.2, 'sine', 0.3),
    playerJoin: () => this.playTone([400, 500], 0.08, 'sine', 0.12),
    settingChange: () => this.playTone([350], 0.04, 'triangle', 0.06),
    toggleOn: () => this.playTone([400, 600], 0.06, 'sine', 0.1),
    toggleOff: () => this.playTone([500, 350], 0.06, 'sine', 0.1),
    copyLink: () => this.playTone([600, 750], 0.06, 'sine', 0.12),
  };

  private playTone(
    frequencies: number[],
    noteDuration: number,
    type: OscillatorType,
    volume: number
  ): void {
    const ctx = this.getCtx();
    const now = ctx.currentTime;

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, now + i * noteDuration);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (i + 1) * noteDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * noteDuration);
      osc.stop(now + (i + 1) * noteDuration + 0.01);
    });
  }
}
