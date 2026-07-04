import * as THREE from "three";
import historicalRows from "../data/historicalInfo.json";
import itemRows from "../data/items.json";
import type { AudioSystem } from "../audio/AudioSystem";
import type { InteractionSystem } from "../interaction/InteractionSystem";
import type { InventorySystem } from "../inventory/InventorySystem";
import type { QuestSystem } from "../quests/QuestSystem";
import type { UIManager } from "../ui/UIManager";
import type { AabbCollider, HistoricalInfoData, ItemData } from "../utils/types";
import { damp, wrap01 } from "../utils/math";

const historyData = historicalRows as HistoricalInfoData[];
const itemData = itemRows as ItemData[];

interface DoorState {
  id: string;
  mesh: THREE.Group;
  open: boolean;
  angle: number;
  target: number;
}

interface PickupState {
  itemId: string;
  object: THREE.Object3D;
  questId?: string;
  token?: string;
  enabled: () => boolean;
}

interface BoatState {
  group: THREE.Group;
  baseX: number;
  z: number;
  speed: number;
  phase: number;
}

interface AnimalState {
  group: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  speed: number;
  phase: number;
}

export interface WorldCallbacks {
  unlockHistory: (historyId: string) => void;
  hasHistory: (historyId: string) => boolean;
  persist: () => void;
}

