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

// Import all translation files
import { ar_SA } from "./translation/ar_SA";
import { be_BY } from "./translation/be_BY";
import { en_US } from "./translation/en_US";
import { es_ES } from "./translation/es_ES";
import { fr_FR } from "./translation/fr_FR";
import { hy_AM } from "./translation/hy_AM";
import { it_IT } from "./translation/it_IT";
import { ja_JP } from "./translation/ja_JP";
import { nb_NO } from "./translation/nb_NO";
import { pl_PL } from "./translation/pl_PL";
import { pt_PT } from "./translation/pt_PT";
import { ru_RU } from "./translation/ru_RU";
import { tr_TR } from "./translation/tr_TR";
import { uk_UA } from "./translation/uk_UA";
import { zh_CN } from "./translation/zh_CN";

let lang = localStorage.getItem("lang");
if (lang) {
  // Migrate from _ to - from the old format
  lang = lang.replace("_", "-");
  localStorage.setItem("lang", lang);
}

const resources = {
  "en-US": en_US,
  "be-BY": be_BY,
  "es-ES": es_ES,
  "fr-FR": fr_FR,
  "hy-AM": hy_AM,
  "it-IT": it_IT,
  "ja-JP": ja_JP,
  "nb-NO": nb_NO,
  "pl-PL": pl_PL,
  "pt-PT": pt_PT,
  "ru-RU": ru_RU,
  "tr-TR": tr_TR,
  "uk-UA": uk_UA,
  "zh-CN": zh_CN,
  "ar-SA": ar_SA,
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
