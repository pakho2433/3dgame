import * as THREE from "three";

export class RendererSystem {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#d7b178");
    this.scene.fog = new THREE.FogExp2("#d7b178", 0.013);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.08, 260);
    this.camera.position.set(-24, 1.7, 1);

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch (error) {
      throw new Error(`WebGL renderer could not be created: ${String(error)}`);
    }

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.canvas = this.renderer.domElement;
    this.canvas.id = "game-canvas";
    this.canvas.setAttribute("aria-label", "清明上河圖第一人稱探索遊戲畫面");
    container.appendChild(this.canvas);

    const ambient = new THREE.HemisphereLight("#fff4d2", "#6b7a86", 1.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight("#fff0c0", 2.45);
    sun.position.set(-20, 42, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -48;
    sun.shadow.camera.right = 48;
    sun.shadow.camera.top = 48;
    sun.shadow.camera.bottom = -48;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight("#9bc9ff", 0.35);
    fill.position.set(18, 18, -30);
    this.scene.add(fill);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      document.body.dataset.webglLost = "true";
    };
    const onContextRestored = () => {
      document.body.dataset.webglLost = "false";
    };
    this.canvas.addEventListener("webglcontextlost", onContextLost);
    this.canvas.addEventListener("webglcontextrestored", onContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth ?? window.innerWidth);
    const height = Math.max(1, parent?.clientHeight ?? window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  setQuality(quality: "low" | "medium" | "high"): void {
    const pixelRatio = quality === "high" ? 1.8 : quality === "medium" ? 1.4 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatio));
    this.resize();
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
