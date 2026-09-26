"use client";

/**
 * The homeowner's scanned devices (Christian's photo scan), as load items for the household
 * answer. Loaded from the user's own Supabase rows; nothing is sent to the Porchlight API.
 */
import { useEffect, useState } from "react";
import { type HomeDevice, isPriorityDevice } from "@/lib/home/devices";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { listHomeDevices } from "@/lib/supabase/home-devices";
import { getCurrentUser } from "@/lib/supabase/profile";
import { itemsFromDevices, type LoadItem } from "./core-runtime";

/** Scanned devices as load items, priority from the scan (medical devices always count). */
export function scannedLoadItems(devices: HomeDevice[]): LoadItem[] {
  return devices.flatMap((device) =>
    itemsFromDevices([device]).map((item) => ({ ...item, priority: isPriorityDevice(device) })));
}

export function useScannedDevices(): HomeDevice[] {
  const [devices, setDevices] = useState<HomeDevice[]>([]);
  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const user = await getCurrentUser(supabase);
        if (!user || cancelled) return;
        const rows = await listHomeDevices(supabase, user.id);
        if (!cancelled) setDevices(rows);
      } catch {
        // No devices is a fine answer here; the checklist still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return devices;
}
