import * as THREE from "three";
import historyRows from "../data/historicalInfo.json";
import { AudioSystem } from "../audio/AudioSystem";
import { AssetManager } from "./AssetManager";
import { InputManager } from "./InputManager";
import { RendererSystem } from "./Renderer";
import { SaveSystem, defaultSettings } from "./SaveSystem";
import { InteractionSystem } from "../interaction/InteractionSystem";
import { InventorySystem } from "../inventory/InventorySystem";
import { NpcSystem } from "../npc/NpcSystem";
import { PlayerController } from "../player/PlayerController";
import { QuestSystem } from "../quests/QuestSystem";
import { UIManager } from "../ui/UIManager";
import { World } from "../world/World";
import type { GameDebugApi, HistoricalInfoData, SaveData, SettingsState } from "../utils/types";

const historyData = historyRows as HistoricalInfoData[];

export class Game {
  private readonly saveSystem = new SaveSystem();
  private readonly input = new InputManager();
  private readonly assets = new AssetManager();
  private readonly inventory = new InventorySystem();
  private readonly player = new PlayerController();
  private readonly clock = new THREE.Clock();
  private readonly discoveredHistory = new Set<string>();
  private readonly unlocked = { bridgeTradeCard: false };
  private settings: SettingsState = defaultSettings();
  private ui!: UIManager;
  private renderer!: RendererSystem;
  private interaction!: InteractionSystem;
  private quests!: QuestSystem;
  private world!: World;
  private npcs!: NpcSystem;
  private audio!: AudioSystem;
  private running = false;
  private elapsed = 0;
  private saveCooldown = 0;

  constructor(private readonly root: HTMLElement) {}

  async init(): Promise<void> {
    const saved = this.saveSystem.load();
    this.settings = saved?.settings ?? defaultSettings();
    this.ui = new UIManager(this.root, this.settings);
    this.ui.showLoading("正在建立 Three.js 場景...");

    try {
      this.renderer = new RendererSystem(this.ui.sceneRoot);
    } catch (error) {
      this.ui.showError(String(error));
      return;
    }

    this.audio = new AudioSystem(this.settings);
    this.interaction = new InteractionSystem(this.renderer.camera, this.ui);
    this.quests = new QuestSystem({
      addRewardItem: (itemId) => this.inventory.addItem(itemId),
      unlockHistory: (historyId) => this.unlockHistory(historyId),
      notify: (toast) => this.ui.toast(toast),
      playProgress: () => this.audio.playProgress(),
      playComplete: () => this.audio.playComplete(),
      persist: () => this.persistSoon(),
    });
    this.world = new World(
      this.renderer.scene,
      this.interaction,
      this.inventory,
      this.quests,
      this.ui,
      this.audio,
      {
        unlockHistory: (historyId) => this.unlockHistory(historyId),
        hasHistory: (historyId) => this.discoveredHistory.has(historyId),
        persist: () => this.persistSoon(),
      },
    );
    this.npcs = new NpcSystem(
      this.renderer.scene,
      this.interaction,
      this.quests,
      this.inventory,
      this.ui,
      this.audio,
    );

    this.inventory.onChange = () => this.persistSoon();
    this.world.build();
    this.npcs.build();
    this.renderer.setQuality(this.settings.quality);

    this.input.attach(this.renderer.canvas, () => this.running && !this.ui.isBlockingInput());
    this.input.bindMobileControls(this.ui.getMobileControlElements(), () => this.running && !this.ui.isBlockingInput());
    this.ui.bindActions({
      newGame: () => this.startNewGame(),
      continueGame: () => this.continueGame(),
      resetProgress: () => this.resetProgress(),
      resume: () => this.resumeGame(),
      saveNow: () => {
        this.saveNow();
        this.ui.toast({ title: "進度已儲存", tone: "success" });
      },
      openInventory: () => this.openInventory(),
      openQuestLog: () => this.openQuestLog(),
      openSettings: () => this.openSettings(),
      settingsChanged: (settings) => this.updateSettings(settings),
    });

    this.installDebugApi();
    this.ui.hideLoading();
    this.ui.showMainMenu(this.saveSystem.hasSave());
    this.updateHud();
    this.renderer.renderer.setAnimationLoop(() => this.tick());
    document.body.dataset.gameReady = "true";
  }

