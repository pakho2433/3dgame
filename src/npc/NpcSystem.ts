import * as THREE from "three";
import npcRows from "../data/npcs.json";
import dialogueRows from "../data/dialogue.json";
import type { InteractionSystem } from "../interaction/InteractionSystem";
import type { InventorySystem } from "../inventory/InventorySystem";
import type { QuestSystem } from "../quests/QuestSystem";
import type { UIManager } from "../ui/UIManager";
import type { AudioSystem } from "../audio/AudioSystem";
import type { DialogueData, DialogueOption, NpcData } from "../utils/types";
import { distance2D, wrap01 } from "../utils/math";

const npcs = npcRows as NpcData[];
const dialogues = dialogueRows as DialogueData;

interface NpcActor {
  data: NpcData;
  group: THREE.Group;
  body: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  indicator: THREE.Mesh;
  pathT: number;
}

export class NpcSystem {
  private readonly actors = new Map<string, NpcActor>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly interaction: InteractionSystem,
    private readonly quests: QuestSystem,
    private readonly inventory: InventorySystem,
    private readonly ui: UIManager,
    private readonly audio: AudioSystem,
  ) {}

  build(): void {
    for (const data of npcs) {
      const actor = this.createActor(data);
      this.actors.set(data.id, actor);
      this.scene.add(actor.group);
      this.interaction.register({
        id: `npc:${data.id}`,
        name: `${data.name}｜${data.role}`,
        kind: "npc",
        object: actor.group,
        range: 4.0,
        getPrompt: () => "按 E 交談",
        onInteract: () => this.openDialogue(data.id),
      });
    }
  }

  update(dt: number, elapsed: number): void {
    for (const actor of this.actors.values()) {
      const { data, group } = actor;
      if (data.behavior === "walk" && data.path && data.path.length > 1) {
        actor.pathT = wrap01(actor.pathT + dt * 0.045);
        const scaled = actor.pathT * data.path.length;
        const index = Math.floor(scaled) % data.path.length;
        const nextIndex = (index + 1) % data.path.length;
        const localT = scaled - Math.floor(scaled);
        const [ax, az] = data.path[index];
        const [bx, bz] = data.path[nextIndex];
        const x = THREE.MathUtils.lerp(ax, bx, localT);
        const z = THREE.MathUtils.lerp(az, bz, localT);
        const heading = Math.atan2(bx - ax, bz - az);
        group.position.set(x, 0, z);
        group.rotation.y = heading;
      }
      const walkPulse = data.behavior === "walk" ? Math.sin(elapsed * 8 + actor.pathT * 10) : Math.sin(elapsed * 2.5);
      actor.body.position.y = 0.8 + walkPulse * 0.025;
      actor.leftArm.rotation.x = walkPulse * 0.35;
      actor.rightArm.rotation.x = -walkPulse * 0.35;
      actor.indicator.position.y = 2.25 + Math.sin(elapsed * 3) * 0.06;
      actor.indicator.rotation.y += dt * 2;
    }
  }

  getNpcPosition(id: string): THREE.Vector3 | undefined {
    return this.actors.get(id)?.group.position.clone();
  }

  getNpcCount(): number {
    return this.actors.size;
  }

  openDialogue(id: string): void {
    const actor = this.actors.get(id);
    const entry = dialogues[id];
    if (!actor || !entry) {
      return;
    }

    const options: DialogueOption[] = [];
    let lines = entry.default;

    if (id === "tea_owner") {
      const status = this.quests.getStatus("main_missing_ledger");
      if (status === "available") {
        lines = entry.questAvailable ?? entry.default;
        options.push({
          label: "接受調查",
          action: () => {
            this.audio.playClick();
            this.quests.acceptQuest("main_missing_ledger");
            this.quests.advanceQuest("main_missing_ledger", "tea_owner");
          },
        });
      } else if (
        status === "accepted" &&
        this.quests.isObjectiveActive("main_missing_ledger", "return_ledger") &&
        this.inventory.hasItem("missing_ledger")
      ) {
        lines = entry.questComplete ?? entry.default;
        options.push({
          label: "交還帳簿",
          action: () => {
            this.inventory.removeItem("missing_ledger");
            this.quests.advanceQuest("main_missing_ledger", "tea_owner_return");
            this.ui.showMissionComplete("失蹤的商業帳簿", "你找回帳簿並解鎖了新的汴河貿易史料。");
          },
        });
      } else if (status === "accepted") {
        lines = entry.questAccepted ?? entry.default;
      } else {
        lines = entry.questComplete ?? entry.default;
      }
    }

    if (id === "food_merchant" && this.quests.isObjectiveActive("main_missing_ledger", "question_witnesses")) {
      lines = entry.mainClue ?? entry.default;
      if (!this.quests.hasProgress("main_missing_ledger", "food_merchant")) {
        options.push({
          label: "記下小販線索",
          action: () => this.quests.advanceQuest("main_missing_ledger", "food_merchant"),
        });
      }
    }

    if (id === "city_guard" && this.quests.isObjectiveActive("main_missing_ledger", "question_witnesses")) {
      lines = entry.mainClue ?? entry.default;
      if (!this.quests.hasProgress("main_missing_ledger", "city_guard")) {
        options.push({
          label: "記下守衛線索",
          action: () => this.quests.advanceQuest("main_missing_ledger", "city_guard"),
        });
      }
    }

    if (id === "delivery_worker" && this.quests.isObjectiveActive("main_missing_ledger", "question_witnesses")) {
      lines = entry.mainClue ?? entry.default;
      if (!this.quests.hasProgress("main_missing_ledger", "delivery_worker")) {
        options.push({
          label: "追問搬運路線",
          action: () => this.quests.advanceQuest("main_missing_ledger", "delivery_worker"),
        });
      }
    }

    if (id === "doctor") {
      const sideStatus = this.quests.getStatus("side_medicine_delivery");
      if (this.quests.isObjectiveActive("main_missing_ledger", "collect_seal_clue")) {
        lines = entry.mainClue ?? entry.default;
      } else if (sideStatus === "available") {
        lines = entry.sideAvailable ?? entry.default;
        options.push({
          label: "接下送藥",
          action: () => {
            this.quests.acceptQuest("side_medicine_delivery");
            this.inventory.addItem("medicine_packet");
            this.quests.advanceQuest("side_medicine_delivery", "doctor");
          },
        });
      } else if (sideStatus === "accepted") {
        lines = entry.sideAccepted ?? entry.default;
      }
    }

    if (id === "fisherman") {
      const sideStatus = this.quests.getStatus("side_lost_basket");
      if (sideStatus === "available") {
        lines = entry.sideAvailable ?? entry.default;
        options.push({
          label: "幫忙找竹籃",
          action: () => {
            this.quests.acceptQuest("side_lost_basket");
            this.quests.advanceQuest("side_lost_basket", "fisherman");
          },
        });
      } else if (
        sideStatus === "accepted" &&
        this.quests.isObjectiveActive("side_lost_basket", "return_basket") &&
        this.inventory.hasItem("lost_basket")
      ) {
        lines = entry.sideComplete ?? entry.default;
        options.push({
          label: "交還竹籃",
          action: () => {
            this.inventory.removeItem("lost_basket");
            this.quests.advanceQuest("side_lost_basket", "fisherman_return");
          },
        });
      } else if (sideStatus === "accepted") {
        lines = entry.sideAccepted ?? entry.default;
      } else {
        lines = entry.sideComplete ?? entry.default;
      }
    }

    if (id === "elder_resident" && this.quests.isObjectiveActive("side_medicine_delivery", "deliver_medicine")) {
      lines = entry.medicineComplete ?? entry.default;
      if (this.inventory.hasItem("medicine_packet")) {
        options.push({
          label: "交付藥包",
          action: () => {
            this.inventory.removeItem("medicine_packet");
            this.quests.advanceQuest("side_medicine_delivery", "elder_resident");
          },
        });
      }
    }

    if (id === "lost_child") {
      const sideStatus = this.quests.getStatus("side_lost_child");
      if (sideStatus === "available") {
        lines = entry.sideAvailable ?? entry.default;
        options.push({
          label: "幫她找家人",
          action: () => {
            this.quests.acceptQuest("side_lost_child");
            this.inventory.addItem("child_ribbon");
            this.quests.advanceQuest("side_lost_child", "lost_child");
          },
        });
      } else if (this.quests.isObjectiveActive("side_lost_child", "confirm_child")) {
        lines = entry.sideComplete ?? entry.default;
        options.push({
          label: "告知家人位置",
          action: () => this.quests.advanceQuest("side_lost_child", "lost_child_return"),
        });
      } else if (sideStatus === "accepted") {
        lines = entry.sideAccepted ?? entry.default;
      } else {
        lines = entry.sideComplete ?? entry.default;
      }
    }

    if (id === "child_mother" && this.quests.isObjectiveActive("side_lost_child", "find_family")) {
      lines = entry.childFound ?? entry.default;
      if (this.inventory.hasItem("child_ribbon")) {
        options.push({
          label: "出示紅色髮帶",
          action: () => this.quests.advanceQuest("side_lost_child", "child_mother"),
        });
      }
    }

    options.push({ label: "離開", action: () => undefined });
    this.ui.showDialogue({
      speaker: actor.data.name,
      role: `${actor.data.role} / ${actor.data.englishRole}`,
      lines,
      options,
    });
  }

  private createActor(data: NpcData): NpcActor {
    const group = new THREE.Group();
    group.name = `npc-${data.id}`;
    group.position.set(data.position[0], data.position[1], data.position[2]);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.72 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: "#f0cf8a", roughness: 0.6 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: "#2a1b14", roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 5, 10), bodyMaterial);
    body.position.y = 0.82;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), trimMaterial);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);

    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.12, 14), darkMaterial);
    hat.position.y = 1.78;
    hat.castShadow = true;
    group.add(hat);

    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.65, 8), bodyMaterial);
    leftArm.position.set(-0.38, 1.02, 0);
    leftArm.rotation.z = 0.22;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.65, 8), bodyMaterial);
    rightArm.position.set(0.38, 1.02, 0);
    rightArm.rotation.z = -0.22;
    group.add(rightArm);

    const indicator = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.018, 6, 24),
      new THREE.MeshStandardMaterial({ color: "#f4c36c", emissive: "#8b4b20", emissiveIntensity: 0.45 }),
    );
    indicator.position.y = 2.25;
    group.add(indicator);

    const labelBack = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.18),
      new THREE.MeshBasicMaterial({ color: "#3a2113", transparent: true, opacity: 0.78 }),
    );
    labelBack.position.set(0, 2.02, 0);
    group.add(labelBack);

    return {
      data,
      group,
      body,
      leftArm,
      rightArm,
      indicator,
      pathT: distance2D(data.position[0], data.position[2], 0, 0) * 0.013,
    };
  }
}
