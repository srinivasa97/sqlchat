import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

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
        // Set header immediately before any components mount
        axios.defaults.headers.common['Authorization'] = 'Bearer ' + saved;
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
    // Set axios header immediately at login time
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + tokenValue;
    setToken(tokenValue);
    setUser(userData);
    localStorage.setItem('sqlchat_token', tokenValue);
    localStorage.setItem('sqlchat_user', JSON.stringify(userData));
  };

  const logout = () => {
    delete axios.defaults.headers.common['Authorization'];
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
