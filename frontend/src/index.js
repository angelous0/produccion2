import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { installUtcFix } from "@/lib/axiosUtcFix";

// Trata las fechas naive del backend como UTC (agrega 'Z') para que
// toLocaleString con timeZone: 'America/Lima' muestre la hora correcta.
installUtcFix();

// Suppress benign ResizeObserver error (browser limitation, not a real bug)
const ro = window.ResizeObserver;
window.ResizeObserver = class extends ro {
  constructor(cb) {
    super((entries, observer) => {
      requestAnimationFrame(() => cb(entries, observer));
    });
  }
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
