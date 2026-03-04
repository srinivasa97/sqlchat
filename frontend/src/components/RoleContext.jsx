import { createContext, useContext, useState, useEffect } from 'react';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage on page load
    const saved = localStorage.getItem('sqlchat_token');
    const savedUser = localStorage.getItem('sqlchat_user');
    if (saved && savedUser) {
      try {
        setToken(saved);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('sqlchat_token');
        localStorage.removeItem('sqlchat_user');
      }
    }
    setLoading(false);
  }, []);

  const login = (tokenValue, userData) => {
    setToken(tokenValue);
    setUser(userData);
    localStorage.setItem('sqlchat_token', tokenValue);
    localStorage.setItem('sqlchat_user', JSON.stringify(userData));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('sqlchat_token');
    localStorage.removeItem('sqlchat_user');
  };

  return (
    <RoleContext.Provider value={{
      user,
      token,
      loading,
      login,
      logout,
      isAdmin: user?.role === 'admin',
      isLoggedIn: !!user,
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
