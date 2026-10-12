import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { Toaster } from '@salon/ui';
import '@salon/ui/styles.css';
import './index.css';
import App from './App';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <HashRouter>
        <App />
        <Toaster />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
