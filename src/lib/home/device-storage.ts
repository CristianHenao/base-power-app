import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Public bucket for cropped device outline thumbnails. */
export const HOME_DEVICES_BUCKET = "home-devices";

export function homeDeviceStoragePath(
  userId: string,
  deviceId: string,
): string {
  return `${userId}/${deviceId}.png`;
}

export function homeDevicePublicUrl(
  supabase: SupabaseClient<Database>,
  storagePath: string,
): string {
  const { data } = supabase.storage
    .from(HOME_DEVICES_BUCKET)
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Upload (or replace) a PNG thumbnail for a scanned device.
 * Object path is `{userId}/{deviceId}.png`.
 */
export async function uploadHomeDeviceThumbnail(
  supabase: SupabaseClient<Database>,
  options: {
    userId: string;
    deviceId: string;
    imageBase64: string;
    contentType?: string;
  },
): Promise<{ storagePath: string; thumbnailUrl: string }> {
  const {
    userId,
    deviceId,
    imageBase64,
    contentType = "image/png",
  } = options;

  const storagePath = homeDeviceStoragePath(userId, deviceId);
  const bytes = Buffer.from(imageBase64, "base64");

  const { error } = await supabase.storage
    .from(HOME_DEVICES_BUCKET)
    .upload(storagePath, bytes, {
      contentType,
      upsert: true,
      cacheControl: "3600",
    });

  if (error) {
    throw new Error(error.message || "Failed to upload device thumbnail.");
  }

  return {
    storagePath,
    thumbnailUrl: homeDevicePublicUrl(supabase, storagePath),
  };
}
