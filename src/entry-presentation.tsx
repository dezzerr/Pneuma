import React from "react";
import ReactDOM from "react-dom/client";
import PresentationApp from "./presentation/PresentationApp";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PresentationApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
