'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API_URL from './config';

const BrandingContext = createContext({
  logo: '',
  siteName: 'Clarion Stream',
  primaryColor: '',
  footerText: '',
  loading: true,
  refresh: () => {},
});

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState({
    logo: '',
    siteName: 'Clarion Stream',
    primaryColor: '',
    footerText: '',
    loading: true,
  });

  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/branding`);
      if (res.ok) {
        const data = await res.json();
        setBranding({ ...data, loading: false });
      } else {
        setBranding(prev => ({ ...prev, loading: false }));
      }
    } catch {
      setBranding(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchBranding();
    // Refresh every 30 seconds for live updates
    const interval = setInterval(fetchBranding, 30000);
    return () => clearInterval(interval);
  }, [fetchBranding]);

  return (
    <BrandingContext.Provider value={{ ...branding, refresh: fetchBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}

// Shared Logo component
export function SiteLogo({ size = 36, style = {} }) {
  const { logo, siteName } = useBranding();

  if (logo) {
    return (
      <img
        src={logo}
        alt={siteName}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: 8,
          ...style,
        }}
      />
    );
  }

  // Default icon logo
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: 'linear-gradient(135deg, var(--primary), var(--primary-dark, #005eb6))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size * 0.5,
        fontWeight: 700,
        flexShrink: 0,
        ...style,
      }}
    >
      CS
    </div>
  );
}
