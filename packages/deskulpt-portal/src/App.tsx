import { useEffect } from "react";
import { Box, Flex, Theme as RadixTheme, Tabs } from "@radix-ui/themes";
import { Toaster } from "sonner";
import {
  LANGUAGES,
  type Language,
  changeLanguage,
  useTranslation,
} from "@deskulpt/utils";
import {
  useInitialRefresh,
  useSettingsStore,
  useUpdateSettingsListener,
  useUpdateWidgetCatalogListener,
} from "./hooks";
import About from "./components/About";
import Widgets from "./components/Widgets";
import Settings from "./components/Settings";
import ThemeToggler from "./components/ThemeToggler";
import LanguageToggler from "./components/LanguageToggler";
import Gallery from "./components/Gallery";
import Logs from "./components/Logs";

const App = () => {
  const { t, i18n } = useTranslation();
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);

  useEffect(() => {
    if (!LANGUAGES.includes(language as Language)) return;
    if (i18n.language !== language) changeLanguage(language as Language);
  }, [language, i18n.language]);

  const tabs = [
    { value: "widgets", label: t("tabs.widgets"), content: <Widgets /> },
    { value: "settings", label: t("tabs.settings"), content: <Settings /> },
    { value: "gallery", label: t("tabs.gallery"), content: <Gallery /> },
    { value: "logs", label: t("tabs.logs"), content: <Logs /> },
    { value: "about", label: t("tabs.about"), content: <About /> },
  ];

  useUpdateSettingsListener();
  useUpdateWidgetCatalogListener();

  useInitialRefresh();

  return (
    <RadixTheme appearance={theme} accentColor="indigo" grayColor="slate">
      <Toaster
        position="bottom-center"
        theme={theme}
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
      <Flex position="absolute" right="3" top="4" gap="2">
        <LanguageToggler />
        <ThemeToggler theme={theme} />
      </Flex>
      <Tabs.Root defaultValue="widgets" asChild>
        <Flex direction="column" gap="2" height="100%" p="2">
          <Tabs.List>
            {tabs.map((tab) => (
              <Tabs.Trigger key={tab.value} value={tab.value}>
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <Box p="1" height="calc(100% - var(--space-8))">
            {tabs.map((tab) => (
              <Tabs.Content key={tab.value} value={tab.value} asChild>
                <Box height="100%">{tab.content}</Box>
              </Tabs.Content>
            ))}
          </Box>
        </Flex>
      </Tabs.Root>
    </RadixTheme>
  );
};

export default App;
