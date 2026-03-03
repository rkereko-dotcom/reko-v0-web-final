"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface SiteSettingsContextType {
  siteName: string;
}

const SiteSettingsContext = createContext<SiteSettingsContextType>({
  siteName: "Reko",
});

export function useSiteName() {
  return useContext(SiteSettingsContext).siteName;
}

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [siteName, setSiteName] = useState("Reko");

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.siteName) setSiteName(data.siteName);
      })
      .catch(() => {});
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ siteName }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}
