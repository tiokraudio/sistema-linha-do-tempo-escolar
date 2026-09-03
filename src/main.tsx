import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initApiInterceptor } from './utils/api';
import { initFaviconFromPublicConfig } from './utils/favicon';

initApiInterceptor();
initFaviconFromPublicConfig();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

