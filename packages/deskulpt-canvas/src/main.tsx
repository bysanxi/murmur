import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  DeepReadonly,
  enforceOpenNewTab,
  initI18n,
  setupGlobalLoggingHooks,
} from "@deskulpt/utils";
import { DeskulptSettings } from "@deskulpt/bindings";
import App from "./App";
import "@radix-ui/themes/styles.css";
import "./custom.css";

declare global {
  interface Window {
    readonly __DESKULPT_INTERNALS__: {
      readonly apisWrapper: string;
      readonly initialSettings: DeepReadonly<DeskulptSettings.Settings>;
    };
  }
}

enforceOpenNewTab();
setupGlobalLoggingHooks();

await initI18n();
createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
