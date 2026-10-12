import { Injectable, Logger } from '@nestjs/common';

/** Thin Telegram Bot API sender (spec §8). Token from env — never logged. */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  get configured(): boolean {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  }

  async sendMessage(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.debug(`Telegram not configured — skipped send to ${chatId}`);
      return { ok: false, error: 'NO_TOKEN' };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      });
      const json = (await res.json()) as { ok: boolean; description?: string };
      return { ok: json.ok, error: json.description };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}
