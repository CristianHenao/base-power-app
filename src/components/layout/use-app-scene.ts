"use client";

import { useEffect } from "react";

export type AppScene = "map" | "light";

/**
 * Sets html[data-scene] so Liquid Glass / status bar can sample the right
 * root background (dark map vs light forms).
 */
export function useAppScene(scene: AppScene) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.scene;
    root.dataset.scene = scene;
    return () => {
      if (previous) {
        root.dataset.scene = previous;
      } else {
        delete root.dataset.scene;
      }
    };
  }, [scene]);
}
