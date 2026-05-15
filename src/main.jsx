import React from 'react';
import ReactDOM from 'react-dom/client';
import './storage.js'; // Installs window.storage (localStorage wrapper)
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
