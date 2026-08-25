import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('Service worker registered');

      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 60 * 1000); // Every minute

      // Check for updates when page becomes visible
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          registration.update();
        }
      });
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
