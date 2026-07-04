import type {
  DialoguePayload,
  HistoricalInfoData,
  InventoryEntry,
  ItemData,
  QuestData,
  QuestRuntimeState,
  SettingsState,
  ToastPayload,
} from "../utils/types";
import type { MobileControlElements } from "../core/InputManager";

type InventoryView = InventoryEntry & { data: ItemData };
type QuestView = {
  data: QuestData;
  state: QuestRuntimeState;
  activeObjectiveText: string;
  progressText: string;
};

export interface UIActions {
  newGame: () => void;
  continueGame: () => void;
  resetProgress: () => void;
  resume: () => void;
  saveNow: () => void;
  openInventory: () => void;
  openQuestLog: () => void;
  openSettings: () => void;
  settingsChanged: (settings: SettingsState) => void;
}

export class UIManager {
  readonly sceneRoot: HTMLElement;
  private readonly root: HTMLElement;
  private readonly loading: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly interaction: HTMLElement;
  private readonly dialogue: HTMLElement;
  private readonly drawer: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly toastHost: HTMLElement;
  private readonly missionComplete: HTMLElement;
  private readonly settingsForm: HTMLFormElement;
  private actions?: UIActions;
  private settings: SettingsState;
  private activePanel: "none" | "inventory" | "quests" | "settings" | "dialogue" | "pause" | "menu" = "menu";

  constructor(root: HTMLElement, initialSettings: SettingsState) {
    this.root = root;
    this.settings = initialSettings;
    this.root.innerHTML = this.template();
    this.sceneRoot = this.must("#scene-root");
    this.loading = this.must("#loading-screen");
    this.menu = this.must("#main-menu");
    this.hud = this.must("#hud");
    this.interaction = this.must("#interaction-prompt");
    this.dialogue = this.must("#dialogue-panel");
    this.drawer = this.must("#side-drawer");
    this.pause = this.must("#pause-panel");
    this.toastHost = this.must("#toast-host");
    this.missionComplete = this.must("#mission-complete");
    this.settingsForm = this.must<HTMLFormElement>("#settings-form");
    this.applySettings(initialSettings);
    this.bindStaticUi();
  }

  bindActions(actions: UIActions): void {
    this.actions = actions;
    this.must<HTMLButtonElement>("#new-game-button").addEventListener("click", () => actions.newGame());
    this.must<HTMLButtonElement>("#continue-button").addEventListener("click", () => actions.continueGame());
    this.must<HTMLButtonElement>("#reset-button").addEventListener("click", () => actions.resetProgress());
    this.must<HTMLButtonElement>("#pause-resume").addEventListener("click", () => actions.resume());
    this.must<HTMLButtonElement>("#pause-save").addEventListener("click", () => actions.saveNow());
    this.must<HTMLButtonElement>("#pause-settings").addEventListener("click", () => actions.openSettings());
    this.must<HTMLButtonElement>("#hud-inventory").addEventListener("click", () => actions.openInventory());
    this.must<HTMLButtonElement>("#hud-quests").addEventListener("click", () => actions.openQuestLog());
    this.must<HTMLButtonElement>("#hud-pause").addEventListener("click", () => this.showPause());
    this.must<HTMLButtonElement>("#drawer-close").addEventListener("click", () => this.closeDrawer());
    this.must<HTMLButtonElement>("#dialogue-close").addEventListener("click", () => this.closeDialogue());
    this.must<HTMLButtonElement>("#mission-close").addEventListener("click", () => {
      this.missionComplete.classList.add("is-hidden");
    });
  }

  getMobileControlElements(): MobileControlElements {
    return {
      joystickBase: this.must("#mobile-joystick"),
      joystickThumb: this.must("#mobile-joystick-thumb"),
      lookZone: this.must("#mobile-look-zone"),
      interactButton: this.must("#mobile-interact"),
      runButton: this.must("#mobile-run"),
      inventoryButton: this.must("#mobile-inventory"),
      questButton: this.must("#mobile-quests"),
      pauseButton: this.must("#mobile-pause"),
    };
  }

  showLoading(message: string): void {
    this.must("#loading-message").textContent = message;
    this.loading.classList.remove("is-hidden");
  }

