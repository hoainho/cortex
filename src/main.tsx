import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { exposeStoresToDevTools } from './lib/store-debug'

exposeStoresToDevTools()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
