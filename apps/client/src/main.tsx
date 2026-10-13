import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./style/index.css";
import "./style/util.css";

import App from "./App";

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
