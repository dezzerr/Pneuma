import React from "react";
import ReactDOM from "react-dom/client";
import OperatorApp from "./operator/OperatorApp";
import { ErrorBoundary } from "./shared/components/ErrorBoundary";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <OperatorApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
