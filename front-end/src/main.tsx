import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Clear persisted analysis data on every real page load.
// sessionStorage survives React Router navigation (so back-navigation restore still works)
// but is NOT cleared by a tab-close or server restart — this ensures a clean slate each run.
sessionStorage.removeItem('analysisResults')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
