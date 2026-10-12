import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/Landing';
import PricingPage from './pages/Pricing';
import RegisterPage from './pages/Register';

export default function App() {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
