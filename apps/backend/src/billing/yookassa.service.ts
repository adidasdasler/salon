import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

/** Minimal YooKassa API client (spec §8) — invoice payments for subscriptions. */
@Injectable()
export class YookassaService {
  private readonly logger = new Logger(YookassaService.name);
  private readonly base = 'https://api.yookassa.ru/v3';

  constructor(private readonly config: ConfigService) {}

  private get creds(): AppConfig['yookassa'] {
    return this.config.get('app')!.yookassa;
  }

  get configured(): boolean {
    const c = this.creds;
    return Boolean(c.shopId && c.secretKey);
  }

  /** Create a payment; idempotent via Idempotency-Key. Returns confirmation URL. */
  async createPayment(params: {
    amountKopecks: number;
    description: string;
    metadata: Record<string, unknown>;
    returnUrl: string;
    idempotencyKey?: string;
  }): Promise<{ id: string; confirmationUrl: string | null }> {
    if (!this.configured) {
      // Dev fallback: no credentials → simulated invoice so the flow is testable locally.
      const id = `dev_${randomUUID()}`;
      this.logger.warn(`YooKassa not configured — simulated payment ${id}`);
      return { id, confirmationUrl: `${params.returnUrl}?payment=${id}&simulated=1` };
    }

    const res = await fetch(`${this.base}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': params.idempotencyKey ?? randomUUID(),
        Authorization: 'Basic ' + Buffer.from(`${this.creds.shopId}:${this.creds.secretKey}`).toString('base64'),
      },
      body: JSON.stringify({
        amount: { value: (params.amountKopecks / 100).toFixed(2), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: params.returnUrl },
        description: params.description,
        metadata: params.metadata,
      }),
    });
    if (!res.ok) throw new Error(`YooKassa create failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { id: string; confirmation?: { confirmation_url?: string } };
    return { id: json.id, confirmationUrl: json.confirmation?.confirmation_url ?? null };
  }

  /** Fetch payment status (used to reconcile webhooks). */
  async getPayment(id: string): Promise<{ id: string; status: string }> {
    if (!this.configured) return { id, status: 'succeeded' }; // dev sim
    const res = await fetch(`${this.base}/payments/${id}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${this.creds.shopId}:${this.creds.secretKey}`).toString('base64') },
    });
    if (!res.ok) throw new Error(`YooKassa get failed: ${res.status}`);
    return (await res.json()) as { id: string; status: string };
  }

  /** Verify webhook signature (YooKassa: SHA256 HMAC with secret key over raw body). */
  verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature || !this.configured) return !this.configured; // allow in dev-sim mode
    const expected = createHmac('sha256', this.creds.secretKey).update(rawBody, 'utf8').digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
