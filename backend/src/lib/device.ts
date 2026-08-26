import { prisma } from "./db";

export interface SafeDevice {
  id: string;
  platform: string;
  createdAt: Date;
}

const SAFE_DEVICE_SELECT = { id: true, platform: true, createdAt: true } as const;

/**
 * Upserts on `pushToken` (unique): re-registering the same token — e.g. an
 * app reinstall that re-issues an identical Expo/FCM token, or a device
 * changing hands to a different account — updates the existing row's
 * owner/platform rather than creating a duplicate.
 */
export async function registerDevice(userId: string, platform: string, pushToken: string): Promise<SafeDevice> {
  return prisma.device.upsert({
    where: { pushToken },
    create: { userId, platform, pushToken },
    update: { userId, platform },
    select: SAFE_DEVICE_SELECT,
  });
}

/**
 * Scoped to { id, userId } in the query itself — same IDOR-safe pattern as
 * lib/project.ts. Returns whether a device was actually deleted.
 */
export async function deleteOwnedDevice(userId: string, deviceId: string): Promise<boolean> {
  const { count } = await prisma.device.deleteMany({ where: { id: deviceId, userId } });
  return count > 0;
}
