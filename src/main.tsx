import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './lib/swRegistration';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', registerServiceWorker);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
