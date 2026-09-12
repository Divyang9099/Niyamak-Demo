import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// NOTE: React.StrictMode was removed intentionally. In development it double-invokes
// every effect (you saw each API call logged twice), doubling network + DB load and
// making the app feel slow. It has no effect in production. Re-add it temporarily if
// you want to audit for effect-cleanup bugs.
createRoot(document.getElementById('root')).render(<App />);
