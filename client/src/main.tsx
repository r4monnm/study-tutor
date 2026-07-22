import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'katex/dist/katex.min.css'
import App from './App.tsx'
import AuthGate from './views/AuthGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* keyed by user so switching accounts remounts a clean thread */}
    <AuthGate>{(session) => <App key={session.user.id} email={session.user.email ?? ''} />}</AuthGate>
  </StrictMode>,
)
