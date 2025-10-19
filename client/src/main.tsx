import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Temporarily removed QueryClientProvider, trpc.Provider, and related logic to debug

createRoot(document.getElementById("root")!).render(
  <App />
);

