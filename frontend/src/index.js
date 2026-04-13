import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

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
