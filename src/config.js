// Centralized API Base URL helper for Local & Production (Render + Vercel)
const RENDER_BACKEND = 'https://mis-finanzas-cik2.onrender.com';

export const API_BASE = import.meta.env.VITE_API_URL || 
  (typeof window !== 'undefined' && window.location.hostname !== 'localhost' ? RENDER_BACKEND : '');
