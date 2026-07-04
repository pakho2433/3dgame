import * as THREE from "three";
import { clamp } from "../utils/math";

export interface MobileControlElements {
  joystickBase: HTMLElement;
  joystickThumb: HTMLElement;
  lookZone: HTMLElement;
  interactButton: HTMLElement;
  runButton: HTMLElement;
  inventoryButton: HTMLElement;
  questButton: HTMLElement;
  pauseButton: HTMLElement;
}

export interface ConsumedActions {
  interact: boolean;
  inventory: boolean;
  quest: boolean;
  pause: boolean;
}

export class InputManager {
  private readonly keys = new Set<string>();
  private lookDelta = new THREE.Vector2();
  private mobileMove = new THREE.Vector2();
  private mobileLookDelta = new THREE.Vector2();
  private mobileRun = false;
  private interactPressed = false;
  private inventoryPressed = false;
  private questPressed = false;
  private pausePressed = false;
  private pointerAllowed = false;
  private readonly disposers: Array<() => void> = [];

  attach(canvas: HTMLCanvasElement, canLockPointer: () => boolean): void {
    this.pointerAllowed = true;
    const onCanvasClick = () => {
      if (this.pointerAllowed && canLockPointer() && document.pointerLockElement !== canvas) {
        void canvas.requestPointerLock?.();
      }
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        this.lookDelta.x += event.movementX;
        this.lookDelta.y += event.movementY;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat && !["KeyE", "KeyI", "KeyQ", "Escape"].includes(event.code)) {
        return;
      }
      this.keys.add(event.code);
      if (event.code === "KeyE") {
        this.interactPressed = true;
      } else if (event.code === "KeyI") {
        this.inventoryPressed = true;
      } else if (event.code === "KeyQ") {
        this.questPressed = true;
      } else if (event.code === "Escape") {
        this.pausePressed = true;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      this.keys.delete(event.code);
    };
    const onBlur = () => {
      this.keys.clear();
      this.mobileRun = false;
      this.mobileMove.set(0, 0);
    };

    canvas.addEventListener("click", onCanvasClick);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    this.disposers.push(
      () => canvas.removeEventListener("click", onCanvasClick),
      () => document.removeEventListener("mousemove", onMouseMove),
      () => document.removeEventListener("keydown", onKeyDown),
      () => document.removeEventListener("keyup", onKeyUp),
      () => window.removeEventListener("blur", onBlur),
    );
  }

