import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';

async function boot() {
  // The mock must wrap ``fetch`` before any module that talks to the API
  // is evaluated (the job poller fires on import), so ``App`` is imported
  // only after it is installed.
  if (import.meta.env.VITE_USE_MOCK === '1') {
    const { installMock } = await import('./mock/install');
    installMock();
  }
  const { App } = await import('./App');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
