import React, { useEffect, useState } from "react";
import logo from "./logo.svg";
import "./App.css";
import { config, getPublicConfigSnapshot, logger } from "./config";

// PUBLIC_INTERFACE
function App() {
  const [theme, setTheme] = useState("light");

  // Initialize runtime config once (module initialization happens on import).
  // Keep logging non-noisy: a single info log outside production.
  useEffect(() => {
    if (config.nodeEnv !== "production") {
      logger.info("[config]", getPublicConfigSnapshot());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect to apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  // Note: routing/layout will be introduced in the next steps; for now we keep a single root.
  return (
    <div className="App">
      <header className="App-header">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>

        <img src={logo} className="App-logo" alt="logo" />

        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>

        <p>
          Current theme: <strong>{theme}</strong>
        </p>

        <p style={{ fontSize: "0.9em", opacity: 0.8 }}>
          API: <code>{config.apiBase}</code>
        </p>

        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
