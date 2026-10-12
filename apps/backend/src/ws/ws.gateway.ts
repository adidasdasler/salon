import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { tenantCalendarRoom, tenantDialogRoom, WsEvents } from '@salon/core';

/** CORS for WS: same whitelist as HTTP API (spec §9.3) — never `origin: true` with credentials. */
function wsCorsOrigin(origin: string | undefined): boolean {
  const whitelist = (process.env.CORS_ORIGIN ?? '').split(',').filter(Boolean);
  const pattern = process.env.CORS_ORIGIN_REGEX;
  if (!origin) return true; // non-browser clients (worker/tests)
  if (whitelist.includes(origin)) return true;
  return Boolean(pattern && new RegExp(pattern).test(origin));
}

/**
 * Socket.io gateway (spec §7.1). Rooms are tenant-scoped; auth via access token
 * in handshake (`auth.token`). Scale-out uses Redis adapter when REDIS_URL set.
 */
@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: wsCorsOrigin, credentials: true },
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) throw new Error('no token');
      const payload = await this.jwt.verifyAsync<{ sub: string; tenantId: string }>(token);
      socket.data.tenantId = payload.tenantId;
      socket.data.userId = payload.sub;
      await socket.join(tenantCalendarRoom(payload.tenantId));
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    void socket;
    void this.logger;
  }

  /** Join a customer dialog room (inbox thread). */
  joinDialog(socketId: string, tenantId: string, customerId: string) {
    const s = this.server.sockets.sockets.get(socketId);
    if (s && s.data.tenantId === tenantId) void s.join(tenantDialogRoom(tenantId, customerId));
  }

  emitToTenantCalendar(tenantId: string, event: (typeof WsEvents)[keyof typeof WsEvents], payload: unknown) {
    this.server.to(tenantCalendarRoom(tenantId)).emit(event, payload);
  }

  emitMessageReceived(tenantId: string, customerId: string, payload: unknown) {
    this.server.to(tenantDialogRoom(tenantId, customerId)).emit(WsEvents.MessageReceived, payload);
  }
}
