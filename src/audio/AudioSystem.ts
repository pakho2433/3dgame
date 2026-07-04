import type { SettingsState } from "../utils/types";

type AudioContextCtor = typeof AudioContext;

export class AudioSystem {
  private context?: AudioContext;
  private master?: GainNode;
  private ambience?: GainNode;
  private sfx?: GainNode;
  private ambienceStarted = false;
  private settings: SettingsState;
  private footstepTimer = 0;

  constructor(settings: SettingsState) {
    this.settings = settings;
  }

  setSettings(settings: SettingsState): void {
    this.settings = settings;
    this.applyVolumes();
  }

  resume(): void {
    this.ensureContext();
    void this.context?.resume();
    this.startAmbience();
  }

  update(dt: number, isMoving: boolean, isRunning: boolean): void {
    if (!this.context || !isMoving) {
      this.footstepTimer = 0;
      return;
    }
    this.footstepTimer -= dt;
    if (this.footstepTimer <= 0) {
      this.playNoiseBurst(isRunning ? 95 : 70, 0.025, 0.18);
      this.footstepTimer = isRunning ? 0.31 : 0.46;
    }
  }

  playDoor(): void {
    this.playTone(170, 0.08, 0.16, "sawtooth");
  }

  playCollect(): void {
    this.playTone(720, 0.05, 0.18, "triangle");
    window.setTimeout(() => this.playTone(980, 0.05, 0.12, "triangle"), 50);
  }

  playProgress(): void {
    this.playTone(520, 0.08, 0.16, "sine");
  }

  playComplete(): void {
    this.playTone(440, 0.09, 0.16, "triangle");
    window.setTimeout(() => this.playTone(660, 0.09, 0.14, "triangle"), 90);
    window.setTimeout(() => this.playTone(880, 0.12, 0.12, "triangle"), 180);
  }

  playClick(): void {
    this.playTone(320, 0.025, 0.09, "square");
  }

  private ensureContext(): void {
    if (this.context) {
      return;
    }
    const win = window as unknown as { webkitAudioContext?: AudioContextCtor };
    const Ctor = window.AudioContext ?? win.webkitAudioContext;
    if (!Ctor) {
      return;
    }
    try {
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.ambience = this.context.createGain();
      this.sfx = this.context.createGain();
      this.ambience.connect(this.master);
      this.sfx.connect(this.master);
      this.master.connect(this.context.destination);
      this.applyVolumes();
    } catch (error) {
      console.warn("WebAudio unavailable; continuing silently.", error);
    }
  }

  private startAmbience(): void {
    this.ensureContext();
    if (!this.context || !this.ambience || this.ambienceStarted) {
      return;
    }
    this.ambienceStarted = true;
    try {
      const river = this.context.createOscillator();
      river.type = "sine";
      river.frequency.value = 86;
      const market = this.context.createOscillator();
      market.type = "triangle";
      market.frequency.value = 132;
      const riverGain = this.context.createGain();
      const marketGain = this.context.createGain();
      riverGain.gain.value = 0.045;
      marketGain.gain.value = 0.018;
      river.connect(riverGain).connect(this.ambience);
      market.connect(marketGain).connect(this.ambience);
      river.start();
      market.start();
    } catch (error) {
      console.warn("Ambience fallback failed.", error);
    }
  }

  private playTone(
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
  ): void {
    this.ensureContext();
    if (!this.context || !this.sfx) {
      return;
    }
    try {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(gainValue, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      osc.connect(gain).connect(this.sfx);
      osc.start();
      osc.stop(this.context.currentTime + duration);
    } catch (error) {
      console.warn("SFX fallback failed.", error);
    }
  }

  private playNoiseBurst(frequency: number, duration: number, gainValue: number): void {
    this.playTone(frequency, duration, gainValue, "square");
  }

  private applyVolumes(): void {
    if (!this.master || !this.ambience || !this.sfx) {
      return;
    }
    this.master.gain.value = this.settings.masterVolume;
    this.ambience.gain.value = this.settings.ambienceVolume;
    this.sfx.gain.value = this.settings.sfxVolume;
  }
}
