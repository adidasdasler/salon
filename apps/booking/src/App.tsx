/**
 * Public booking widget (spec §6.2): слоты → услуга → мастер → время → подтверждение.
 * Mobile-first: 80% of traffic is from phones (§1.4).
 */
import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import WidgetPage from './pages/WidgetPage';

export default function App() {
  return (
    <Routes>
      <Route path="/b/:salon" element={<WidgetPage />} />
      <Route path="*" element={<Navigate to="/b/demo" replace />} />
    </Routes>
  );
}
