
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  // Graceful fallback or error logging instead of immediate crash if possible, 
  // but throwing is standard if the app cannot mount.
  console.error("FATAL: Could not find root element to mount to");
  throw new Error("Could not find root element to mount to");
}

try {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e) {
  console.error("FATAL: Error during React mounting", e);
}
