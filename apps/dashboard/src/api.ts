import { createApiClient } from '@salon/core';

/** In dev the Vite proxy maps /v1 -> backend; in prod same-origin via nginx (api on host facade). */
export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL ?? '/v1' });
