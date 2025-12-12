import React, { ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// GLOBAL ERROR TRAP for White Screens
window.onerror = function(message, source, lineno, colno, error) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; color: red; font-family: sans-serif;">
        <h1>Critical Error</h1>
        <p>${message}</p>
        <pre>${source}:${lineno}:${colno}</pre>
        <p>Try refreshing the page.</p>
      </div>
    `;
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

// Simple Error Boundary Component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("React Error Boundary Caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Algo salió mal.</h2>
          <p className="text-gray-700 mb-4">{this.state.error?.message || "Error desconocido"}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-black text-white px-6 py-2 rounded-full font-bold hover:bg-gray-800"
          >
            Recargar Página
          </button>
        </div>
      );
    }

    return this.props.children; 
  }
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);