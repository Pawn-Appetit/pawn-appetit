import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import i18n from "i18next";
import { createRoot } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import App from "./App";

import { am_AM } from "./translation/am_AM";
import { be_BY } from "./translation/be_BY";
import { en_US } from "./translation/en_US";
import { es_ES } from "./translation/es_ES";
import { fr_FR } from "./translation/fr_FR";
import { it_IT } from "./translation/it_IT";
import { ja_JP } from "./translation/ja_JP";
import { nb_NO } from "./translation/nb_NO";
import { pl_PL } from "./translation/pl_PL";
import { pt_PT } from "./translation/pt_PT";
import { ru_RU } from "./translation/ru_RU";
import { tr_TR } from "./translation/tr_TR";
import { uk_UA } from "./translation/uk_UA";
import { zh_CN } from "./translation/zh_CN";

i18n.use(initReactI18next).init({
  resources: {
    en: en_US,
    am_AM: am_AM,
    be_BY: be_BY,
    es_ES: es_ES,
    fr_FR: fr_FR,
    it_IT: it_IT,
    ja_JP: ja_JP,
    nb_NO: nb_NO,
    pl_PL: pl_PL,
    pt_PT: pt_PT,
    ru_RU: ru_RU,
    tr_TR: tr_TR,
    uk_UA: uk_UA,
    zh_CN: zh_CN,
  },
  lng: localStorage.getItem("lang") || "en_US",
  fallbackLng: "en",
});

dayjs.extend(customParseFormat);

const container = document.getElementById("app");
const root = createRoot(container!);
root.render(<App />);
