import { type i18n as I18nInstance, createInstance } from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import en from "./locales/en";
import zhCN from "./locales/zh-CN";

export const LANGUAGES = ["zh-CN", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = "deskulpt.language";
const instance: I18nInstance = createInstance();

function readSettingsLanguage(): Language | undefined {
  const internals = (
    window as Window & {
      __DESKULPT_INTERNALS__?: { initialSettings?: { language?: string } };
    }
  ).__DESKULPT_INTERNALS__;
  const language = internals?.initialSettings?.language;
  if (LANGUAGES.includes(language as Language)) {
    return language as Language;
  }
  return undefined;
}

function detectLanguage(): Language {
  const fromSettings = readSettingsLanguage();
  if (fromSettings) return fromSettings;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (LANGUAGES.includes(saved as Language)) {
    return saved as Language;
  }
  return "zh-CN";
}

function changeLanguage(language: Language) {
  localStorage.setItem(STORAGE_KEY, language);
  void instance.changeLanguage(language);
  window.dispatchEvent(
    new CustomEvent("deskulpt:language-changed", { detail: language }),
  );
}

async function initI18n(): Promise<I18nInstance> {
  await instance.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      "zh-CN": { translation: zhCN },
    },
    lng: detectLanguage(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  window.addEventListener("deskulpt:language-changed", (event) => {
    const language = (event as CustomEvent<Language>).detail;
    if (language !== instance.language) {
      void instance.changeLanguage(language);
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      const language = event.newValue as Language;
      if (LANGUAGES.includes(language) && language !== instance.language) {
        void instance.changeLanguage(language);
      }
    }
  });
  return instance;
}

export { instance as i18n, changeLanguage, initI18n, useTranslation };