  hideLoading(): void {
    this.loading.classList.add("is-hidden");
  }

  showMainMenu(hasSave: boolean): void {
    this.activePanel = "menu";
    this.menu.classList.remove("is-hidden");
    this.hud.classList.add("is-hidden");
    this.must<HTMLButtonElement>("#continue-button").disabled = !hasSave;
  }

  hideMainMenu(): void {
    this.activePanel = "none";
    this.menu.classList.add("is-hidden");
    this.hud.classList.remove("is-hidden");
  }

  showError(message: string): void {
    this.loading.classList.remove("is-hidden");
    this.must("#loading-message").innerHTML = `<strong>啟動失敗</strong><span>${message}</span>`;
  }

  showPause(): void {
    this.activePanel = "pause";
    this.pause.classList.remove("is-hidden");
  }

  hidePause(): void {
    if (this.activePanel === "pause") {
      this.activePanel = "none";
    }
    this.pause.classList.add("is-hidden");
  }

  isBlockingInput(): boolean {
    return this.activePanel !== "none";
  }

  updateHud(objective: string, inventoryCount: number, completedCount: number): void {
    this.must("#objective-text").textContent = objective;
    this.must("#inventory-count").textContent = String(inventoryCount);
    this.must("#completed-count").textContent = String(completedCount);
  }

  showInteraction(name: string, prompt: string): void {
    this.interaction.classList.remove("is-hidden");
    this.must("#interaction-name").textContent = name;
    this.must("#interaction-text").textContent = prompt;
  }

  hideInteraction(): void {
    this.interaction.classList.add("is-hidden");
  }

  showDialogue(payload: DialoguePayload): void {
    this.activePanel = "dialogue";
    this.dialogue.classList.remove("is-hidden");
    this.must("#dialogue-speaker").textContent = payload.speaker;
    this.must("#dialogue-role").textContent = payload.role;
    this.must("#dialogue-lines").innerHTML = payload.lines.map((line) => `<p>${line}</p>`).join("");
    const options = this.must("#dialogue-options");
    options.innerHTML = "";
    for (const option of payload.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-button";
      button.textContent = option.label;
      button.addEventListener("click", () => {
        option.action();
        this.closeDialogue();
      });
      options.appendChild(button);
    }
  }

  closeDialogue(): void {
    if (this.activePanel === "dialogue") {
      this.activePanel = "none";
    }
    this.dialogue.classList.add("is-hidden");
  }

  showInventory(entries: InventoryView[], history: HistoricalInfoData[]): void {
    this.activePanel = "inventory";
    this.drawer.classList.remove("is-hidden");
    this.must("#drawer-title").textContent = "背包與史料";
    const body = this.must("#drawer-body");
    const itemsHtml = entries.length
      ? entries
          .map(
            (entry) => `
              <button class="inventory-row" data-item-id="${entry.itemId}">
                <span class="item-icon item-${entry.data.icon}"></span>
                <span><strong>${entry.data.name}</strong><small>${entry.data.description}</small></span>
                <b>x${entry.quantity}</b>
              </button>
            `,
          )
          .join("")
      : `<p class="muted">尚未取得物品。靠近可互動物件並按 E 或互動鍵。</p>`;
    const historyHtml = history
      .map(
        (info) => `
          <article class="history-card">
            <span>${info.topic}</span>
            <h3>${info.title}</h3>
            <p>${info.body}</p>
          </article>
        `,
      )
      .join("");
    body.innerHTML = `
      <section><h3>物品</h3>${itemsHtml}</section>
      <section><h3>已發現史料</h3>${historyHtml || `<p class="muted">探索場景中的史料點以解鎖。</p>`}</section>
    `;
  }

  showQuestLog(quests: QuestView[]): void {
    this.activePanel = "quests";
    this.drawer.classList.remove("is-hidden");
    this.must("#drawer-title").textContent = "任務紀錄";
    this.must("#drawer-body").innerHTML = quests
      .map(
        (quest) => `
          <article class="quest-card ${quest.state.status}">
            <div>
              <span>${quest.data.type === "main" ? "主線" : "支線"}</span>
              <h3>${quest.data.title}</h3>
            </div>
            <p>${quest.data.description}</p>
            <strong>${quest.activeObjectiveText}</strong>
            <small>${quest.state.status === "completed" ? "完成" : quest.progressText || "進行中"}</small>
          </article>
        `,
      )
      .join("");
  }

