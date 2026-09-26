import type { Map as MapboxMap, CustomLayerInterface } from "mapbox-gl";
import {
  AmbientLight,
  DirectionalLight,
  Matrix4,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";

export type ThreeLayerContext = {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
};

type ThreeLayerOptions = {
  id?: string;
  onAdd?: (ctx: ThreeLayerContext, map: MapboxMap) => void;
  onRender?: (ctx: ThreeLayerContext, map: MapboxMap) => void;
  onRemove?: (ctx: ThreeLayerContext, map: MapboxMap) => void;
};

/**
 * Creates a Mapbox GL custom layer backed by a Three.js scene.
 * Use this as the foundation for 3D overlays (assets, corridors, terrain).
 *
 * Important: only enable when you have content to draw. An empty Three.js
 * layer that shares Mapbox’s WebGL context can blank the basemap.
 */
export function createThreeLayer(
  options: ThreeLayerOptions = {},
): CustomLayerInterface {
  const id = options.id ?? "three-layer";

  let scene: Scene;
  let camera: PerspectiveCamera;
  let renderer: WebGLRenderer;
  let mapRef: MapboxMap;

  const ctx = (): ThreeLayerContext => ({ scene, camera, renderer });

  return {
    id,
    type: "custom",
    renderingMode: "3d",

    onAdd(map, gl) {
      mapRef = map;
      scene = new Scene();
      camera = new PerspectiveCamera();

      const ambient = new AmbientLight(0xffffff, 0.55);
      const directional = new DirectionalLight(0xffffff, 0.85);
      directional.position.set(0, -70, 100).normalize();
      scene.add(ambient, directional);

      renderer = new WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGLRenderingContext,
        antialias: true,
      });
      renderer.autoClear = false;

      options.onAdd?.(ctx(), map);
    },

    render(_gl, matrix) {
      // Skip drawing until callers add meshes — avoids stomping Mapbox state.
      if (scene.children.length <= 2) {
        return;
      }

      const m = new Matrix4().fromArray(matrix as number[]);
      camera.projectionMatrix = m;

      renderer.resetState();
      options.onRender?.(ctx(), mapRef);
      renderer.render(scene, camera);
      mapRef.triggerRepaint();
    },

    onRemove() {
      options.onRemove?.(ctx(), mapRef);
      renderer.dispose();
    },
  };
}
