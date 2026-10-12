import { createApiClient } from '@salon/core';

/** Public widget talks to /v1/public/* — proxied in dev, same-origin via nginx in prod. */
export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL ?? '/v1' });
