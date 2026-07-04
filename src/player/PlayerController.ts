import * as THREE from "three";
import type { InputManager } from "../core/InputManager";
import { approach, clamp, horizontalForwardFromYaw, horizontalRightFromYaw } from "../utils/math";
import { resolveCircleAgainstAabbs } from "../utils/collision";
import type { AabbCollider, SettingsState } from "../utils/types";

export interface WorldCollisionQuery {
  getColliders: () => AabbCollider[];
  getGroundHeightAt: (x: number, z: number) => number;
}

export class PlayerController {
  readonly position = new THREE.Vector3(-24, 0, 1);
  yaw = Math.PI / 2;
  pitch = 0;
  private readonly velocity = new THREE.Vector3();
  private verticalVelocity = 0;
  private readonly radius = 0.38;
  private readonly eyeHeight = 1.66;
  private readonly maxStepHeight = 0.62;
  private grounded = true;
  private moving = false;
  private running = false;

  setFromSave(position: [number, number, number], yaw: number, pitch: number): void {
    this.position.set(position[0], position[1], position[2]);
    this.yaw = yaw;
    this.pitch = clamp(pitch, -1.25, 1.25);
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
  }

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
  }

  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, -1.25, 1.25);
  }

  update(
    dt: number,
    input: InputManager,
    camera: THREE.PerspectiveCamera,
    world: WorldCollisionQuery,
    settings: SettingsState,
  ): void {
    const look = input.consumeLookDelta();
    const sensitivity = 0.00215 * settings.cameraSensitivity * settings.mobileSensitivity;
    this.yaw -= look.x * sensitivity;
    this.pitch = clamp(this.pitch - look.y * sensitivity, -1.25, 1.25);

    const intent = input.getMoveIntent();
    const forward = horizontalForwardFromYaw(this.yaw);
    const right = horizontalRightFromYaw(this.yaw);
    const desired = new THREE.Vector3();
    desired.addScaledVector(right, intent.x);
    desired.addScaledVector(forward, intent.y);
    if (desired.lengthSq() > 1) {
      desired.normalize();
    }

    this.running = input.isRunPressed() && desired.lengthSq() > 0.05;
    const speed = this.running ? 6.0 : 3.35;
    desired.multiplyScalar(speed);
    const accel = desired.lengthSq() > 0 ? 23 : 18;
    this.velocity.x = approach(this.velocity.x, desired.x, accel * dt);
    this.velocity.z = approach(this.velocity.z, desired.z, accel * dt);

    const previous = this.position.clone();
    const horizontalNext = this.position.clone();
    horizontalNext.x += this.velocity.x * dt;
    horizontalNext.z += this.velocity.z * dt;

    const currentGround = world.getGroundHeightAt(this.position.x, this.position.z);
    const targetGround = world.getGroundHeightAt(horizontalNext.x, horizontalNext.z);
    const canClimb = targetGround - currentGround <= this.maxStepHeight;
    const resolved = canClimb
      ? resolveCircleAgainstAabbs(horizontalNext, this.radius, world.getColliders()).position
      : previous;

    this.position.x = resolved.x;
    this.position.z = resolved.z;

    const ground = world.getGroundHeightAt(this.position.x, this.position.z);
    if (this.position.y <= ground + 0.05 && this.verticalVelocity <= 0) {
      this.position.y = ground;
      this.verticalVelocity = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      this.verticalVelocity -= 18 * dt;
      this.position.y += this.verticalVelocity * dt;
      if (this.position.y < ground) {
        this.position.y = ground;
        this.verticalVelocity = 0;
        this.grounded = true;
      }
    }

    if (this.position.y < -6) {
      this.position.set(-24, world.getGroundHeightAt(-24, 1), 1);
      this.velocity.set(0, 0, 0);
      this.verticalVelocity = 0;
    }

    this.moving = Math.hypot(this.velocity.x, this.velocity.z) > 0.08 && intent.lengthSq() > 0.05;
    this.applyCamera(camera, settings);
  }

  applyCamera(camera: THREE.PerspectiveCamera, settings: SettingsState): void {
    const bobStrength = settings.reducedCameraMotion ? 0 : this.running ? 0.035 : 0.018;
    const bob = this.moving ? Math.sin(performance.now() * (this.running ? 0.017 : 0.011)) * bobStrength : 0;
    camera.position.set(this.position.x, this.position.y + this.eyeHeight + bob, this.position.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch;
    camera.rotation.z = 0;
  }

  isMoving(): boolean {
    return this.moving && this.grounded;
  }

  isRunning(): boolean {
    return this.running;
  }

  serialize(): { position: [number, number, number]; yaw: number; pitch: number } {
    return {
      position: [this.position.x, this.position.y, this.position.z],
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }
}
