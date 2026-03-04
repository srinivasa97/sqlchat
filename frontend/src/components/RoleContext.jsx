import { createContext, useContext, useState } from 'react';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [role, setRole] = useState('admin'); // default: admin

  const toggle = () => setRole(r => r === 'admin' ? 'viewer' : 'admin');

  return (
    <RoleContext.Provider value={{ role, toggle, isAdmin: role === 'admin' }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
