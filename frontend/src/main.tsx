import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const originalConsoleError = console.error;

console.error = (...args: any[]) => {
  const errorMessage = args[0]?.message || args[0]?.toString() || '';
  
  if (
    errorMessage.includes('ERR_ABORTED') ||
    errorMessage.includes('PDFFetchStreamReader') ||
    errorMessage.includes('net::ERR_ABORTED') ||
    (args[0] && args[0].name === 'AbortError')
  ) {
    return;
  }
  
  originalConsoleError.apply(console, args);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
