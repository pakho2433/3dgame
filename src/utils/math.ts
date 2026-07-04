import * as THREE from "three";

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, t: number): number =>
  from + (to - from) * clamp(t, 0, 1);

export const damp = (from: number, to: number, lambda: number, dt: number): number =>
  lerp(from, to, 1 - Math.exp(-lambda * dt));

export const approach = (value: number, target: number, maxDelta: number): number => {
  if (Math.abs(target - value) <= maxDelta) {
    return target;
  }
  return value + Math.sign(target - value) * maxDelta;
};

export const wrap01 = (value: number): number => {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
};

export const horizontalForwardFromYaw = (yaw: number): THREE.Vector3 =>
  new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();

export const horizontalRightFromYaw = (yaw: number): THREE.Vector3 =>
  new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

export const distance2D = (ax: number, az: number, bx: number, bz: number): number =>
  Math.hypot(ax - bx, az - bz);