  bindMobileControls(elements: MobileControlElements, canUseTouchLook: () => boolean): void {
    let joystickPointer: number | undefined;
    let joystickCenter = new THREE.Vector2();
    let lookPointer: number | undefined;
    let lastLook = new THREE.Vector2();

    const updateJoystick = (clientX: number, clientY: number) => {
      const delta = new THREE.Vector2(clientX - joystickCenter.x, clientY - joystickCenter.y);
      const max = Math.max(44, elements.joystickBase.clientWidth * 0.38);
      const length = Math.min(max, delta.length());
      const normalized = delta.lengthSq() > 0 ? delta.normalize().multiplyScalar(length / max) : delta;
      this.mobileMove.set(normalized.x, -normalized.y);
      elements.joystickThumb.style.transform = `translate(${normalized.x * max}px, ${normalized.y * max}px)`;
    };

    const stopJoystick = () => {
      joystickPointer = undefined;
      this.mobileMove.set(0, 0);
      elements.joystickThumb.style.transform = "translate(0, 0)";
    };

    const onJoystickDown = (event: PointerEvent) => {
      joystickPointer = event.pointerId;
      const rect = elements.joystickBase.getBoundingClientRect();
      joystickCenter = new THREE.Vector2(rect.left + rect.width / 2, rect.top + rect.height / 2);
      elements.joystickBase.setPointerCapture(event.pointerId);
      updateJoystick(event.clientX, event.clientY);
    };
    const onJoystickMove = (event: PointerEvent) => {
      if (event.pointerId === joystickPointer) {
        updateJoystick(event.clientX, event.clientY);
      }
    };
    const onJoystickUp = (event: PointerEvent) => {
      if (event.pointerId === joystickPointer) {
        stopJoystick();
      }
    };

    const onLookDown = (event: PointerEvent) => {
      if (!canUseTouchLook()) {
        return;
      }
      lookPointer = event.pointerId;
      lastLook = new THREE.Vector2(event.clientX, event.clientY);
      elements.lookZone.setPointerCapture(event.pointerId);
    };
    const onLookMove = (event: PointerEvent) => {
      if (event.pointerId !== lookPointer || !canUseTouchLook()) {
        return;
      }
      this.mobileLookDelta.x += event.clientX - lastLook.x;
      this.mobileLookDelta.y += event.clientY - lastLook.y;
      lastLook.set(event.clientX, event.clientY);
    };
    const onLookUp = (event: PointerEvent) => {
      if (event.pointerId === lookPointer) {
        lookPointer = undefined;
      }
    };

    const makeButtonAction = (element: HTMLElement, action: () => void) => {
      const onPointerDown = (event: PointerEvent) => {
        event.preventDefault();
        action();
      };
      element.addEventListener("pointerdown", onPointerDown);
      this.disposers.push(() => element.removeEventListener("pointerdown", onPointerDown));
    };

    const onRunDown = (event: PointerEvent) => {
      event.preventDefault();
      this.mobileRun = true;
      elements.runButton.classList.add("is-active");
    };
    const onRunUp = () => {
      this.mobileRun = false;
      elements.runButton.classList.remove("is-active");
    };

    elements.joystickBase.addEventListener("pointerdown", onJoystickDown);
    elements.joystickBase.addEventListener("pointermove", onJoystickMove);
    elements.joystickBase.addEventListener("pointerup", onJoystickUp);
    elements.joystickBase.addEventListener("pointercancel", onJoystickUp);
    elements.lookZone.addEventListener("pointerdown", onLookDown);
    elements.lookZone.addEventListener("pointermove", onLookMove);
    elements.lookZone.addEventListener("pointerup", onLookUp);
    elements.lookZone.addEventListener("pointercancel", onLookUp);
    elements.runButton.addEventListener("pointerdown", onRunDown);
    elements.runButton.addEventListener("pointerup", onRunUp);
    elements.runButton.addEventListener("pointercancel", onRunUp);

    makeButtonAction(elements.interactButton, () => {
      this.interactPressed = true;
    });
    makeButtonAction(elements.inventoryButton, () => {
      this.inventoryPressed = true;
    });
    makeButtonAction(elements.questButton, () => {
      this.questPressed = true;
    });
    makeButtonAction(elements.pauseButton, () => {
      this.pausePressed = true;
    });

    this.disposers.push(
      () => elements.joystickBase.removeEventListener("pointerdown", onJoystickDown),
      () => elements.joystickBase.removeEventListener("pointermove", onJoystickMove),
      () => elements.joystickBase.removeEventListener("pointerup", onJoystickUp),
      () => elements.joystickBase.removeEventListener("pointercancel", onJoystickUp),
      () => elements.lookZone.removeEventListener("pointerdown", onLookDown),
      () => elements.lookZone.removeEventListener("pointermove", onLookMove),
      () => elements.lookZone.removeEventListener("pointerup", onLookUp),
      () => elements.lookZone.removeEventListener("pointercancel", onLookUp),
      () => elements.runButton.removeEventListener("pointerdown", onRunDown),
      () => elements.runButton.removeEventListener("pointerup", onRunUp),
      () => elements.runButton.removeEventListener("pointercancel", onRunUp),
    );
  }

  setPointerAllowed(allowed: boolean): void {
    this.pointerAllowed = allowed;
  }

  getMoveIntent(): THREE.Vector2 {
    const desktop = new THREE.Vector2(
      (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0),
      (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0),
    );
    const combined = desktop.lengthSq() > 0 ? desktop : this.mobileMove.clone();
    if (combined.lengthSq() > 1) {
      combined.normalize();
    }
    return combined;
  }

  isRunPressed(): boolean {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.mobileRun;
  }

  consumeLookDelta(): THREE.Vector2 {
    const total = this.lookDelta.clone().add(this.mobileLookDelta);
    this.lookDelta.set(0, 0);
    this.mobileLookDelta.set(0, 0);
    return total;
  }

  consumeActions(): ConsumedActions {
    const actions = {
      interact: this.interactPressed,
      inventory: this.inventoryPressed,
      quest: this.questPressed,
      pause: this.pausePressed,
    };
    this.interactPressed = false;
    this.inventoryPressed = false;
    this.questPressed = false;
    this.pausePressed = false;
    return actions;
  }

  setDebugMobileMove(x: number, y: number): void {
    this.mobileMove.set(clamp(x, -1, 1), clamp(y, -1, 1));
  }

  addDebugMobileLook(dx: number, dy: number): void {
    this.mobileLookDelta.x += dx;
    this.mobileLookDelta.y += dy;
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
  }
}
