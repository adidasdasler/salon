/** BullMQ queue names shared between backend producers and worker consumers (spec §7.2). */
export const QUEUES = {
  reminders: 'reminders',
  messages: 'messages',
  analytics: 'analytics',
} as const;

export interface ReminderJobData {
  reminderId: string;
  tenantId: string;
}