  showSettings(): void {
    this.activePanel = "settings";
    this.drawer.classList.remove("is-hidden");
    this.must("#drawer-title").textContent = "設定";
    const body = this.must("#drawer-body");
    body.innerHTML = "";
    body.appendChild(this.settingsForm);
    this.settingsForm.classList.remove("is-hidden");
  }

  closeDrawer(): void {
    if (this.activePanel === "inventory" || this.activePanel === "quests" || this.activePanel === "settings") {
      this.activePanel = "none";
    }
    this.drawer.classList.add("is-hidden");
    this.settingsForm.classList.add("is-hidden");
    this.root.appendChild(this.settingsForm);
  }

  applySettings(settings: SettingsState): void {
    this.settings = settings;
    document.documentElement.style.setProperty("--text-scale", String(settings.textScale));
    document.body.classList.toggle("high-contrast-prompts", settings.highContrastPrompts);
    document.body.classList.toggle("reduced-motion", settings.reducedCameraMotion);
    for (const [key, value] of Object.entries(settings)) {
      const input = this.settingsForm.elements.namedItem(key);
      if (input instanceof HTMLInputElement) {
        if (input.type === "checkbox") {
          input.checked = Boolean(value);
        } else {
          input.value = String(value);
        }
      } else if (input instanceof HTMLSelectElement) {
        input.value = String(value);
      }
    }
  }

  toast(payload: ToastPayload): void {
    const node = document.createElement("div");
    node.className = `toast ${payload.tone ?? "default"}`;
    node.innerHTML = `<strong>${payload.title}</strong>${payload.body ? `<span>${payload.body}</span>` : ""}`;
    this.toastHost.appendChild(node);
    window.setTimeout(() => node.classList.add("is-fading"), 3200);
    window.setTimeout(() => node.remove(), 3900);
  }

  showMissionComplete(title: string, body: string): void {
    this.missionComplete.classList.remove("is-hidden");
    this.must("#mission-title").textContent = title;
    this.must("#mission-body").textContent = body;
  }

  private bindStaticUi(): void {
    this.settingsForm.addEventListener("input", () => {
      const form = new FormData(this.settingsForm);
      const next: SettingsState = {
        masterVolume: Number(form.get("masterVolume") ?? this.settings.masterVolume),
        ambienceVolume: Number(form.get("ambienceVolume") ?? this.settings.ambienceVolume),
        sfxVolume: Number(form.get("sfxVolume") ?? this.settings.sfxVolume),
        textScale: Number(form.get("textScale") ?? this.settings.textScale),
        cameraSensitivity: Number(form.get("cameraSensitivity") ?? this.settings.cameraSensitivity),
        mobileSensitivity: Number(form.get("mobileSensitivity") ?? this.settings.mobileSensitivity),
        reducedCameraMotion: form.get("reducedCameraMotion") === "on",
        highContrastPrompts: form.get("highContrastPrompts") === "on",
        screenShake: form.get("screenShake") === "on",
        quality: String(form.get("quality") ?? this.settings.quality) as SettingsState["quality"],
      };
      this.applySettings(next);
      this.actions?.settingsChanged(next);
    });
  }

