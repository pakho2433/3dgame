import * as THREE from "three";
import type { AabbCollider } from "./types";

export interface CircleMoveResult {
  position: THREE.Vector3;
  hitColliderIds: string[];
}

const overlapsCircleAabb = (
  x: number,
  z: number,
  radius: number,
  collider: AabbCollider,
): boolean => {
  const nearestX = Math.max(collider.minX, Math.min(x, collider.maxX));
  const nearestZ = Math.max(collider.minZ, Math.min(z, collider.maxZ));
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
};

export const resolveCircleAgainstAabbs = (
  position: THREE.Vector3,
  radius: number,
  colliders: AabbCollider[],
): CircleMoveResult => {
  const next = position.clone();
  const hits: string[] = [];

  for (const collider of colliders) {
    if (collider.enabled && !collider.enabled()) {
      continue;
    }
    if (!overlapsCircleAabb(next.x, next.z, radius, collider)) {
      continue;
    }

    const left = Math.abs(next.x - collider.minX);
    const right = Math.abs(collider.maxX - next.x);
    const bottom = Math.abs(next.z - collider.minZ);
    const top = Math.abs(collider.maxZ - next.z);
    const minPush = Math.min(left, right, bottom, top);

    if (minPush === left) {
      next.x = collider.minX - radius;
    } else if (minPush === right) {
      next.x = collider.maxX + radius;
    } else if (minPush === bottom) {
      next.z = collider.minZ - radius;
    } else {
      next.z = collider.maxZ + radius;
    }
    hits.push(collider.id);
  }

  return { position: next, hitColliderIds: hits };
};

export const pointInsideAabb2D = (x: number, z: number, collider: AabbCollider): boolean =>
  x >= collider.minX && x <= collider.maxX && z >= collider.minZ && z <= collider.maxZ;
