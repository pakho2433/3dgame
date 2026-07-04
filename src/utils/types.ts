import type * as THREE from "three";

export type QuestKind = "main" | "side";
export type QuestRuntimeStatus = "available" | "accepted" | "completed";
export type ItemCategory = "quest" | "collectible";

export interface ItemData {
  id: string;
  name: string;
  icon: string;
  category: ItemCategory;
  description: string;
}

export interface HistoricalInfoData {
  id: string;
  title: string;
  topic: string;
  body: string;
}

export interface QuestObjectiveData {
  id: string;
  text: string;
  required: string[];
}

export interface QuestRewardData {
  items: string[];
  history: string[];
}

export interface QuestData {
  id: string;
  title: string;
  type: QuestKind;
  giverNpcId: string;
  description: string;
  objectives: QuestObjectiveData[];
  rewards: QuestRewardData;
}

export interface QuestRuntimeState {
  questId: string;
  status: QuestRuntimeStatus;
  activeObjectiveIndex: number;
  objectiveProgress: Record<string, string[]>;
}

export interface NpcData {
  id: string;
  name: string;
  role: string;
  englishRole: string;
  position: [number, number, number];
  color: string;
  behavior: "idle" | "walk";
  path?: [number, number][];
}

export interface DialogueEntry {
  default: string[];
  questAvailable?: string[];
  questAccepted?: string[];
  questComplete?: string[];
  mainClue?: string[];
  sideAvailable?: string[];
  sideAccepted?: string[];
  sideComplete?: string[];
  medicineComplete?: string[];
  childFound?: string[];
}

export type DialogueData = Record<string, DialogueEntry>;

export interface InventoryEntry {
  itemId: string;
  quantity: number;
}

export interface SettingsState {
  masterVolume: number;
  ambienceVolume: number;
  sfxVolume: number;
  textScale: number;
  cameraSensitivity: number;
  mobileSensitivity: number;
  reducedCameraMotion: boolean;
  highContrastPrompts: boolean;
  screenShake: boolean;
  quality: "low" | "medium" | "high";
}

export interface SaveData {
  version: 1;
  player: {
    position: [number, number, number];
    yaw: number;
    pitch: number;
  };
  quests: Record<string, QuestRuntimeState>;
  inventory: InventoryEntry[];
  discoveredHistory: string[];
  settings: SettingsState;
  unlocked: {
    bridgeTradeCard: boolean;
  };
  savedAt: number;
}

export interface AabbCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
  enabled?: () => boolean;
}

export type InteractionKind =
  | "door"
  | "pickup"
  | "inspect"
  | "npc"
  | "quest"
  | "shop"
  | "container";

export interface Interactable {
  id: string;
  name: string;
  kind: InteractionKind;
  object: THREE.Object3D;
  range: number;
  enabled?: () => boolean;
  getPrompt?: () => string;
  onInteract: () => void;
}

export interface DialogueOption {
  label: string;
  action: () => void;
}

export interface DialoguePayload {
  speaker: string;
  role: string;
  lines: string[];
  options: DialogueOption[];
}

export interface ToastPayload {
  title: string;
  body?: string;
  tone?: "default" | "success" | "warning";
}

export interface GameDebugApi {
  status: () => Record<string, unknown>;
  newGame: () => void;
  continueGame: () => boolean;
  save: () => void;
  resetProgress: () => void;
  teleport: (x: number, y: number, z: number) => void;
  setLook: (yaw: number, pitch: number) => void;
  interact: (id: string) => boolean;
  collect: (itemId: string) => boolean;
  advanceQuest: (questId: string, token: string) => boolean;
  setMobileMove: (x: number, y: number) => void;
  setMobileLook: (dx: number, dy: number) => void;
  testMissingAssetFallback: () => Promise<boolean>;
}
