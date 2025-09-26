# Pawn Appétit

## v0.7.0

### ✨ Features

* **Puzzles**

  * Added option to **install puzzle database from a local file**

* **Version Management**

  * Added **version checking and update notification system**

* **Android**

  * Initial **Android project setup** – thanks [dotneB](https://github.com/dotneB) 🎉

### 🛠 Improvements & Refactors

* **App & Hooks**

  * Refactored app with **custom hooks** for better error handling, performance, and code organization

* **Board**

  * Moved **start game button** from `BoardGame` to `MoveControls`
  * Relocated **board-related components** from `shared` to `feature`
  * Improved **board actions logic**
  * Consolidated **engine management logic** into `chess` module

* **Databases**

  * Improved **`DatabasesPage` layout** structure and readability

* **Components**

  * Updated import paths to **absolute imports** for `LessonContent` and `PracticeContent`
  * Restructured to a **top-level folder organization**

* **Issue Templates**

  * Updated templates for **clarity** and removed unused ones

### 🐛 Fixes

* **Board**

  * Disabled **game notation under board** on desktop – thanks [dotneB](https://github.com/dotneB) 🎉
  * Constrained **mosaic pane resizing options**
  * Restored **show arrows option** – thanks [gm-m](https://github.com/gm-m) 🎉
  * Updated **games map navigation** when using keyboard shortcuts
  * Fixed **untitled games** – thanks [gm-m](https://github.com/gm-m) 🎉

* **Database**

  * Fixed **close button not working** in mobile layout – thanks [dotneB](https://github.com/dotneB) 🎉

* **ImportModal**

  * Corrected **document directory path**
  * Set **minimum height** for empty file list
  * Updated **`takeBack` translation**

* **Version Check**

  * Prevented **multiple auto-check initiations**

* **Internationalization (i18n)**

  * Updated **translation keys** for checkboxes, annotations, and annotation info
  * Added **missing translation keys**
  * Unified **namespaces for annotations**

### 🧹 Chores

* Updated repository references from **ChessKitchen → Pawn-Appetit**
* Updated dependencies

## v0.6.4

### ✨ Features

* **Theme**

  * Added **Wood Theme** with natural wood grain colors

* **Gameplay**

  * Introduced **Blindfold Mode** for training and advanced practice - thanks [gm-m](https://github.com/gm-m) 🎉

### 🛠 Improvements & Refactors

* **Database**

  * Reorganized **SQL schema and queries** for better structure and maintainability

### 🐛 Fixes

* **Engines**

  * Restored **UCI message parsing** lost during refactor, fixing empty analysis results

* **UI**

  * Updated **ActionIcon variant** to default for reload button
  * Corrected **translation key** for puzzle file type

* **Utilities**

  * Normalized **date input format** in `parseDate` function

### 📖 Documentation

* Refined **README layout** and updated badge styles
* Refreshed **README screenshots** 📝

### 🧹 Chores

* Updated **project dependencies**
* Added **issue templates** for bugs, documentation, features, and translations 🔧

## v0.6.3

### 🐛 Fixes

  * correct typo in matchesRoute variable name
  * remove styles from html

## v0.6.2

### ✨ Features

* **Logging**
  * Added **EventMonitor component** for global event tracking

### 🐛 Fixes

* **Engine**
  * Ensured **bestmove responses** correctly reach the client

## v0.6.1

### ✨ Features

* **Application Initialization**
  * Implemented **splash screen** for startup
  * Added **loading state** during application initialization

### 🐛 Fixes

* **Databases**
  * Corrected **translation key** for reference database badge

### 🧹 Chores

* Updated **project dependencies**

## v0.6.0

### ✨ Features

* **PGN & Board**

  * Added **multi-file PGN import** with error handling
  * Open **tabs for each imported file** instead of showing analyze buttons
  * Set **board orientation based on FEN active color** during PGN import

* **Chess Engines**

  * Added **alert for unavailable engines** and improved engine selection UI
  * Refactored engine module into **focused components** for better maintainability

* **Theme & Visual Editor**

  * Introduced **Visual Theme Editor** for customizing themes
  * Added **Theme Preview** component to see changes in real-time
  * Included **predefined built-in themes** for quick use
  * Separated **color scheme management** from theme selection

* **Environment Utilities**

  * Implemented **environment detection utility functions**

### 🛠 Improvements & Refactors

* **Clipboard & Menu**

  * Improved **clipboard handling** (cut, copy, paste, select all)
  * Refactored **menu creation logic** and **Chessground component**

* **Internationalization (i18n)**

  * Moved **translations to locales folder** and restructured format
  * Updated **translation keys** for menu actions and reload feature

* **Lessons & Practice**

  * Updated **lesson and practice card layouts**
  * Enhanced **descriptions and UI clarity**

* **Codebase**

  * Updated **Rust and npm dependencies**
  * Linted code and fixed translation keys

* **Board & Analysis**

  * Replaced **hover effect** with **popover** for move details in `BoardPopover`

### 🐛 Fixes

* Fixed **PGN preview display issues**
* Fixed **i18n translation keys** in menus and reload feature
* Fixed **board orientation** on PGN import based on active color
* Fixed **tabs opening** for imported PGN files

### 🧹 Chores

* Updated **pnpm CLI to v10.16.0** in release and test workflows
* Updated project dependencies

## v0.5.1

### ✨ Features

* Implemented **cut, copy, paste, and select all** operations for board positions
* Added **select and paste pieces** functionality in position editor - thanks [gm-m](https://github.com/gm-m) 🎉

### 🐛 Fixes

* Fixed **castling rights** to update correctly after performing a castling move
* Disabled `hideDetached` option in **BoardSelect** and **PiecesSelect** components
* Replaced `Fen.Black` translation key with `Common.Black` - thanks [gm-m](https://github.com/gm-m) 🎉

### 🛠 Improvements & Refactors

* Updated **dependencies** to latest versions

## v0.5.0

### ✨ Features

* **Gameplay & Opponent Selection**

  * Enhanced **opponent selection UI** with icons for human and engine options

* **Internationalization (i18n)**

  * Added **Arabic translation** and initial support for **RTL layout**
  * Added a **setting to change date display** (international or locale) - thanks [dotneB](https://github.com/dotneB) 🎉

* **Puzzles** - thanks [dotneB](https://github.com/dotneB) 🎉

  * Reorganized **puzzle UI** and improved **Adaptive mode**
  * Integrated **progressive puzzle mode** with simplified ELO math
  * Loaded **min/max rating ranges** from puzzle databases with bounds checking
  * Added **jump to next puzzle** option on failure

### 🛠 Improvements & Refactors

* **Engine & Analysis**

  * Improved **game analysis flow** and enhanced **engine process management**
  * Enhanced **engine state management** and error handling
  * Optimized **database loading** with **parallel processing** (removed `DashMap`)

* **Internationalization**

  * Transitioned to using **i18next formatters** - thanks [dotneB](https://github.com/dotneB) 🎉
  * Updated translations for:

    * **German, Spanish, Italian, Turkish, Armenian, Russian, French, Chinese**

* **UI**

  * Enhanced **Dashboard layout** and responsiveness

### 🐛 Fixes

* **Gameplay**

  * Fixed **Lichess games display** to show all games
  * Fixed **rating updates** to include **classical ratings** for Lichess

* **Puzzles** - thanks [dotneB](https://github.com/dotneB) 🎉

  * Fixed **puzzle atom key** naming to be puzzle-specific
  * Fixed **puzzle button state** when Lichess’s database is pre-installed

* **Performance**

  * Adjusted **timing constants** in `chess.rs` for improved performance

### 🧹 Chores

* Updated **dependencies**

### ✅ Tests

* Added support for **timezone option** in CI tests - thanks [dotneB](https://github.com/dotneB) 🎉

## v0.4.0

### ✨ Features

* **Engines**

  * Enhanced **package management**

* **Analysis**

  * Enhanced **analysis tab creation** with detailed game headers and **PGN generation**
  * Added **Graph tab** to openings repertoire - thanks [gm-m](https://github.com/gm-m) 🎉
  * Added **recent online games import** from **Chess.com** and **Lichess.org** - thanks [undorev](https://github.com/undorev) 🎉

* **Puzzles**

  * Unified **PGN source input** for Import and Create modals - thanks [dotneB](https://github.com/dotneB) 🎉
  * Added **local puzzle database (first pass)** - thanks [dotneB](https://github.com/dotneB) 🎉
  * Generated puzzles in **deterministic order** (by rating/id for Lichess, index for files) - thanks [dotneB](https://github.com/dotneB) 🎉
  * Translated most **puzzle-related labels** - thanks [dotneB](https://github.com/dotneB) 🎉

* **Theme & UI**

  * Introduced **comprehensive theme management system**
  * Enhanced **ThemeSettings** with quick theme selection and custom theme management
  * Improved **ThemeSelector** with stable orientation and better state management
  * Added **drag-and-drop engine reordering** in AnalysisPanel and BoardsPage
  * Updated **application icon** on macOS
  * Improved **GameInfo** to support custom puzzle UI - thanks [dotneB](https://github.com/dotneB) 🎉

* **Telemetry**

  * Added **telemetry toggle** in Settings
  * Enhanced **telemetry settings** and database setup

* **Settings & Translations**

  * Translated **language list in Settings** - thanks [dotneB](https://github.com/dotneB) 🎉
  * Added **common white/black translations** - thanks [dotneB](https://github.com/dotneB) 🎉
  * Improved **plural handling** in i18n with i18next contexts - thanks [dotneB](https://github.com/dotneB) 🎉
  * Added more **French translations** - thanks [dotneB](https://github.com/dotneB) 🎉

* **Data & Migration**

  * Added **legacy app data migration functionality**

### 🛠 Improvements & Refactors

* **Engine**

  * Refactored **EngineProcess management and UCI communication**

    * Better process spawning, I/O handling, option management, and error resilience
    * Enhanced MultiPV handling, novelty detection, sacrifice evaluation, and logging
  * Optimized **engine option setting**
  * Improved **engine selection logic** to include *go mode*

* **Theme & UI**

  * Refactored **ThemeSettings** and editor components for consistent state management
  * Disabled **auto-detection** for theme changes
  * Improved **board orientation** handling and preview updates - thanks [dotneB](https://github.com/dotneB) 🎉
  * Fixed paper rendering in **accounts page**

* **Codebase**

  * Improved **type safety** across modules
  * Streamlined **OAuth authentication logic** and removed unused imports

### 🐛 Fixes

* **Puzzles**

  * Enhanced puzzle **difficulty adjustment logic** based on completion status

* **Gameplay & Analysis**

  * Fixed **game analysis** handling for online games - thanks [undorev](https://github.com/undorev) 🎉
  * Fixed **engine options** not applying in games against computer - thanks [undorev](https://github.com/undorev) 🎉
  * Fixed **immediate result emission** and throttling in `get_best_moves`
  * Fixed **PGN save** import when filename was empty - thanks [gm-m](https://github.com/gm-m) 🎉
  * Fixed **save PGN to collection** - thanks [gm-m](https://github.com/gm-m) 🎉
  * Fixed **clicking import in dashboard** without loaded boards - thanks [dotneB](https://github.com/dotneB) 🎉
  * Fixed **countPgnGames caching** of new files - thanks [dotneB](https://github.com/dotneB) 🎉
  * Fixed **exercise pieces reset** and move tracking
  * Fixed **move evaluation feedback** messaging

* **UI**

  * Corrected **Armenian display name**
  * Fixed **icon sizes** in ThemeSettings by replacing `rem()` with numeric values - thanks [dotneB](https://github.com/dotneB) 🎉
  * Stabilized **board orientation** - thanks [dotneB](https://github.com/dotneB) 🎉
  * Fixed **next lesson title**

### 📚 Documentation

* Updated **README**

### 🧹 Chores

* Updated **dependencies**
* Updated **translations**
* Updated **pnpm CLI to v10** in workflows
* Added `packageManager` field to `package.json`
* Updated **biome configs and ignores** - thanks [dotneB](https://github.com/dotneB) 🎉

## v0.3.2

### ✨ Features

* **Enhanced telemetry settings** and improved database setup

### 🐛 Fixes

* **Improved error handling** across various modules
* **Exercise reset**: pieces now correctly return to initial positions
* **Board orientation** now respects player roles - thanks [gm-m](https://github.com/gm-m) 🎉

## v0.3.1

### ✨ Features

* **Telemetry toggle in settings**

### 🐛 Fixes

* Fixed **next lesson title** - thanks [gm-m](https://github.com/gm-m) 🎉

## v0.3.0

### ✨ Features

* **Lessons & Practice**

* **Gameplay Enhancements**

  * Added **time control metadata** for multiple game types
  * Integrated a **lightweight custom chess engine** for move validation and FEN updates

* **Dashboard**

  * Added **dashboard page** with the ability to **hide on app startup**

* **Theme & UI**

  * Added **theme switching options** to spotlight search

* **UI & Navigation**

  * Improved search and sorting functionality in **Databases**, **Engines**, and **Accounts** pages

### 🛠 Improvements & Refactors

* **Settings**

  * Refactored settings management with improved search and tab organization

* **Accounts**

  * Added **alert for Chess.com API limitations**
  * Improved total games count calculation

* **Game Import**

  * Corrected **ply count parsing** and move parsing logic

* **UI Interaction**

  * Improved navigation paths for board-related components

* **Shortcuts**

  * Revised **spotlight, reload, and exit** shortcuts for better usability

* **Codebase**

  * Refactored theme switcher, OAuth authentication logic, and removed unused imports
  * Streamlined layout handling in LessonsPage and PracticePage

### 🐛 Fixes

* Fixed **lesson move errors** causing invalid move sets
* Resolved **navigation bugs** affecting board access and routing
* Fixed `decode_move` failure handling to prevent crashes
* Fixed **external image loading in production** by updating CSP and allowlist
* Fixed **window behavior** on minimize and drag
* Fixed multiple **lesson and practice bugs** in Learn section
* Fixed **window dragging and minimize action**
* Fixed add puzzle modal **size and puzzle count display** - thanks [gm-m](https://github.com/gm-m) 🎉

### 📚 Documentation

* Added `CONTRIBUTING_TRANSLATIONS.md` with translation update guidelines
* Added **Code of Conduct**, **Security Policy**, and **PR template**
* Updated `README` with a new **screenshots section**
* Updated **Italian translation** with missing keys and typo fixes - thanks [gm-m](https://github.com/gm-m) 🎉

### 🧹 Chores

* Added script to automatically update missing translation keys
* Updated workflow files for consistency and clarity
* Updated screenshots
* Updated dependencies
* Updated `vampirc-uci` dependency source to Pawn Appétit repository

## v0.2.0

### ✨ Features
- **Game Management**
  - Added support for **saving and reloading games**
  - Extended move format to support **glyphs, comments, and variants** (fully backward-compatible)
- **UI Enhancements**
  - Added **auto color scheme** support in theme settings
  - Added **filter option** to game search for easier navigation

### 🛠 Improvements & Refactors
- **Database**
  - Improved state management with a **persistent store**
  - Initialized `DatabaseViewStateContext` using `activeDatabaseViewStore`
- **Session & Auth**
  - Refactored session management and authentication logic for cleaner flow
- **Modals**
  - Simplified **confirmation modal** usage across app
  - Fixed `ImportModal` close behavior and added error handling
- **Codebase**
  - Reorganized folder and file structure for better modularity and maintainability
  - Renamed binary casing in `Cargo.toml` and `tauri.conf.json` for consistency

### 🐛 Fixes
- **Importing**
  - Fixed import modal functionality and hotkey behavior
- **Linux Support**
  - Added fallback to default document directory when **XDG is not configured**

### 📚 Documentation
- Added **Dockerfile** and setup instructions
- Updated `README` with supported platforms
- Included build instructions and updated formatting

### 🧹 Chores
- Added missing translations
- Updated project dependencies
- Updated app logo

## v0.1.0

### ✨ Features
- **Spotlight Search** for quick access
- **Personal Card Ratings Panel**
  - Added personal rating components
  - Improved overview and openings panels with filters
  - Fixed timezone ISO bug
  - Removed incorrect ELO averaging across rating systems
- **Translation Support**
  - Added **Armenian**
  - Completed **Russian**
- **File System**
  - Added directory and file creation checks in main logic
- **Accounts Page**
  - Improved account card UI and functionality
  - Edit account names
  - Restructured stats in a grid layout
  - Updated styling and layout
  - Improved progress tracking during game downloads
- **Settings Pages**
  - Restructured board and settings pages for better usability

### 🛠 Improvements & Refactors
- **Keybindings**
  - Renamed `keybinds` → `keybindings` across the codebase
  - Replaced `Ctrl` with `Mod` for cross-platform support
- **GameNotation**
  - Improved component structure and variation handling
- **Chess.com Integration**
  - Refactored stats retrieval and TCN decoding
  - Handled 404 errors gracefully in API responses
- **Report Creation**
  - Refactored logic and UI handling
- **Settings**
  - Adjusted BoardSelect component behavior
- **General**
  - Updated dependencies
  - Linted code and fixed build issues

### 🐛 Fixes
- **Performance**
  - Prevented event spam during frequent updates
  - Fixed infinite loop in `promoteToMainline`
- **UI Fixes**
  - Improved `SettingsPage` layout
  - Fixed PGN import and report progress bar
  - Fixed crash on multiple *View Solution* in puzzles
  - Improved puzzle caching and error handling
  - Fixed hotkeys and tab navigation on board
  - Fixed percentage calculation in `AccountCard` for zero games
  - Remembered report generation form state

### 📚 Documentation
- Improved `README` formatting
- Added build instructions
- Added `readme-updater` script for translation progress
