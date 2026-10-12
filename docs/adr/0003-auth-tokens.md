# ADR-0003: JWT RS256 access + opaque refresh с ротацией

**Статус:** принят

Access: RS256, 15 мин, httpOnly SameSite cookie. Refresh: opaque random 64B, 30 дней, в БД только SHA-256 hash, family-based ротация + reuse detection (перевызов старого токена → отзыв всей семьи). Пароли argon2id. 2FA TOTP для OWNER/MANAGER. CSRF — HMAC-подписанный double-submit токен (устойчив к подмене cookie).

Dev-fallback HS256 разрешён только при NODE_ENV!=production (защита от деплоя без ключей).
