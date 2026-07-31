"use client";

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import gu from "./locales/gu.json";
import mr from "./locales/mr.json";
import ur from "./locales/ur.json";
import es from "./locales/es.json";
import zh from "./locales/zh.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", native: "English", flag: "🇬🇧", dir: "ltr" },
  { code: "hi", label: "Hindi", native: "हिन्दी", flag: "🇮🇳", dir: "ltr" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳", dir: "ltr" },
  { code: "mr", label: "Marathi", native: "मराठी", flag: "🇮🇳", dir: "ltr" },
  { code: "ur", label: "Urdu", native: "اردو", flag: "🇵🇰", dir: "rtl" },
  { code: "es", label: "Spanish", native: "Español", flag: "🇪🇸", dir: "ltr" },
  { code: "zh", label: "Chinese", native: "中文", flag: "🇨🇳", dir: "ltr" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        hi: { translation: hi },
        gu: { translation: gu },
        mr: { translation: mr },
        ur: { translation: ur },
        es: { translation: es },
        zh: { translation: zh },
      },
      fallbackLng: "en",
      supportedLngs: ["en", "hi", "gu", "mr", "ur", "es", "zh"],
      nonExplicitSupportedLngs: true,
      load: "currentOnly",
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: "i18nextLng",
        caches: ["localStorage"],
      },
      interpolation: {
        escapeValue: false, // React already escapes
      },
      react: {
        useSuspense: false,
      },
    });
}

// Update document direction when language changes
i18n.on("languageChanged", (lng: string) => {
  if (typeof document !== "undefined") {
    const lang = SUPPORTED_LANGUAGES.find((l) => l.code === lng);
    document.documentElement.lang = lng;
    document.documentElement.dir = lang?.dir ?? "ltr";
  }
});

// Apply initial direction on the client
if (typeof document !== "undefined") {
  const initial = i18n.language || "en";
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === initial);
  document.documentElement.lang = initial;
  document.documentElement.dir = lang?.dir ?? "ltr";
}

export default i18n;