  startNewGame(): void {
    this.audio.resume();
    this.running = true;
    this.inventory.clear();
    this.quests.reset();
    this.discoveredHistory.clear();
    this.unlockHistory("info_education_note", false);
    this.unlocked.bridgeTradeCard = false;
    this.player.setFromSave([-24, 0, 1], Math.PI / 2, 0);
    this.ui.hideMainMenu();
    this.ui.hidePause();
    this.updateHud();
    this.saveNow();
    this.ui.toast({ title: "新遊戲開始", body: "前往茶樓尋找陳掌櫃。" });
  }

  continueGame(): boolean {
    const saved = this.saveSystem.load();
    if (!saved) {
      this.ui.toast({ title: "沒有可讀取進度", tone: "warning" });
      return false;
    }
    this.audio.resume();
    this.applySave(saved);
    this.running = true;
    this.ui.hideMainMenu();
    this.ui.hidePause();
    this.updateHud();
    this.ui.toast({ title: "已讀取進度", tone: "success" });
    return true;
  }

  resetProgress(): void {
    this.saveSystem.clear();
    this.inventory.clear();
    this.quests.reset();
    this.discoveredHistory.clear();
    this.unlockHistory("info_education_note", false);
    this.unlocked.bridgeTradeCard = false;
    this.running = false;
    this.ui.showMainMenu(false);
    this.ui.toast({ title: "進度已重置", tone: "warning" });
  }

  resumeGame(): void {
    this.audio.resume();
    this.running = true;
    this.ui.hidePause();
  }

  openInventory(): void {
    this.ui.showInventory(
      this.inventory.getEntries(),
      historyData.filter((info) => this.discoveredHistory.has(info.id)),
    );
  }

  openQuestLog(): void {
    this.ui.showQuestLog(this.quests.getAllQuestViews());
  }

  openSettings(): void {
    this.ui.showSettings();
  }

  saveNow(): void {
    this.saveSystem.save(this.createSaveData());
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    const actions = this.input.consumeActions();

    if (actions.pause) {
      if (this.ui.isBlockingInput()) {
        this.resumeGame();
      } else if (this.running) {
        this.running = false;
        this.ui.showPause();
      }
    }

    if (actions.inventory && this.running) {
      this.openInventory();
    }
    if (actions.quest && this.running) {
      this.openQuestLog();
    }

    if (this.running && !this.ui.isBlockingInput()) {
      this.player.update(dt, this.input, this.renderer.camera, this.world, this.settings);
      this.interaction.update();
      if (actions.interact) {
        this.audio.resume();
        this.interaction.interactActive();
      }
    } else {
      this.input.setPointerAllowed(false);
    }

    if (this.running && !this.ui.isBlockingInput()) {
      this.input.setPointerAllowed(true);
    }

    this.world.update(dt, this.elapsed);
    this.npcs.update(dt, this.elapsed);
    this.audio.update(dt, this.player.isMoving(), this.player.isRunning());
    this.updateHud();
    this.updateAutosave(dt);
    this.renderer.render();
  }

  private updateAutosave(dt: number): void {
    if (!this.running) {
      return;
    }
    this.saveCooldown -= dt;
    if (this.saveCooldown <= 0) {
      this.saveNow();
      this.saveCooldown = 4;
    }
  }

  private persistSoon(): void {
    this.saveCooldown = Math.min(this.saveCooldown, 0.25);
  }

