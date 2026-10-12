import { salonViteConfig } from '@salon/config/vite.base.mjs';
export default salonViteConfig({
  name: 'Salon — запись клиентов онлайн',
  shortName: 'Salon',
  port: 5173,
  apiProxyTarget: process.env.VITE_API_PROXY ?? 'http://localhost:4000',
});
