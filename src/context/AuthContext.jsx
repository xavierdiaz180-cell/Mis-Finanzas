import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE } from '../config';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('mis_finanzas_token') || null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('mis_finanzas_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  // Global fetch interceptor to attach Bearer token to all API calls
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      let [resource, config] = args;
      config = config || {};
      config.headers = config.headers || {};

      const currentToken = localStorage.getItem('mis_finanzas_token');
      if (currentToken) {
        if (config.headers instanceof Headers) {
          config.headers.set('Authorization', `Bearer ${currentToken}`);
        } else {
          config.headers['Authorization'] = `Bearer ${currentToken}`;
        }
      }

      const response = await originalFetch(resource, config);
      if (response.status === 401 && !resource.includes('/api/auth/login')) {
        // Clear invalid token on 401
        localStorage.removeItem('mis_finanzas_token');
        localStorage.removeItem('mis_finanzas_user');
        setToken(null);
        setUser(null);
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Verify session on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.user) {
          setUser(data.user);
          localStorage.setItem('mis_finanzas_user', JSON.stringify(data.user));
        } else {
          logout();
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Error al iniciar sesión.');
    }

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('mis_finanzas_token', data.token);
    localStorage.setItem('mis_finanzas_user', JSON.stringify(data.user));
    return data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('mis_finanzas_token');
    localStorage.removeItem('mis_finanzas_user');
  };

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de AuthProvider');
  }
  return context;
}
