import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import { ThemeProvider } from './lib/theme'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      // Don't retry permanent failures. A 401/403/404 means the request is
      // never going to succeed with the same input — retrying just burns
      // serverless invocations and floods logs (we were seeing 5x retries
      // on inaccessible gallery files in Vercel logs).
      retry: (failureCount, error: any) => {
        const status = error?.status
        if (status === 401 || status === 403 || status === 404) return false
        return failureCount < 1
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
