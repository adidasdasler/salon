import { createApiClient } from '@salon/core';

export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_URL ?? '/v1' });
