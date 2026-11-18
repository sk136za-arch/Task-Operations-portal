import { describe, expect, it } from "vitest";
import { isNotificationRead, isOwnNotification } from "@/lib/notification-state";
const activity = { id: 42, actorEmail: "other@example.com", createdAt: "2026-11-18T10:00:00.000Z" };
describe("notification read state", () => {
  it("normalizes own activity email matching", () => expect(isOwnNotification({ ...activity, actorEmail: " Me@Example.com " }, "me@example.com")).toBe(true));
  it("treats activity before its baseline as read", () => expect(isNotificationRead(activity, "me@example.com", "2026-11-18T11:00:00.000Z")).toBe(true));
  it("keeps new external activity unread until marked", () => {
    expect(isNotificationRead(activity, "me@example.com", "2026-11-18T09:00:00.000Z")).toBe(false);
    expect(isNotificationRead(activity, "me@example.com", "2026-11-18T09:00:00.000Z", new Set([42]))).toBe(true);
  });
  it("always treats own activity as read", () => expect(isNotificationRead({ ...activity, actorEmail: "me@example.com" }, "me@example.com", null)).toBe(true));
});
