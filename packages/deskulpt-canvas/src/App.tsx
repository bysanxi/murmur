import { useEffect } from "react";
import { correctPageZoomOnce, listenMonitorScale } from "./monitorFrame";
import WidgetContainer from "./components/WidgetContainer";
import { Toaster } from "sonner";
import { Theme as RadixTheme } from "@radix-ui/themes";
import { useShallow } from "zustand/shallow";
import {
  LANGUAGES,
  type Language,
  changeLanguage,
  logger,
} from "@deskulpt/utils";
import {
  useInitialRefresh,
  useRenderWidgetListener,
  useSettingsStore,
  useShowToastListener,
  useUpdateSettingsListener,
  useUpdateWidgetCatalogListener,
  useWidgetsStore,
} from "./hooks";

const App = () => {
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);

  useEffect(() => {
    if (!LANGUAGES.includes(language as Language)) return;
    changeLanguage(language as Language);
  }, [language]);

  useEffect(() => {
    let unlisten = () => {};
    let disposed = false;
    void correctPageZoomOnce().catch(logger.error);
    void listenMonitorScale(() => {
      void correctPageZoomOnce().catch(logger.error);
    })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(logger.error);
    return () => {
      disposed = true;
      unlisten();
    };
  }, []);
  const ids = useWidgetsStore(
    useShallow((state) =>
      Object.entries(state)
        .filter(([_, { settings }]) => settings !== undefined)
        .map(([id]) => id),
    ),
  );

  useRenderWidgetListener();
  useShowToastListener();
  useUpdateSettingsListener();
  useUpdateWidgetCatalogListener();

  useInitialRefresh();

  return (
    <RadixTheme
      appearance={theme}
      accentColor="indigo"
      grayColor="slate"
      hasBackground={false}
    >
      <Toaster
        position="bottom-right"
        gap={6}
        toastOptions={{
          style: {
            color: "var(--gray-12)",
            borderColor: "var(--gray-6)",
            backgroundColor: "var(--gray-2)",
            padding: "var(--space-2) var(--space-4)",
          },
        }}
      />
      {ids.map((id) => (
        <WidgetContainer key={id} id={id} />
      ))}
    </RadixTheme>
  );
};

export default App;