export class World {
  private readonly colliders: AabbCollider[] = [];
  private readonly doors = new Map<string, DoorState>();
  private readonly pickups = new Map<string, PickupState>();
  private readonly boats: BoatState[] = [];
  private readonly animals: AnimalState[] = [];
  private readonly animatedSigns: THREE.Object3D[] = [];
  private smoke?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private dust?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private water?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
  private readonly material = {
    wood: new THREE.MeshStandardMaterial({ color: "#795033", roughness: 0.78 }),
    darkWood: new THREE.MeshStandardMaterial({ color: "#42291b", roughness: 0.8 }),
    plaster: new THREE.MeshStandardMaterial({ color: "#c7aa7c", roughness: 0.82 }),
    roof: new THREE.MeshStandardMaterial({ color: "#6d4b3a", roughness: 0.86 }),
    stone: new THREE.MeshStandardMaterial({ color: "#88806f", roughness: 0.88 }),
    clothRed: new THREE.MeshStandardMaterial({ color: "#a9362a", roughness: 0.72, side: THREE.DoubleSide }),
    clothBlue: new THREE.MeshStandardMaterial({ color: "#2f6078", roughness: 0.72, side: THREE.DoubleSide }),
    clothGold: new THREE.MeshStandardMaterial({ color: "#d7a246", roughness: 0.72, side: THREE.DoubleSide }),
    marketGreen: new THREE.MeshStandardMaterial({ color: "#567f5a", roughness: 0.78 }),
    highlight: new THREE.MeshStandardMaterial({ color: "#f2c568", emissive: "#6d351c", emissiveIntensity: 0.25 }),
  };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly interaction: InteractionSystem,
    private readonly inventory: InventorySystem,
    private readonly quests: QuestSystem,
    private readonly ui: UIManager,
    private readonly audio: AudioSystem,
    private readonly callbacks: WorldCallbacks,
  ) {}

  build(): void {
    this.createGroundAndRiver();
    this.createCityGate();
    this.createMarket();
    this.createBridgeAndDock();
    this.createTeaHouse();
    this.createResidentialAlley();
    this.createMovingBoats();
    this.createAnimals();
    this.createHistoryPoints();
    this.createParticles();
  }

  update(dt: number, elapsed: number): void {
    for (const door of this.doors.values()) {
      door.angle = damp(door.angle, door.target, 10, dt);
      door.mesh.rotation.y = door.angle;
    }

    if (this.water) {
      this.water.material.color.offsetHSL(0, 0, Math.sin(elapsed * 0.9) * 0.00025);
      this.water.position.y = -0.05 + Math.sin(elapsed * 1.8) * 0.015;
    }

    for (const boat of this.boats) {
      const t = elapsed * boat.speed + boat.phase;
      boat.group.position.x = boat.baseX + Math.sin(t) * 34;
      boat.group.position.z = boat.z + Math.sin(t * 0.6) * 0.6;
      boat.group.rotation.y = Math.cos(t) > 0 ? Math.PI / 2 : -Math.PI / 2;
      boat.group.position.y = -0.02 + Math.sin(t * 3) * 0.035;
    }

    for (const animal of this.animals) {
      const t = elapsed * animal.speed + animal.phase;
      animal.group.position.x = animal.center.x + Math.cos(t) * animal.radius;
      animal.group.position.z = animal.center.z + Math.sin(t * 0.84) * animal.radius * 0.55;
      animal.group.rotation.y = -t + Math.PI / 2;
      animal.group.position.y = animal.center.y + Math.abs(Math.sin(t * 3)) * 0.025;
    }

    for (let index = 0; index < this.animatedSigns.length; index += 1) {
      const sign = this.animatedSigns[index];
      sign.rotation.z = Math.sin(elapsed * 1.5 + index) * 0.035;
    }

    this.animatePoints(this.smoke, dt, 0.9, 3.4, true);
    this.animatePoints(this.dust, dt, 0.25, 1.4, false);
  }

  getColliders(): AabbCollider[] {
    return this.colliders;
  }

  getGroundHeightAt(x: number, z: number): number {
    let height = 0;
    if (x > 9.5 && x < 22.5 && z > -18.2 && z < -2.2) {
      const along = (z + 18.2) / 16;
      height = Math.max(height, 0.25 + Math.sin(along * Math.PI) * 1.15);
    }
    if (x > 5.75 && x < 7.55 && z > 3.35 && z < 8.15) {
      height = Math.max(height, ((z - 3.35) / 4.8) * 2.38);
    }
    if (x > 1.3 && x < 7.9 && z > 7.75 && z < 11.1) {
      height = Math.max(height, 2.38);
    }
    return height;
  }

  collectItemDirect(itemId: string): boolean {
    const pickup = this.pickups.get(itemId);
    if (!pickup || !pickup.enabled()) {
      return false;
    }
    this.collectPickup(pickup);
    return true;
  }

  getDebugStatus(): Record<string, unknown> {
    return {
      colliders: this.colliders.length,
      doors: [...this.doors.values()].map((door) => ({ id: door.id, open: door.open })),
      pickups: [...this.pickups.keys()],
      boats: this.boats.length,
      animals: this.animals.length,
      historyPoints: historyData.length,
    };
  }

  private createGroundAndRiver(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(92, 70, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#b8905c", roughness: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const street = new THREE.Mesh(
      new THREE.PlaneGeometry(78, 10),
      new THREE.MeshStandardMaterial({ color: "#9b8063", roughness: 0.95 }),
    );
    street.rotation.x = -Math.PI / 2;
    street.position.set(-4, 0.012, 1);
    street.receiveShadow = true;
    this.scene.add(street);

    const riverMaterial = new THREE.MeshPhysicalMaterial({
      color: "#3d8391",
      roughness: 0.2,
      metalness: 0.0,
      transmission: 0.18,
      transparent: true,
      opacity: 0.78,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(96, 14, 24, 3), riverMaterial);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(0, -0.08, -15);
    this.water.receiveShadow = true;
    this.scene.add(this.water);

    this.addCollider("north-river-bank-left", -46, 8.4, -8.7, -7.7);
    this.addCollider("north-river-bank-right", 23.2, 46, -8.7, -7.7);
    this.addCollider("south-river-bank-left", -46, 9.2, -22.4, -21.4);
    this.addCollider("south-river-bank-right", 22.8, 46, -22.4, -21.4);
  }

  private createCityGate(): void {
    this.addBox("gate-left-wall", [-36, 2.2, -4.5], [5, 4.4, 2], this.material.stone, true);
    this.addBox("gate-right-wall", [-36, 2.2, 6.5], [5, 4.4, 2], this.material.stone, true);
    this.addBox("gate-top", [-36, 5.1, 1], [5.8, 1.5, 9.2], this.material.darkWood, true);
    this.addRoof([-36, 6.15, 1], [6.6, 1.4, 10.4]);
    this.addCollider("gate-left-wall", -38.6, -33.4, -5.6, -3.4);
    this.addCollider("gate-right-wall", -38.6, -33.4, 5.4, 7.7);
    this.addHangingSign("汴京城門", [-34.2, 3.5, 1], 1.6, 0.46, this.material.clothRed);
  }

  private createMarket(): void {
    this.createBuilding("medicine-shop", [-16, 0, 5.5], [6.2, 3.0, 5.2], "保和藥鋪", this.material.plaster, true);
    this.createBuilding("cloth-shop", [-17.2, 0, -2.2], [5.5, 2.8, 4.2], "布帛行", this.material.plaster, true);
    this.createBuilding("grain-shop", [-8.6, 0, 6.2], [5.3, 2.7, 4.5], "米行", this.material.plaster, true);

    this.createStall("food-stall", [-5.6, 0, -1.8], "炊餅魚羹", this.material.clothGold);
    this.createStall("tea-crate-stall", [0.2, 0, -2.6], "茶葉", this.material.clothBlue);
    this.createStall("fruit-stall", [-1.8, 0, 5.2], "果子", this.material.marketGreen);

    const foodShop = this.addBox("food-shop-interaction", [-5.6, 1.02, -1.15], [1.2, 0.28, 0.18], this.material.highlight, false);
    this.interaction.register({
      id: "shop:food-stall",
      name: "熱食攤",
      kind: "shop",
      object: foodShop,
      range: 3.0,
      getPrompt: () => "按 E 查看攤販",
      onInteract: () => {
        this.ui.toast({ title: "熱食攤", body: "炊餅、魚羹和茶湯香氣混在一起，是市集最熱鬧的角落。" });
      },
    });

    const crateContainer = this.addBox("tea-crate-container", [1.65, 0.45, -2.7], [0.75, 0.8, 0.75], this.material.wood, true);
    this.interaction.register({
      id: "container:tea-crate",
      name: "茶葉木箱",
      kind: "container",
      object: crateContainer,
      range: 3.0,
      getPrompt: () => "按 E 檢查木箱",
      onInteract: () => {
        this.ui.toast({ title: "茶葉木箱", body: "箱內有乾燥茶香，封條完整，帳簿不在這裡。" });
      },
    });

    this.addPickup("market_ledger_page", [-2.2, 0.08, -0.9], "破損帳頁", "main_missing_ledger", "market_ledger_page", () =>
      this.quests.isObjectiveActive("main_missing_ledger", "investigate_market"),
    );
    this.addPickup("ledger_seal_clue", [-14.0, 0.1, 3.1], "朱印線索", "main_missing_ledger", "ledger_seal_clue", () =>
      this.quests.isObjectiveActive("main_missing_ledger", "collect_seal_clue"),
    );

    for (let i = 0; i < 16; i += 1) {
      const x = -12 + i * 1.7;
      const z = i % 2 === 0 ? -5.4 : 6.9;
      this.addCrate([x, 0.28, z], 0.46 + (i % 3) * 0.1);
    }
  }

  private createBridgeAndDock(): void {
    const bridge = new THREE.Group();
    bridge.name = "rainbow-bridge";
    const deck = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.44, 16.5), this.material.wood);
    deck.position.set(16, 1.0, -10.4);
    deck.castShadow = true;
    deck.receiveShadow = true;
    bridge.add(deck);
    for (let i = 0; i < 7; i += 1) {
      const railLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.18), this.material.darkWood);
      railLeft.position.set(10.2 + i * 1.9, 1.62, -18.0);
      bridge.add(railLeft);
      const railRight = railLeft.clone();
      railRight.position.z = -2.8;
      bridge.add(railRight);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(5.8, 0.22, 8, 36, Math.PI), this.material.darkWood);
    arch.rotation.z = Math.PI;
    arch.rotation.y = Math.PI / 2;
    arch.position.set(16, 0.72, -10.4);
    bridge.add(arch);
    this.scene.add(bridge);

    this.addCollider("bridge-side-left", 9.2, 22.8, -18.7, -18.1);
    this.addCollider("bridge-side-right", 9.2, 22.8, -2.7, -2.1);

    this.addBox("dock-platform", [28, 0.2, -17.4], [8.4, 0.32, 4.2], this.material.wood, true);
    this.addCollider("dock-edge", 24.0, 32.4, -19.7, -19.0);
    this.addHangingSign("碼頭", [27.4, 1.9, -12.5], 1.1, 0.35, this.material.clothBlue);

    this.addPickup("lost_basket", [20.5, 0.18, -18.9], "漁夫的竹籃", "side_lost_basket", "lost_basket", () =>
      this.quests.isObjectiveActive("side_lost_basket", "collect_basket"),
    );
  }

  private createTeaHouse(): void {
    const base = new THREE.Group();
    base.name = "tea-house";
    this.scene.add(base);

    this.addBoxTo(base, [4.7, 0.12, 6.8], [8.6, 0.24, 9.6], this.material.wood, true);
    this.addBoxTo(base, [0.2, 1.6, 6.8], [0.34, 3.2, 9.6], this.material.plaster, true);
    this.addBoxTo(base, [9.0, 1.6, 6.8], [0.34, 3.2, 9.6], this.material.plaster, true);
    this.addBoxTo(base, [4.7, 1.6, 11.7], [8.8, 3.2, 0.34], this.material.plaster, true);
    this.addBoxTo(base, [2.0, 1.6, 1.9], [3.6, 3.2, 0.34], this.material.plaster, true);
    this.addBoxTo(base, [7.9, 1.6, 1.9], [2.2, 3.2, 0.34], this.material.plaster, true);
    this.addRoof([4.7, 3.55, 6.8], [9.8, 1.35, 10.8]);
    this.addBoxTo(base, [4.7, 2.45, 9.45], [6.9, 0.22, 3.4], this.material.wood, true);

    for (let i = 0; i < 8; i += 1) {
      this.addBoxTo(base, [6.65, 0.25 + i * 0.28, 3.7 + i * 0.56], [1.3, 0.16, 0.52], this.material.darkWood, true);
    }

    this.addCollider("teahouse-left-wall", 0.0, 0.55, 1.7, 12.0);
    this.addCollider("teahouse-right-wall", 8.78, 9.25, 1.7, 12.0);
    this.addCollider("teahouse-back-wall", 0.0, 9.25, 11.45, 12.05);
    this.addCollider("teahouse-front-left", 0.0, 3.7, 1.7, 2.2);
    this.addCollider("teahouse-front-right", 6.8, 9.25, 1.7, 2.2);

    const doorGroup = new THREE.Group();
    doorGroup.position.set(4.0, 0, 1.93);
    const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.35, 0.16), this.material.darkWood);
    doorMesh.position.set(0.65, 1.18, 0);
    doorMesh.castShadow = true;
    doorGroup.add(doorMesh);
    this.scene.add(doorGroup);
    const doorState: DoorState = { id: "teahouse-door", mesh: doorGroup, open: false, angle: 0, target: 0 };
    this.doors.set(doorState.id, doorState);
    const doorCollider: AabbCollider = {
      id: "teahouse-door",
      minX: 3.75,
      maxX: 6.95,
      minZ: 1.7,
      maxZ: 2.2,
      enabled: () => !doorState.open,
    };
    this.colliders.push(doorCollider);
    this.interaction.register({
      id: "door:teahouse",
      name: "茶樓木門",
      kind: "door",
      object: doorGroup,
      range: 3.2,
      getPrompt: () => (doorState.open ? "按 E 關門" : "按 E 開門"),
      onInteract: () => {
        doorState.open = !doorState.open;
        doorState.target = doorState.open ? -Math.PI / 2.2 : 0;
        this.audio.playDoor();
        this.callbacks.persist();
      },
    });

    this.addHangingSign("臨河茶樓", [4.7, 3.15, 1.55], 1.8, 0.46, this.material.clothRed);
    this.addPickup("missing_ledger", [6.1, 2.55, 9.6], "失蹤的商業帳簿", "main_missing_ledger", "missing_ledger", () =>
      this.quests.isObjectiveActive("main_missing_ledger", "find_ledger"),
    );
  }

  private createResidentialAlley(): void {
    for (let i = 0; i < 5; i += 1) {
      this.createBuilding(`residence-left-${i}`, [-14 + i * 3.9, 0, 17.5], [3.2, 2.5, 4.6], "民居", this.material.plaster, true);
    }
    for (let i = 0; i < 4; i += 1) {
      this.createBuilding(`residence-right-${i}`, [2 + i * 4.2, 0, 17.9], [3.4, 2.6, 4.8], "住家", this.material.plaster, true);
    }
    this.addHangingSign("居民巷", [-4.2, 2.2, 13.0], 1.5, 0.38, this.material.clothBlue);
  }

  private createMovingBoats(): void {
    for (let i = 0; i < 4; i += 1) {
      const group = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.34, 1.05), this.material.darkWood);
      hull.position.y = 0.05;
      group.add(hull);
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.72), this.material.wood);
      cargo.position.set(-0.4, 0.42, 0);
      group.add(cargo);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.4), this.material.clothGold);
      sail.position.set(0.8, 1.0, 0);
      sail.rotation.y = Math.PI / 2;
      group.add(sail);
      group.position.set(-26 + i * 15, 0, -15.0 - (i % 2) * 2.3);
      this.scene.add(group);
      this.boats.push({
        group,
        baseX: group.position.x,
        z: group.position.z,
        speed: 0.16 + i * 0.035,
        phase: i * 1.9,
      });
    }
  }

  private createAnimals(): void {
    this.addAnimal("cat", [-9.0, 0.12, 3.2], 1.4, "#5e4a3f");
    this.addAnimal("dog", [11.0, 0.18, 4.6], 1.8, "#8a6842");
    this.addAnimal("chicken", [-3.4, 0.12, 6.8], 1.2, "#d8d0b4");
    this.addAnimal("horse", [-28.4, 0.42, 2.6], 1.0, "#6a442b");
  }

  private createHistoryPoints(): void {
    const points: Array<[string, [number, number, number]]> = [
      ["info_education_note", [-28.5, 1.4, -2.4]],
      ["info_market_life", [-3.5, 1.1, -3.4]],
      ["info_transport", [15.2, 1.9, -6.0]],
      ["info_architecture", [3.0, 1.2, 12.0]],
      ["info_food", [-5.9, 1.15, -2.1]],
      ["info_clothing", [-17.0, 1.15, -0.1]],
      ["info_river_trade", [27.0, 1.3, -12.6]],
      ["info_medicine", [-15.2, 1.15, 2.6]],
      ["info_occupations", [-30.8, 1.25, 4.0]],
      ["info_currency", [-8.8, 1.2, 7.8]],
      ["info_entertainment", [6.2, 2.75, 8.6]],
    ];
    for (const [id, position] of points) {
      const info = historyData.find((entry) => entry.id === id);
      if (!info) {
        continue;
      }
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.08, 18),
        new THREE.MeshStandardMaterial({ color: "#e4bd69", emissive: "#6c3a17", emissiveIntensity: 0.24 }),
      );
      marker.position.set(position[0], position[1], position[2]);
      marker.rotation.x = Math.PI / 2;
      this.scene.add(marker);
      this.interaction.register({
        id: `history:${id}`,
        name: info.title,
        kind: "inspect",
        object: marker,
        range: 3.2,
        getPrompt: () => "按 E 閱讀史料",
        onInteract: () => {
          this.callbacks.unlockHistory(id);
          this.ui.toast({ title: info.title, body: info.body, tone: "default" });
          this.callbacks.persist();
        },
      });
    }
  }

  private createParticles(): void {
    this.smoke = this.createPointCloud(42, [0, 0, 0], 1.8, "#d7c3a0", 0.18);
    this.smoke.position.set(-5.6, 1.2, -2.0);
    this.scene.add(this.smoke);

    this.dust = this.createPointCloud(90, [0, 0, 0], 12, "#ead3a3", 0.12);
    this.dust.position.set(-4, 0.45, 2);
    this.scene.add(this.dust);
  }

  private addPickup(
    itemId: string,
    position: [number, number, number],
    label: string,
    questId: string | undefined,
    token: string | undefined,
    enabled: () => boolean,
  ): void {
    const item = itemData.find((entry) => entry.id === itemId);
    const object = new THREE.Group();
    object.name = `pickup-${itemId}`;
    const mesh = new THREE.Mesh(
      itemId.includes("ledger") || itemId.includes("page")
        ? new THREE.BoxGeometry(0.62, 0.08, 0.42)
        : new THREE.CylinderGeometry(0.28, 0.32, 0.28, 12),
      this.material.highlight,
    );
    mesh.castShadow = true;
    object.add(mesh);
    object.position.set(position[0], position[1], position[2]);
    this.scene.add(object);

    const state: PickupState = { itemId, object, questId, token, enabled };
    this.pickups.set(itemId, state);
    this.interaction.register({
      id: `pickup:${itemId}`,
      name: label,
      kind: "pickup",
      object,
      range: 3.0,
      enabled: () => enabled() && !this.inventory.hasItem(itemId),
      getPrompt: () => `按 E 拾取${item?.name ?? label}`,
      onInteract: () => this.collectPickup(state),
    });
  }

  private collectPickup(pickup: PickupState): void {
    if (!pickup.enabled()) {
      return;
    }
    this.inventory.addItem(pickup.itemId);
    pickup.object.visible = false;
    this.interaction.unregister(`pickup:${pickup.itemId}`);
    if (pickup.questId && pickup.token) {
      this.quests.advanceQuest(pickup.questId, pickup.token);
    }
    const item = itemData.find((entry) => entry.id === pickup.itemId);
    this.ui.toast({ title: "取得物品", body: item?.name ?? pickup.itemId, tone: "success" });
    this.audio.playCollect();
    this.callbacks.persist();
  }

  private createBuilding(
    id: string,
    position: [number, number, number],
    size: [number, number, number],
    signText: string,
    wallMaterial: THREE.Material,
    collider: boolean,
  ): void {
    const [x, y, z] = position;
    const [w, h, d] = size;
    this.addBox(id, [x, y + h / 2, z], [w, h, d], wallMaterial, true);
    this.addRoof([x, y + h + 0.4, z], [w + 0.8, 1.0, d + 0.8]);
    this.addHangingSign(signText, [x, y + h * 0.72, z - d / 2 - 0.08], Math.min(1.7, w * 0.34), 0.34, this.material.clothRed);
    if (collider) {
      this.addCollider(id, x - w / 2, x + w / 2, z - d / 2, z + d / 2);
    }
  }

  private createStall(
    id: string,
    position: [number, number, number],
    signText: string,
    clothMaterial: THREE.Material,
  ): void {
    const [x, y, z] = position;
    this.addBox(id, [x, y + 0.45, z], [2.1, 0.9, 1.2], this.material.wood, true);
    const canopy = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.6, 3, 1), clothMaterial);
    canopy.position.set(x, y + 1.55, z);
    canopy.rotation.x = -Math.PI / 2.18;
    canopy.castShadow = true;
    this.scene.add(canopy);
    this.addHangingSign(signText, [x, y + 1.35, z - 0.92], 1.2, 0.3, clothMaterial);
    this.addCollider(id, x - 1.15, x + 1.15, z - 0.7, z + 0.7);
  }

  private addAnimal(kind: string, center: [number, number, number], radius: number, color: string): void {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const bodyScale: [number, number, number] =
      kind === "horse" ? [1.0, 0.48, 0.34] : kind === "chicken" ? [0.28, 0.22, 0.2] : [0.42, 0.22, 0.2];
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyScale[0], bodyScale[1], bodyScale[2]), mat);
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(kind === "horse" ? 0.18 : 0.11, 10, 8), mat);
    head.position.set(bodyScale[0] / 2, bodyScale[1] * 0.35, 0);
    group.add(head);
    group.position.set(center[0], center[1], center[2]);
    this.scene.add(group);
    this.animals.push({
      group,
      center: new THREE.Vector3(center[0], center[1], center[2]),
      radius,
      speed: kind === "horse" ? 0.18 : 0.35 + radius * 0.04,
      phase: center[0] * 0.17,
    });
  }

  private addCrate(position: [number, number, number], size: number): void {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), this.material.wood);
    crate.position.set(position[0], position[1], position[2]);
    crate.castShadow = true;
    crate.receiveShadow = true;
    this.scene.add(crate);
  }

  private addBox(
    name: string,
    position: [number, number, number],
    size: [number, number, number],
    material: THREE.Material,
    shadows: boolean,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    this.scene.add(mesh);
    return mesh;
  }

  private addBoxTo(
    group: THREE.Group,
    position: [number, number, number],
    size: [number, number, number],
    material: THREE.Material,
    shadows: boolean,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    group.add(mesh);
    return mesh;
  }

  private addRoof(position: [number, number, number], size: [number, number, number]): void {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(size[0] * 0.72, size[1], 4), this.material.roof);
    roof.position.set(position[0], position[1], position[2]);
    roof.scale.z = size[2] / size[0];
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    roof.receiveShadow = true;
    this.scene.add(roof);
  }

  private addHangingSign(
    text: string,
    position: [number, number, number],
    width: number,
    height: number,
    material: THREE.Material,
  ): void {
    const group = new THREE.Group();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.makeTextMaterial(text, material));
    group.add(sign);
    group.position.set(position[0], position[1], position[2]);
    this.scene.add(group);
    this.animatedSigns.push(group);
  }

  private makeTextMaterial(text: string, fallback: THREE.Material): THREE.Material {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 384;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return fallback;
      }
      ctx.fillStyle = "#6d3025";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#e5bd78";
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      ctx.fillStyle = "#ffe7aa";
      ctx.font = "bold 54px Microsoft JhengHei, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    } catch {
      return fallback;
    }
  }

  private addCollider(id: string, minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.colliders.push({ id, minX, maxX, minZ, maxZ });
  }

  private createPointCloud(
    count: number,
    origin: [number, number, number],
    spread: number,
    color: string,
    opacity: number,
  ): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = origin[0] + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = origin[1] + Math.random() * spread * 0.45;
      positions[i * 3 + 2] = origin[2] + (Math.random() - 0.5) * spread;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color,
        size: 0.12,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
  }

  private animatePoints(
    points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | undefined,
    dt: number,
    speed: number,
    maxHeight: number,
    drift: boolean,
  ): void {
    if (!points) {
      return;
    }
    const attr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i += 1) {
      const y = attr.getY(i) + dt * speed;
      attr.setY(i, y > maxHeight ? 0 : y);
      if (drift) {
        attr.setX(i, attr.getX(i) + Math.sin((y + i) * 0.7) * dt * 0.08);
      }
    }
    attr.needsUpdate = true;
  }
}
