import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { AuthProvider } from "./context/AuthContext"
import { RealtimeProvider } from "./context/RealtimeContext"
import { WishlistProvider } from "./context/WishlistContext"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RealtimeProvider>
        <WishlistProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </WishlistProvider>
      </RealtimeProvider>
    </AuthProvider>
  </React.StrictMode>,
)
