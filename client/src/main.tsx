import { createRoot } from 'react-dom/client'
import './i18n' // Initialize i18n
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <App />
)
