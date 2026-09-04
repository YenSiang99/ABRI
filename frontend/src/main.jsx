import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ConnectionsProvider } from './context/ConnectionsContext.jsx'
import { FollowsProvider } from './context/FollowsContext.jsx'
import { NotificationsProvider } from './context/NotificationsContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          {/* Inside AuthProvider (it reads the session), and wrapping all of
              App rather than just /app — CardTap is a public route. */}
          <ConnectionsProvider>
            {/* Nested for tree reasons only — it reads AuthContext and
                nothing else. The two hold the two halves of "businesses I
                care about" and neither reads the other, so the order here
                carries no meaning and either could wrap the other. See
                FollowsContext for why they stay apart at all. Wraps all of
                App because the follow button lives on the public business
                profile, same as connect. */}
            <FollowsProvider>
              {/* Unlike the two above this only serves /app, but it sits at
                  the same level so all three read the session from one
                  place. */}
              <NotificationsProvider>
                <App />
              </NotificationsProvider>
            </FollowsProvider>
          </ConnectionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
