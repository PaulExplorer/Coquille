import { createRoot } from 'react-dom/client';
import { App } from './App';
import './options.css';

const container = document.getElementById('app');
if (container) {
  createRoot(container).render(<App />);
}
