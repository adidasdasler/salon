/**
 * SALON — shared domain types.
 * Single source of truth for enums & API contracts used by backend and all frontends.
 * Keep in sync with prisma/schema.prisma enums.
 */

// ---------- Enums (mirror Prisma) ----------

export enum TenantPlan {
  START = 'START',
  BUSINESS = 'BUSINESS',
  NETWORK = 'NETWORK',
}

export enum TenantStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  ADMIN = 'ADMIN',
  MASTER = 'MASTER',
}

export enum BookingStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  ARRIVED = 'ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum BookingSource {
  MANUAL = 'MANUAL',
  WIDGET = 'WIDGET',
  TELEGRAM_BOT = 'TELEGRAM_BOT',
}

export enum CustomerSource {
  MANUAL = 'MANUAL',
  WIDGET = 'WIDGET',
  IMPORT = 'IMPORT',
  REFERRAL = 'REFERRAL',
  OTHER = 'OTHER',
}

export enum ChannelType {
  TELEGRAM = 'TELEGRAM',
}

export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum MessageStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

export enum ReminderType {
  BEFORE_24H = 'BEFORE_24H',
  BEFORE_2H = 'BEFORE_2H',
  AFTER_VISIT = 'AFTER_VISIT',
}

export enum ReminderChannel {
  TELEGRAM = 'TELEGRAM',
  SMS = 'SMS',
}

export enum ReminderStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum BillingPeriod {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

// ---------- API envelope ----------

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export interface ApiErrorBody {
  /** Machine-readable code, e.g. BOOKING_VERSION_MISMATCH */
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number; // max 100
}

// ---------- Error codes ----------

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  SUBDOMAIN_TAKEN: 'SUBDOMAIN_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  TOKEN_REUSED: 'TOKEN_REUSED',
  BOOKING_CONFLICT: 'BOOKING_CONFLICT',
  BOOKING_VERSION_MISMATCH: 'BOOKING_VERSION_MISMATCH',
  BOOKING_OUT_OF_SCHEDULE: 'BOOKING_OUT_OF_SCHEDULE',
  RESOURCE_NOT_CAPABLE: 'RESOURCE_NOT_CAPABLE',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  CSRF_MISMATCH: 'CSRF_MISMATCH',
  CAPTCHA_FAILED: 'CAPTCHA_FAILED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---------- DTO-ish shapes used across apps ----------

export interface TenantDto {
  id: string;
  subdomain: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  timezone: string;
  trialEndsAt: string | null;
  createdAt: string;
}

export interface UserDto {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  avatarUrl: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
}

export interface ResourceDto {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  capabilities: string[];
  isActive: boolean;
  schedule: ResourceSchedule | null;
}

/** Weekly working schedule stored as JSON on Resource.schedule */
export interface ResourceSchedule {
  /** 0=Sunday .. 6=Saturday */
  days: Record<number, DaySchedule | null>;
  breaks?: Array<{ start: string; end: string }>;
}

export interface DaySchedule {
  /** HH:mm */
  start: string;
  /** HH:mm */
  end: string;
}

export interface ServiceDto {
  id: string;
  name: string;
  description: string | null;
  /** kopecks */
  price: number;
  /** minutes */
  duration: number;
  /** minutes after service */
  bufferTime: number;
  isActive: boolean;
  resourceIds: string[];
}

export interface CustomerDto {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthDate: string | null;
  tags: string[];
  totalVisits: number;
  /** kopecks */
  totalSpent: number;
  lastVisitAt: string | null;
}

export interface BookingDto {
  id: string;
  customerId: string;
  customerName?: string;
  resourceId: string;
  resourceName?: string;
  serviceId: string;
  serviceName?: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  /** kopecks */
  price: number;
  source: BookingSource;
  notes: string | null;
  version: number;
}

export interface SlotDto {
  startsAt: string;
  endsAt: string;
  available: boolean;
}

export interface PlanDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number; // kopecks
  priceYearly: number; // kopecks
  limits: PlanLimits;
  features: string[];
}

export interface PlanLimits {
  maxResources: number;
  maxBookingsPerMonth: number;
  remindersEnabled: boolean;
  analyticsEnabled: boolean;
}

export interface SubscriptionDto {
  id: string;
  plan: PlanDto;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface PaymentDto {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  paidAt: string | null;
  createdAt: string;
  confirmationUrl?: string;
}

// ---------- WebSocket events ----------

export const WsEvents = {
  BookingCreated: 'booking.created',
  BookingUpdated: 'booking.updated',
  BookingDeleted: 'booking.deleted',
  MessageReceived: 'message.received',
  MessageStatus: 'message.status',
  ReminderSent: 'reminder.sent',
} as const;

export const tenantCalendarRoom = (tenantId: string) => `tenant:${tenantId}:calendar`;
export const tenantDialogRoom = (tenantId: string, customerId: string) =>
  `tenant:${tenantId}:dialog:${customerId}`;

// ---------- Helpers ----------

/** Money is stored in kopecks (integers). Format for RU UI. */
export function formatMoney(kopecks: number, currency = 'RUB'): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(
    kopecks / 100,
  );
}

export * from './api-client';

export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;
export const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'static',
  'cdn',
  'dev',
  'staging',
  'test',
]);
