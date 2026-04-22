import React, { createContext, useCallback, useContext, useState } from "react";

type ImmersiveContextValue = {
  isImmersive: boolean;
  setImmersive: (value: boolean) => void;
  toggleImmersive: () => void;
};

const ImmersiveContext = createContext<ImmersiveContextValue | null>(null);

export function ImmersiveProvider({ children }: { children: React.ReactNode }) {
  const [isImmersive, setIsImmersive] = useState(false);

  const setImmersive = useCallback((value: boolean) => {
    setIsImmersive(value);
    // Toggle body class for global CSS targeting
    document.body.classList.toggle("immersive-active", value);
  }, []);

  const toggleImmersive = useCallback(() => {
    setIsImmersive((prev) => {
      const next = !prev;
      document.body.classList.toggle("immersive-active", next);
      return next;
    });
  }, []);

  return (
    <ImmersiveContext.Provider value={{ isImmersive, setImmersive, toggleImmersive }}>
      {children}
    </ImmersiveContext.Provider>
  );
}

export function useImmersive() {
  const ctx = useContext(ImmersiveContext);
  if (!ctx) {
    throw new Error("useImmersive must be used within ImmersiveProvider");
  }
  return ctx;
}
