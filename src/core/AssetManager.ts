import * as THREE from "three";

export class AssetManager {
  private readonly textureLoader = new THREE.TextureLoader();

  async loadOptionalTexture(url: string, label: string): Promise<THREE.Texture> {
    try {
      const texture = await this.textureLoader.loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    } catch (error) {
      console.warn(`Optional texture failed, using fallback: ${label}`, error);
      return this.createFallbackTexture(label);
    }
  }

  async loadOptionalModel(url: string, label: string): Promise<THREE.Group> {
    try {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const gltf = await new GLTFLoader().loadAsync(url);
      return gltf.scene;
    } catch (error) {
      console.warn(`Optional GLTF failed, using fallback: ${label}`, error);
      return this.createFallbackModel(label);
    }
  }

  createFallbackTexture(label: string): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#8f5130";
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = "#d9b272";
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillRect(64, 64, 64, 64);
      ctx.fillStyle = "#2d1a10";
      ctx.font = "bold 18px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label.slice(0, 8), 64, 72);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createFallbackModel(label: string): THREE.Group {
    const group = new THREE.Group();
    group.name = `fallback-${label}`;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#d9b272", roughness: 0.8 }),
    );
    mesh.castShadow = true;
    group.add(mesh);
    return group;
  }
}
