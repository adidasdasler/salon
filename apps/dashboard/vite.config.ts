import { salonViteConfig } from '@salon/config/vite.base.mjs';
export default salonViteConfig({
  name: 'Salon CRM',
  shortName: 'Salon',
  port: 5174,
  apiProxyTarget: process.env.VITE_API_PROXY ?? 'http://localhost:4000',
});