  private updateHud(): void {
    const inventoryCount = this.inventory.getEntries().reduce((total, entry) => total + entry.quantity, 0);
    const completedCount = this.quests
      .getAllQuestViews()
      .filter((quest) => quest.state.status === "completed").length;
    this.ui.updateHud(this.quests.getPrimaryObjective(), inventoryCount, completedCount);
  }

  private updateSettings(settings: SettingsState): void {
    this.settings = settings;
    this.audio.setSettings(settings);
    this.renderer.setQuality(settings.quality);
    this.saveNow();
  }

  private unlockHistory(historyId: string, notify = true): void {
    if (!historyData.some((info) => info.id === historyId)) {
      return;
    }
    const wasNew = !this.discoveredHistory.has(historyId);
    this.discoveredHistory.add(historyId);
    if (historyId === "info_river_trade") {
      this.unlocked.bridgeTradeCard = true;
    }
    if (notify && wasNew) {
      const info = historyData.find((entry) => entry.id === historyId)!;
      this.ui.toast({ title: "史料已解鎖", body: info.title, tone: "success" });
    }
  }

  private applySave(save: SaveData): void {
    this.settings = save.settings;
    this.ui.applySettings(save.settings);
    this.audio.setSettings(save.settings);
    this.renderer.setQuality(save.settings.quality);
    this.player.setFromSave(save.player.position, save.player.yaw, save.player.pitch);
    this.inventory.load(save.inventory);
    this.quests.load(save.quests);
    this.discoveredHistory.clear();
    for (const historyId of save.discoveredHistory) {
      this.unlockHistory(historyId, false);
    }
    this.unlockHistory("info_education_note", false);
    this.unlocked.bridgeTradeCard = save.unlocked.bridgeTradeCard || this.discoveredHistory.has("info_river_trade");
  }

  private createSaveData(): SaveData {
    const player = this.player.serialize();
    return {
      version: 1,
      player: {
        position: player.position,
        yaw: player.yaw,
        pitch: player.pitch,
      },
      quests: this.quests.serialize(),
      inventory: this.inventory.serialize(),
      discoveredHistory: [...this.discoveredHistory],
      settings: this.settings,
      unlocked: { ...this.unlocked },
      savedAt: Date.now(),
    };
  }

  private installDebugApi(): void {
    const api: GameDebugApi = {
      status: () => ({
        ready: document.body.dataset.gameReady === "true",
        running: this.running,
        player: this.player.serialize(),
        inventory: this.inventory.serialize(),
        quests: this.quests.serialize(),
        completedQuests: this.quests.getAllQuestViews().filter((quest) => quest.state.status === "completed").length,
        npcCount: this.npcs.getNpcCount(),
        interactions: this.interaction.getAllIds(),
        history: [...this.discoveredHistory],
        world: this.world.getDebugStatus(),
        mobilePlayable: true,
      }),
      newGame: () => this.startNewGame(),
      continueGame: () => this.continueGame(),
      save: () => this.saveNow(),
      resetProgress: () => this.resetProgress(),
      teleport: (x, y, z) => this.player.teleport(x, y, z),
      setLook: (yaw, pitch) => this.player.setLook(yaw, pitch),
      interact: (id) => this.interaction.forceInteract(id),
      collect: (itemId) => this.world.collectItemDirect(itemId),
      advanceQuest: (questId, token) => this.quests.advanceQuest(questId, token),
      setMobileMove: (x, y) => this.input.setDebugMobileMove(x, y),
      setMobileLook: (dx, dy) => this.input.addDebugMobileLook(dx, dy),
      testMissingAssetFallback: async () => {
        const texture = await this.assets.loadOptionalTexture("/optional/missing-texture.png", "fallback");
        const model = await this.assets.loadOptionalModel("/optional/missing-model.glb", "crate");
        return texture instanceof THREE.Texture && model.children.length > 0;
      },
    };
    (window as unknown as { __qingmingGameDebug: GameDebugApi }).__qingmingGameDebug = api;
  }
}
