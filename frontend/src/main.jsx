import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RoleProvider } from './components/RoleContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RoleProvider>
      <App />
    </RoleProvider>
  </React.StrictMode>
);
