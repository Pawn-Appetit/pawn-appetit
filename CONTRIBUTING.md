# Contributing

When it comes to open source, there are different ways you can contribute, all of which are valuable. Here's few guidelines that should help you as you prepare your contribution.

## Table of Contents

- [Initial Steps](#initial-steps)
- [Development](#development)
  - [Commands](#commands)
- [Contributing Translations](#contributing-translations)
  - [How to Contribute Translations](#how-to-contribute-translations)
  - [Adding a New Language](#adding-a-new-language)
  - [Verifying and Finalizing Translation Changes](#verifying-and-finalizing-translation-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Extra Notes](#extra-notes)

## Initial Steps

Before you start working on a contribution, please check the issues page. It's possible someone else is already working on something similar, or perhaps there is a reason that feature isn't implemented. The maintainers will point you in the right direction.

> If you still have questions, please check [the Discord](https://discord.gg/8hk49G8ZbX)

## Development

The following steps will get you setup to contribute changes to this repo:

- Fork the repo
- Clone your forked repository: `git clone git@github.com:{your_username}/pawn-appetit.git`
- Enter the directory: `cd pawn-appetit`
- Create a new branch off the `master` branch: `git checkout -b your-feature-name`
- Install dependencies `pnpm i`
- Open the code in your preferred IDE and contribute your changes

> It is recommended take a look at the [Commands](#commands) and [Extra Notes](#extra-notes) sections before starting.

### Commands

`pnpm i`

- Installs all dependencies

`pnpm dev`

- Starts the app in development mode to see changes in real time

`pnpm test`

- Runs all tests, generating a report

`pnpm format`

- Formats the project according to the project guidelines

`pnpm lint:fix`

- Lints the project according to the project guidelines

`pnpm build`

- Builds the entire app from source. The built app can be found at [src-tauri/target/release](./src-tauri/target/release/)

## Contributing Translations

Help us make Pawn Appétit accessible to everyone by contributing a new translation or improving an existing one! Your contributions are valuable and easy to make.

### How to Contribute Translations

All translation files are located in the `src/locales/` directory.

### Adding a New Language

1. **Create the new file**: Copy an existing translation file, such as `en/common.json`, and rename it using your language's code (e.g., `hy/common.json` for Armenian).
2. **Translate the text**: Open your new file and translate all the text values within it.
3. **Add the language to i18n.init({...})**: Open [index.tsx](src/index.tsx) and the new language to the list of imports and to `i18n.init({...})`.

For example:
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

### Verifying and Finalizing Translation Changes

1. **Run the update script**: After making your changes, run the following command to automatically check for and add any missing translation keys with placeholder values.

   ```sh
   pnpm scripts/update-missing-translations.ts
   ```

2. **Update the README**: Use this script to ensure the `README` is up to date with the latest translation information.

   ```sh
   pnpm scripts/update-readme.ts
   ```

3. **Test your changes**: Start the development server to see your translations in action and make sure everything looks correct.

   ```sh
   pnpm dev
   ```

## Submitting a Pull Request

- Implement your contributions (see the [Development](#development) section for more information)
- Before submitting a PR, first build the app using `pnpm tauri build -b none` and check every feature you've contributed to.
- Format and lint your code using `pnpm format` followed by `pnpm lint:fix`
- If you're contributing translations, follow the steps in [Verifying and Finalizing Translation Changes](#verifying-and-finalizing-translation-changes)
- Go to [the comparison page](https://github.com/Pawn-Appetit/pawn-appetit/compare) and select the branch you just pushed in the `compare:` dropdown
- Submit the new PR. The maintainers will follow up ASAP.

## Extra Notes

The app uses the Rust language for interacting with the filesystem, chess engines and databases, and React with Vite (using TypeScript, of course) for displaying the GUI.

- The Rust code can be found in [src-tauri/src](./src-tauri/src/)
- The React code can be found in [src](./src/)