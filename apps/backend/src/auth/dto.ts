import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { SLUG_RE } from '@salon/core';

const PHONE_RE = /^\+?[0-9]{10,15}$/;

export class RegisterDto {
  @IsString()
  @MaxLength(120)
  salonName!: string;

  @IsString()
  @Matches(SLUG_RE, { message: 'subdomain: lowercase latin, digits, dashes, 3..40 chars' })
  subdomain!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Matches(PHONE_RE)
  phone?: string;

  /** Honeypot (spec §9.3) — must stay empty. */
  @IsOptional()
  @IsString()
  @MaxLength(0)
  website?: string;

  /** Yandex SmartCaptcha client token (verified server-side). */
  @IsOptional()
  @IsString()
  captchaToken?: string;

  /** PDn consent (152-FZ, spec §9.5) — must be true. */
  @IsBoolean()
  privacyConsent!: boolean;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  /** Required when 2FA is enabled for the account. */
  @IsOptional()
  @IsString()
  totpCode?: string;

  @IsOptional()
  @IsString()
  captchaToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(0)
  website?: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @Length(8, 128)
  newPassword!: string;
}

export class Verify2faDto {
  @IsString()
  code!: string;
}
