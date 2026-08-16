import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ConnectionsProvider } from './context/ConnectionsContext.jsx'
import { NotificationsProvider } from './context/NotificationsContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          {/* Inside AuthProvider (it reads the session), and wrapping all of
              App rather than just /app — CardTap is a public route. */}
          <ConnectionsProvider>
            {/* Unlike ConnectionsProvider this only serves /app, but it sits
                at the same level so both read the session from one place. */}
            <NotificationsProvider>
              <App />
            </NotificationsProvider>
          </ConnectionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
