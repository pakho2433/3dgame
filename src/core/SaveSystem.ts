import type { SaveData, SettingsState } from "../utils/types";

const SAVE_KEY = "qingming-riverside-save-v1";

export const defaultSettings = (): SettingsState => ({
  masterVolume: 0.75,
  ambienceVolume: 0.55,
  sfxVolume: 0.8,
  textScale: 1,
  cameraSensitivity: 1,
  mobileSensitivity: 1,
  reducedCameraMotion: false,
  highContrastPrompts: true,
  screenShake: false,
  quality: "medium",
});

export class SaveSystem {
  hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  load(): SaveData | undefined {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (
        parsed.version !== 1 ||
        !parsed.player ||
        !Array.isArray(parsed.player.position) ||
        !parsed.quests ||
        !Array.isArray(parsed.inventory)
      ) {
        throw new Error("Invalid save schema");
      }
      return {
        version: 1,
        player: {
          position: [
            Number(parsed.player.position[0]) || -24,
            Number(parsed.player.position[1]) || 1.7,
            Number(parsed.player.position[2]) || 1,
          ],
          yaw: Number(parsed.player.yaw) || 0,
          pitch: Number(parsed.player.pitch) || 0,
        },
        quests: parsed.quests,
        inventory: parsed.inventory,
        discoveredHistory: Array.isArray(parsed.discoveredHistory) ? parsed.discoveredHistory : [],
        settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
        unlocked: {
          bridgeTradeCard: Boolean(parsed.unlocked?.bridgeTradeCard),
        },
        savedAt: Number(parsed.savedAt) || Date.now(),
      };
    } catch (error) {
      console.warn("Corrupted Qingming save ignored.", error);
      localStorage.removeItem(SAVE_KEY);
      return undefined;
    }
  }

  save(data: SaveData): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn("Unable to save Qingming progress.", error);
    }
  }

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }
}
