import questRows from "../data/quests.json";
import type { QuestData, QuestRuntimeState, QuestRuntimeStatus, ToastPayload } from "../utils/types";

const questData = questRows as QuestData[];

export interface QuestSystemCallbacks {
  addRewardItem: (itemId: string) => void;
  unlockHistory: (historyId: string) => void;
  notify: (toast: ToastPayload) => void;
  playProgress: () => void;
  playComplete: () => void;
  persist: () => void;
}

export class QuestSystem {
  private readonly quests = new Map(questData.map((quest) => [quest.id, quest]));
  private readonly states = new Map<string, QuestRuntimeState>();

  constructor(private readonly callbacks: QuestSystemCallbacks) {
    this.reset();
  }

  reset(): void {
    this.states.clear();
    for (const quest of this.quests.values()) {
      this.states.set(quest.id, {
        questId: quest.id,
        status: "available",
        activeObjectiveIndex: 0,
        objectiveProgress: Object.fromEntries(quest.objectives.map((objective) => [objective.id, []])),
      });
    }
  }

  load(savedStates: Record<string, QuestRuntimeState> | undefined): void {
    this.reset();
    if (!savedStates) {
      return;
    }
    for (const [questId, saved] of Object.entries(savedStates)) {
      const quest = this.quests.get(questId);
      if (!quest) {
        continue;
      }
      const safeStatus: QuestRuntimeStatus = ["available", "accepted", "completed"].includes(saved.status)
        ? saved.status
        : "available";
      this.states.set(questId, {
        questId,
        status: safeStatus,
        activeObjectiveIndex: Math.min(Math.max(saved.activeObjectiveIndex, 0), quest.objectives.length - 1),
        objectiveProgress: {
          ...Object.fromEntries(quest.objectives.map((objective) => [objective.id, []])),
          ...saved.objectiveProgress,
        },
      });
    }
  }

  serialize(): Record<string, QuestRuntimeState> {
    return Object.fromEntries([...this.states.entries()].map(([id, state]) => [id, structuredClone(state)]));
  }

  getQuestData(questId: string): QuestData | undefined {
    return this.quests.get(questId);
  }

  getState(questId: string): QuestRuntimeState | undefined {
    const state = this.states.get(questId);
    return state ? structuredClone(state) : undefined;
  }

  getAllQuestViews(): Array<{
    data: QuestData;
    state: QuestRuntimeState;
    activeObjectiveText: string;
    progressText: string;
  }> {
    return [...this.quests.values()].map((data) => {
      const state = this.states.get(data.id)!;
      const activeObjective = data.objectives[state.activeObjectiveIndex] ?? data.objectives[data.objectives.length - 1];
      const progress = activeObjective.required.length
        ? `${state.objectiveProgress[activeObjective.id]?.length ?? 0}/${activeObjective.required.length}`
        : "";
      return {
        data,
        state: structuredClone(state),
        activeObjectiveText: state.status === "completed" ? "已完成" : activeObjective.text,
        progressText: progress,
      };
    });
  }

  getPrimaryObjective(): string {
    const main = this.getAllQuestViews().find((quest) => quest.data.type === "main");
    if (!main) {
      return "探索汴河市集";
    }
    if (main.state.status === "available") {
      return "前往茶樓，尋找陳掌櫃";
    }
    if (main.state.status === "completed") {
      return "主線完成：自由探索汴河城市";
    }
    return main.activeObjectiveText;
  }

  getStatus(questId: string): QuestRuntimeStatus {
    return this.states.get(questId)?.status ?? "available";
  }

  acceptQuest(questId: string): boolean {
    const quest = this.quests.get(questId);
    const state = this.states.get(questId);
    if (!quest || !state || state.status !== "available") {
      return false;
    }
    state.status = "accepted";
    this.callbacks.notify({ title: "任務已接受", body: quest.title, tone: "default" });
    this.callbacks.playProgress();
    this.callbacks.persist();
    return true;
  }

  advanceQuest(questId: string, token: string): boolean {
    const quest = this.quests.get(questId);
    const state = this.states.get(questId);
    if (!quest || !state || state.status !== "accepted") {
      return false;
    }
    const objective = quest.objectives[state.activeObjectiveIndex];
    if (!objective || !objective.required.includes(token)) {
      return false;
    }
    const progress = state.objectiveProgress[objective.id] ?? [];
    if (!progress.includes(token)) {
      progress.push(token);
      state.objectiveProgress[objective.id] = progress;
      this.callbacks.notify({
        title: "任務進度更新",
        body: `${quest.title}：${objective.text}`,
        tone: "default",
      });
      this.callbacks.playProgress();
    }

    if (objective.required.every((requiredToken) => progress.includes(requiredToken))) {
      state.activeObjectiveIndex += 1;
      if (state.activeObjectiveIndex >= quest.objectives.length) {
        this.completeQuest(quest);
      }
    }
    this.callbacks.persist();
    return true;
  }

  isObjectiveActive(questId: string, objectiveId: string): boolean {
    const quest = this.quests.get(questId);
    const state = this.states.get(questId);
    if (!quest || !state || state.status !== "accepted") {
      return false;
    }
    return quest.objectives[state.activeObjectiveIndex]?.id === objectiveId;
  }

  hasProgress(questId: string, token: string): boolean {
    const state = this.states.get(questId);
    if (!state) {
      return false;
    }
    return Object.values(state.objectiveProgress).some((tokens) => tokens.includes(token));
  }

  private completeQuest(quest: QuestData): void {
    const state = this.states.get(quest.id);
    if (!state || state.status === "completed") {
      return;
    }
    state.status = "completed";
    state.activeObjectiveIndex = quest.objectives.length - 1;
    for (const itemId of quest.rewards.items) {
      this.callbacks.addRewardItem(itemId);
    }
    for (const historyId of quest.rewards.history) {
      this.callbacks.unlockHistory(historyId);
    }
    this.callbacks.notify({ title: "任務完成", body: quest.title, tone: "success" });
    this.callbacks.playComplete();
  }
}
