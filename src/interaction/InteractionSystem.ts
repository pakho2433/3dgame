import * as THREE from "three";
import type { Interactable } from "../utils/types";
import type { UIManager } from "../ui/UIManager";

export class InteractionSystem {
  private readonly raycaster = new THREE.Raycaster();
  private readonly screenCenter = new THREE.Vector2(0, 0);
  private readonly interactables = new Map<string, Interactable>();
  private readonly objectToInteractable = new Map<string, Interactable>();
  private readonly originalEmissive = new WeakMap<THREE.Material, THREE.Color>();
  private active?: Interactable;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly ui: UIManager,
  ) {
    this.raycaster.far = 7;
  }

  register(interactable: Interactable): void {
    this.interactables.set(interactable.id, interactable);
    interactable.object.traverse((child) => {
      this.objectToInteractable.set(child.uuid, interactable);
    });
  }

  unregister(id: string): void {
    const interactable = this.interactables.get(id);
    if (!interactable) {
      return;
    }
    interactable.object.traverse((child) => this.objectToInteractable.delete(child.uuid));
    if (this.active?.id === id) {
      this.setActive(undefined);
    }
    this.interactables.delete(id);
  }

  update(): void {
    this.raycaster.setFromCamera(this.screenCenter, this.camera);
    const candidates = [...this.interactables.values()]
      .filter((interactable) => !interactable.enabled || interactable.enabled())
      .map((interactable) => interactable.object);
    const hits = this.raycaster.intersectObjects(candidates, true);
    let next: Interactable | undefined;
    for (const hit of hits) {
      const interactable = this.findInteractableFromObject(hit.object);
      if (!interactable) {
        continue;
      }
      const distance = this.camera.position.distanceTo(hit.point);
      if (distance <= interactable.range) {
        next = interactable;
        break;
      }
    }
    this.setActive(next);
  }

  interactActive(): boolean {
    if (!this.active) {
      return false;
    }
    this.active.onInteract();
    return true;
  }

  forceInteract(id: string): boolean {
    const interactable = this.interactables.get(id);
    if (!interactable || (interactable.enabled && !interactable.enabled())) {
      return false;
    }
    interactable.onInteract();
    return true;
  }

  getAllIds(): string[] {
    return [...this.interactables.keys()];
  }

  private findInteractableFromObject(object: THREE.Object3D): Interactable | undefined {
    let node: THREE.Object3D | null = object;
    while (node) {
      const interactable = this.objectToInteractable.get(node.uuid);
      if (interactable) {
        return interactable;
      }
      node = node.parent;
    }
    return undefined;
  }

  private setActive(next: Interactable | undefined): void {
    if (this.active?.id === next?.id) {
      return;
    }
    if (this.active) {
      this.applyHighlight(this.active.object, false);
    }
    this.active = next;
    if (next) {
      this.applyHighlight(next.object, true);
      this.ui.showInteraction(next.name, next.getPrompt?.() ?? "按 E 互動");
    } else {
      this.ui.hideInteraction();
    }
  }

  private applyHighlight(object: THREE.Object3D, enabled: boolean): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if ("emissive" in material) {
          const standard = material as THREE.MeshStandardMaterial;
          if (!this.originalEmissive.has(standard)) {
            this.originalEmissive.set(standard, standard.emissive.clone());
          }
          const original = this.originalEmissive.get(standard)!;
          standard.emissive.copy(enabled ? new THREE.Color("#d99b45") : original);
          standard.emissiveIntensity = enabled ? 0.55 : 0;
        }
      }
    });
  }
}
