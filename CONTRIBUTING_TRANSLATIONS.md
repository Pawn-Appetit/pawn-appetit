## 🌎 Contributing Translations

Help us make Pawn Appétit accessible to everyone by contributing a new translation or improving an existing one\! Your contributions are valuable and easy to make.

### How to Contribute

All translation files are located in the `src/locales/` directory.

#### To Add a New Language

1.  **Create the new file**: Copy an existing translation file, such as `en/common.json`, and rename it using your language's code (e.g., `hy/common.json` for Armenian).
2.  **Translate the text**: Open your new file and translate all the text values within it.
3.  **Add the language to i18n.init({...})**: Open [index.tsx](src/index.tsx) and the new language to the list of imports and to `i18n.init({...})`.

For example:
<!-- end list -->

```diff
import fr from "./locales/fr";
+import hy from "./locales/hy";
import it from "./locales/it";

i18n.use(initReactI18next).init({
  resources: {
    ...,
    fr-FR: fr,
 +  hy-AM: hy,
    it-IT: it,
    ...
  }
```

### Verifying and Finalizing Your Changes

1.  **Run the update script**: After making your changes, run the following command to automatically check for and add any missing translation keys with placeholder values.

    ```sh
    pnpm scripts/update-missing-translations.ts
    ```

2.  **Update the README**: Use this script to ensure the `README` is up to date with the latest translation information.

    ```sh
    pnpm scripts/update-readme.ts
    ```

3.  **Test your changes**: Start the development server to see your translations in action and make sure everything looks correct.

    ```sh
    pnpm dev
    ```

4.  **Submit a Pull Request**: Once you've confirmed your changes are working, commit your updates, push your branch, and open a new pull request.