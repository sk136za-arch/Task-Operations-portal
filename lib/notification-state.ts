export type NotificationActivity = { id: number; actorEmail: string; createdAt: string };

export function isOwnNotification(activity: NotificationActivity, email: string) {
  return activity.actorEmail.trim().toLowerCase() === email.trim().toLowerCase();
}

export function isNotificationRead(activity: NotificationActivity, email: string, notificationsStartedAt?: string | null, readIds: ReadonlySet<number> = new Set()) {
  if (isOwnNotification(activity, email) || readIds.has(activity.id)) return true;
  const baseline = notificationsStartedAt ? new Date(notificationsStartedAt).getTime() : Number.POSITIVE_INFINITY;
  return new Date(activity.createdAt).getTime() <= baseline;
}