  private template(): string {
    return `
      <main id="game-shell">
        <div id="scene-root"></div>
        <div id="crosshair" aria-hidden="true"></div>
        <section id="loading-screen">
          <div class="loading-box">
            <h1>清明上河圖：汴河一日</h1>
            <p id="loading-message">正在搭建汴河城市...</p>
          </div>
        </section>
        <section id="main-menu" class="menu-panel">
          <div class="menu-copy">
            <span>教育性 3D 詮釋</span>
            <h1>清明上河圖：汴河一日</h1>
            <p>走進熱鬧汴河城市，調查失蹤帳簿，與茶樓、藥鋪、船家和市集人物互動。</p>
          </div>
          <div class="menu-actions">
            <button id="new-game-button" class="primary-button" type="button">新遊戲</button>
            <button id="continue-button" class="panel-button" type="button">繼續</button>
            <button id="reset-button" class="ghost-button" type="button">重置進度</button>
          </div>
        </section>
        <section id="hud" class="is-hidden">
          <div class="objective-chip">
            <span>目前目標</span>
            <strong id="objective-text">前往茶樓</strong>
          </div>
          <div class="status-strip">
            <button id="hud-inventory" type="button" aria-label="背包">物品 <b id="inventory-count">0</b></button>
            <button id="hud-quests" type="button" aria-label="任務">任務 <b id="completed-count">0</b></button>
            <button id="hud-pause" type="button" aria-label="暫停">暫停</button>
          </div>
          <div id="interaction-prompt" class="interaction-prompt is-hidden">
            <strong id="interaction-name"></strong>
            <span id="interaction-text"></span>
          </div>
        </section>
        <section id="dialogue-panel" class="dialogue-panel is-hidden" role="dialog" aria-modal="true">
          <button id="dialogue-close" class="icon-close" type="button" aria-label="關閉">×</button>
          <span id="dialogue-role"></span>
          <h2 id="dialogue-speaker"></h2>
          <div id="dialogue-lines"></div>
          <div id="dialogue-options" class="panel-actions"></div>
        </section>
        <aside id="side-drawer" class="side-drawer is-hidden">
          <header>
            <h2 id="drawer-title">紀錄</h2>
            <button id="drawer-close" class="icon-close" type="button" aria-label="關閉">×</button>
          </header>
          <div id="drawer-body"></div>
        </aside>
        <section id="pause-panel" class="pause-panel is-hidden" role="dialog" aria-modal="true">
          <h2>暫停</h2>
          <div class="panel-actions">
            <button id="pause-resume" class="primary-button" type="button">返回遊戲</button>
            <button id="pause-save" class="panel-button" type="button">立即儲存</button>
            <button id="pause-settings" class="panel-button" type="button">設定</button>
          </div>
        </section>
        <section id="mission-complete" class="mission-complete is-hidden">
          <h2 id="mission-title">任務完成</h2>
          <p id="mission-body"></p>
          <button id="mission-close" class="primary-button" type="button">繼續探索</button>
        </section>
        <form id="settings-form" class="settings-form is-hidden">
          <label>總音量 <input name="masterVolume" type="range" min="0" max="1" step="0.05" /></label>
          <label>環境音 <input name="ambienceVolume" type="range" min="0" max="1" step="0.05" /></label>
          <label>音效 <input name="sfxVolume" type="range" min="0" max="1" step="0.05" /></label>
          <label>文字大小 <input name="textScale" type="range" min="0.9" max="1.35" step="0.05" /></label>
          <label>滑鼠靈敏度 <input name="cameraSensitivity" type="range" min="0.45" max="1.8" step="0.05" /></label>
          <label>手機視角靈敏度 <input name="mobileSensitivity" type="range" min="0.45" max="1.8" step="0.05" /></label>
          <label>畫質
            <select name="quality">
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
          <label class="check-row"><input name="reducedCameraMotion" type="checkbox" /> 降低鏡頭晃動</label>
          <label class="check-row"><input name="highContrastPrompts" type="checkbox" /> 高對比互動提示</label>
          <label class="check-row"><input name="screenShake" type="checkbox" /> 允許震動效果</label>
        </form>
        <div id="mobile-controls" aria-hidden="false">
          <div id="mobile-joystick"><span id="mobile-joystick-thumb"></span></div>
          <div id="mobile-look-zone"></div>
          <button id="mobile-interact" type="button">互動</button>
          <button id="mobile-run" type="button">跑</button>
          <button id="mobile-inventory" type="button">包</button>
          <button id="mobile-quests" type="button">任</button>
          <button id="mobile-pause" type="button">停</button>
        </div>
        <div id="portrait-warning">請將裝置轉為橫向以獲得完整遊玩視野。</div>
        <div id="toast-host"></div>
      </main>
    `;
  }

  private must<T extends HTMLElement = HTMLElement>(selector: string): T {
    const node = this.root.querySelector<T>(selector);
    if (!node) {
      throw new Error(`Missing UI element: ${selector}`);
    }
    return node;
  }
}
