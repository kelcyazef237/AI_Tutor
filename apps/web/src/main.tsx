import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { App } from './App';
import { ThemeProvider, useTheme } from './lib/theme';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
});

function ThemedToaster() {
  const { resolved } = useTheme();
  // Top-center avoids overlapping the mobile bottom nav; richColors keeps AI error toasts readable.
  return <Toaster theme={resolved} position="top-center" richColors closeButton gap={8} toastOptions={{ style: { marginTop: 'env(safe-area-inset-top)' } }} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <ThemedToaster />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
