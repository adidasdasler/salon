/**
 * Standalone BullMQ worker process (spec §7.2, docker-compose `worker` service).
 * Queues: reminders (concurrency 10), messages (20), analytics (5).
 * Retry: 3 attempts, exponential backoff 1s/10s/60s; failed jobs stay in queue as DLQ-ish.
 */
import { Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const prisma = new PrismaClient();

const RETRY = { attempts: 3, backoff: { type: 'exponential' as const, delay: 1000 } };

function tgToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN || undefined;
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = tgToken();
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  const json = (await res.json()) as { ok: boolean };
  return json.ok;
}

const fmtTime = (d: Date) =>
  d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// ---- reminders queue ----
new Worker(
  'reminders',
  async (job) => {
    const { reminderId } = job.data as { reminderId: string };
    const reminder = await prisma.reminder.findUnique({
      where: { id: reminderId },
      include: { booking: { include: { customer: true, service: true, resource: true } } },
    });
    if (!reminder || reminder.status !== 'PENDING') return { skipped: true };
    if (['CANCELLED', 'NO_SHOW'].includes(reminder.booking.status)) {
      await prisma.reminder.update({ where: { id: reminderId }, data: { status: 'CANCELLED' } });
      return { cancelled: true };
    }

    const b = reminder.booking;
    const when = reminder.type === 'BEFORE_24H' ? 'завтра' : 'через 2 часа';
    const text =
      `💇 Напоминание: запись ${when}!\n` +
      `${b.service.name} — ${fmtTime(b.startsAt)}\n` +
      `Мастер: ${b.resource.name}\n` +
      `Отменить или перенести: сообщите нам.`;

    // Resolve Telegram chat via customer channel
    const channel = await prisma.channel.findFirst({
      where: { tenantId: reminder.tenantId, customerId: b.customerId, type: 'TELEGRAM', isActive: true },
    });
    const chatId = (channel?.config as { telegramChatId?: string } | undefined)?.telegramChatId;

    let sent = false;
    let error: string | null = null;
    if (chatId) sent = await sendTelegram(chatId, text);
    else error = 'NO_CHANNEL';

    await prisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: sent ? 'SENT' : 'FAILED',
        sentAt: sent ? new Date() : null,
        attempts: { increment: 1 },
        lastError: error ?? (sent ? null : 'SEND_FAILED'),
      },
    });
    return { sent };
  },
  { connection, concurrency: 10 },
);

// ---- messages queue (broadcasts / inbound replies) ----
new Worker(
  'messages',
  async (job) => {
    const { messageId } = job.data as { messageId: string };
    const msg = await prisma.message.findUnique({ where: { id: messageId }, include: { channel: true } });
    if (!msg || msg.status !== 'PENDING') return { skipped: true };
    const chatId = (msg.channel.config as { telegramChatId?: string } | undefined)?.telegramChatId;
    const sent = chatId ? await sendTelegram(chatId, msg.text) : false;
    await prisma.message.update({
      where: { id: messageId },
      data: { status: sent ? 'SENT' : 'FAILED', error: sent ? null : 'SEND_FAILED' },
    });
    return { sent };
  },
  { connection, concurrency: 20 },
);

// ---- analytics queue (placeholder per-tenant stats recompute at 02:00) ----
new Worker(
  'analytics',
  async (job) => {
    const { tenantId } = job.data as { tenantId: string };
    const count = await prisma.booking.count({ where: { tenantId, status: 'COMPLETED' } });
    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const prev = (t?.settings ?? {}) as Record<string, unknown>;
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...prev, cachedCompletedBookings: count } },
    });
    return { recomputed: true };
  },
  { connection, concurrency: 5 },
);

const queueEvents = new QueueEvents('reminders', { connection: connection.duplicate() });
queueEvents.on('failed', ({ jobId, failedReason }) => console.error(`[worker] job ${jobId} failed: ${failedReason}`));

console.log('[worker] SALON BullMQ worker started (reminders, messages, analytics)');

async function shutdown() {
  await prisma.$disconnect();
  connection.disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
