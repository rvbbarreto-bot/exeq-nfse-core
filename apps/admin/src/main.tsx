import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@exeq/ui-tokens";
import { App } from "./App.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
