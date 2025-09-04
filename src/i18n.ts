import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  createBytesFormatter,
  createBytesLongFormatter,
  createDateFormatter,
  createDatetimeFormatter,
  createDurationFormatter,
  createDurationLongFormatter,
  createMoveNotationFormatter,
  createNodesFormatter,
  createNodesLongFormatter,
  createScoreFormatter,
} from "./utils/format";

const isDev = import.meta.env.DEV;

import ar from "./locales/ar";
import be from "./locales/be";
import de from "./locales/de";
import en from "./locales/en";
import es from "./locales/es";
import fr from "./locales/fr";
import hy from "./locales/hy";
import it from "./locales/it";
import ja from "./locales/ja";
import nb from "./locales/nb";
import pl from "./locales/pl";
import pt from "./locales/pt";
import ru from "./locales/ru";
import tr from "./locales/tr";
import uk from "./locales/uk";
import zh from "./locales/zh";

let lang = localStorage.getItem("lang");
if (lang) {
  // Migrate from _ to - from the old format
  lang = lang.replace("_", "-");
  localStorage.setItem("lang", lang);
}

const resources = {
  "en-US": en,
  "de-DE": de,
  "be-BY": be,
  "es-ES": es,
  "fr-FR": fr,
  "hy-AM": hy,
  "it-IT": it,
  "ja-JP": ja,
  "nb-NO": nb,
  "pl-PL": pl,
  "pt-PT": pt,
  "ru-RU": ru,
  "tr-TR": tr,
  "uk-UA": uk,
  "zh-CN": zh,
  "ar-SA": ar,
};

i18n.use(initReactI18next).init({
  resources,

  // Language configuration
  lng: lang || "en-US",
  fallbackLng: "en-US",

  // Namespace configuration
  ns: ["language", "translation"],
  defaultNS: "translation",
  fallbackNS: "translation",

  // Debug configuration (set to true for development)
  debug: isDev,

  // Load configuration
  load: "currentOnly",
});

// Add custom formatters
i18n.services.formatter?.add("bytes", createBytesFormatter(i18n));
i18n.services.formatter?.add("bytesLong", createBytesLongFormatter(i18n));
i18n.services.formatter?.add("nodes", createNodesFormatter(i18n));
i18n.services.formatter?.add("nodesLong", createNodesLongFormatter(i18n));
i18n.services.formatter?.add("duration", createDurationFormatter(i18n));
i18n.services.formatter?.add("durationLong", createDurationLongFormatter(i18n));
i18n.services.formatter?.add("score", createScoreFormatter(i18n));
i18n.services.formatter?.add("dateformat", createDateFormatter(i18n, localStorage));
i18n.services.formatter?.add("datetimeformat", createDatetimeFormatter(i18n, localStorage));
i18n.services.formatter?.add("moveNotation", createMoveNotationFormatter(i18n, localStorage));

export default i18n;
