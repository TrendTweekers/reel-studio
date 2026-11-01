import { createRoot } from 'react-dom/client';
// Self-hosted UI type (no Google request for the interface itself).
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
