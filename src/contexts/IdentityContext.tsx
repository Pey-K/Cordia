import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { UserIdentity } from '../lib/tauri';

interface IdentityContextType {
  identity: UserIdentity | null;
  setIdentity: (identity: UserIdentity | null) => void;
  clearIdentity: () => void;
}

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<UserIdentity | null>(null);

  const clearIdentity = useCallback(() => {
    setIdentity(null);
  }, []);

  const value = useMemo(() => ({
    identity,
    setIdentity,
    clearIdentity,
  }), [identity, clearIdentity]);

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (context === undefined) {
    throw new Error('useIdentity must be used within an IdentityProvider');
  }
  return context;
}
