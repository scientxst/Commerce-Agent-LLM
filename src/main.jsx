import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { MsalProvider } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import App from './App'
import './index.css'

// ── Microsoft MSAL config ────────────────────────────────────────
// Set VITE_MICROSOFT_CLIENT_ID in .env to enable Outlook login
const msalInstance = new PublicClientApplication({
  auth: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || 'placeholder-microsoft-client-id',
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
})

// ── Google client ID ─────────────────────────────────────────────
// Set VITE_GOOGLE_CLIENT_ID in .env to enable Google login
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'placeholder-google-client-id'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <MsalProvider instance={msalInstance}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MsalProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
)
