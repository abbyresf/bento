import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

// Above BrowserRouter: App returns early for auth, landing and onboarding, so a
// provider mounted inside it would leave those screens untethered to the theme.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
        <Analytics />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
