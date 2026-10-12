import { salonViteConfig } from '@salon/config/vite.base.mjs';
export default salonViteConfig({
  name: 'Salon — запись онлайн',
  shortName: 'Запись',
  port: 5175,
  apiProxyTarget: process.env.VITE_API_PROXY ?? 'http://localhost:4000',
});
