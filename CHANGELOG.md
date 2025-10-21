# Pawn Appétit Changelog

## [Unreleased]

### Added
- New keybindings for copy/paste, engine control, variations, search, panels, training, and navigation
- Internationalization support for keybindings
- English (UK) localization support ([#334](https://github.com/Chessifier/chessifier/pull/334)) - @AWH1122

### Changed
- Updated README and documentation
- Replaced static text with translation keys for better localization support
- Improved loading state in Databases component
- Updated British English localization ([#341](https://github.com/Chessifier/chessifier/pull/341)) - @AWH1122
- Implemented hotkey formatting for improved display and accessibility ([#349](https://github.com/Pawn-Appetit/pawn-appetit/pull/349)) - @AWH1122
- Made chart selectable and removed focus outline ([#348](https://github.com/Pawn-Appetit/pawn-appetit/pull/348)) - @AWH1122

### Fixed
- Hardened download functionality with security improvements
- Optimized memory usage by streaming downloads to disk with 10 GB limit
- Fixed database file paths to use correct db directory (thanks @gm-m)
- Fixed paste FEN submission not updating board state correctly ([#342](https://github.com/Chessifier/chessifier/pull/342)) - @gm-m
- Fixed coordinate display to use lowercase chess notation ([#336](https://github.com/Chessifier/chessifier/pull/336)) - @AWH1122
- Fixed overscrolling behavior ([#338](https://github.com/Chessifier/chessifier/pull/338)) - @AWH1122
- Stopped text from being selectable when unnecessary ([#333](https://github.com/Chessifier/chessifier/pull/333)) - @AWH1122
- Updated keybindings translations for improved accessibility ([#347](https://github.com/Pawn-Appetit/pawn-appetit/pull/347)) - @AWH1122

### Security
- Fixed path traversal and SSRF vulnerabilities in downloads

## [0.7.3]

### Changed
- Optimized BoardGame performance and improved code organization

### Fixed
- Fixed database file path to use db directory instead of puzzles (thanks @gm-m)
- Fixed minor bugs in BoardGame and improved stability

## [0.7.2]

### Fixed
- Fixed Lichess API integration
- Fixed toggle pawn structure view (thanks @gm-m)
- Fixed select and paste pieces in position editor (thanks @gm-m)
- Fixed translation key from common.saveAndClose to common.unsavedChanges.saveAndClose (thanks @gm-m)
- Optimized engine filtering and loading state management
- Updated translation keys for settings and piece characters

## [0.7.1]

### Added
- Enhanced chess position search functionality

### Fixed
- Fixed same time control out of sync (thanks @gm-m)
- Fixed rendered more hooks than during the previous render in InfoPanel (thanks @gm-m)
- Fixed border styling in light theme for cards
- Fixed solution playout stopping on view/new-puzzle actions in puzzles (thanks @gm-m)
- Added event permissions to main capability

## [0.7.0]

### Added
- Option to install puzzle database from a local file
- Version checking and update notification system
- Initial Android project setup (thanks @dotneB)

### Changed
- Refactored app with custom hooks for better error handling, performance, and code organization
- Moved start game button from BoardGame to MoveControls
- Relocated board-related components from shared to feature
- Improved board actions logic
- Consolidated engine management logic into chess module
- Improved DatabasesPage layout structure and readability
- Updated import paths to absolute imports for LessonContent and PracticeContent
- Restructured to a top-level folder organization
- Updated issue templates for clarity and removed unused ones
- Updated repository references from ChessKitchen to Pawn-Appetit

### Fixed
- Fixed game notation under board on desktop (thanks @dotneB)
- Fixed mosaic pane resizing options
- Fixed show arrows option (thanks @gm-m)
- Fixed games map navigation when using keyboard shortcuts
- Fixed untitled games (thanks @gm-m)
- Fixed close button not working in mobile layout for database (thanks @dotneB)
- Fixed document directory path in ImportModal
- Fixed minimum height for empty file list in ImportModal
- Fixed takeBack translation in ImportModal
- Fixed multiple auto-check initiations in version check
- Fixed translation keys for checkboxes, annotations, and annotation info
- Added missing translation keys
- Unified namespaces for annotations

## [0.6.4]

### Added
- Wood Theme with natural wood grain colors
- Blindfold Mode for training and advanced practice (thanks @gm-m)
- Issue templates for bugs, documentation, features, and translations

### Changed
- Reorganized SQL schema and queries for better structure and maintainability
- Refined README layout and updated badge styles
- Refreshed README screenshots

### Fixed
- Fixed UCI message parsing lost during refactor, fixing empty analysis results
- Fixed ActionIcon variant to default for reload button
- Fixed translation key for puzzle file type
- Fixed date input format in parseDate function

## [0.6.3]

### Fixed
- Fixed typo in matchesRoute variable name
- Removed styles from html

## [0.6.2]

### Added
- EventMonitor component for global event tracking

### Fixed
- Fixed bestmove responses correctly reaching the client

## [0.6.1]

### Added
- Splash screen for startup
- Loading state during application initialization

### Fixed
- Fixed translation key for reference database badge

## [0.6.0]

### Added
- Multi-file PGN import with error handling
- Open tabs for each imported file instead of showing analyze buttons
- Set board orientation based on FEN active color during PGN import
- Alert for unavailable engines and improved engine selection UI
- Visual Theme Editor for customizing themes
- Theme Preview component to see changes in real-time
- Predefined built-in themes for quick use
- Separate color scheme management from theme selection
- Environment detection utility functions

### Changed
- Improved clipboard handling for cut, copy, paste, and select all
- Refactored menu creation logic and Chessground component
- Moved translations to locales folder and restructured format
- Updated translation keys for menu actions and reload feature
- Updated lesson and practice card layouts
- Enhanced descriptions and UI clarity
- Replaced hover effect with popover for move details in BoardPopover
- Updated pnpm CLI to v10.16.0 in release and test workflows

### Fixed
- Fixed PGN preview display issues
- Fixed i18n translation keys in menus and reload feature
- Fixed board orientation on PGN import based on active color
- Fixed tabs opening for imported PGN files

## [0.5.1]

### Added
- Cut, copy, paste, and select all operations for board positions
- Select and paste pieces functionality in position editor (thanks @gm-m)

### Changed
- Disabled hideDetached option in BoardSelect and PiecesSelect components

### Fixed
- Fixed castling rights to update correctly after performing a castling move
- Fixed translation key from Fen.Black to Common.Black (thanks @gm-m)

## [0.5.0]

### Added
- Enhanced opponent selection UI with icons for human and engine options
- Arabic translation and initial support for RTL layout
- Setting to change date display between international or locale (thanks @dotneB)
- Reorganized puzzle UI and improved Adaptive mode (thanks @dotneB)
- Progressive puzzle mode with simplified ELO math (thanks @dotneB)
- Loaded min/max rating ranges from puzzle databases with bounds checking (thanks @dotneB)
- Jump to next puzzle option on failure (thanks @dotneB)
- Support for timezone option in CI tests (thanks @dotneB)

### Changed
- Improved game analysis flow and enhanced engine process management
- Enhanced engine state management and error handling
- Optimized database loading with parallel processing
- Transitioned to using i18next formatters (thanks @dotneB)
- Updated translations for German, Spanish, Italian, Turkish, Armenian, Russian, French, Chinese
- Enhanced Dashboard layout and responsiveness

### Fixed
- Fixed Lichess games display to show all games
- Fixed rating updates to include classical ratings for Lichess
- Fixed puzzle atom key naming to be puzzle-specific (thanks @dotneB)
- Fixed puzzle button state when Lichess's database is pre-installed (thanks @dotneB)
- Fixed timing constants in chess.rs for improved performance

## [0.4.0]

### Added
- Enhanced analysis tab creation with detailed game headers and PGN generation
- Graph tab to openings repertoire (thanks @gm-m)
- Recent online games import from Chess.com and Lichess.org (thanks @undorev)
- Unified PGN source input for Import and Create modals (thanks @dotneB)
- Local puzzle database support (thanks @dotneB)
- Deterministic puzzle order generation by rating/id for Lichess (thanks @dotneB)
- Comprehensive theme management system
- Enhanced ThemeSettings with quick theme selection and custom theme management
- Drag-and-drop engine reordering in AnalysisPanel and BoardsPage
- Telemetry toggle in Settings
- Language list translations in Settings (thanks @dotneB)
- Common white/black translations (thanks @dotneB)
- Improved plural handling in i18n with i18next contexts (thanks @dotneB)
- Legacy app data migration functionality

### Changed
- Enhanced package management for engines
- Refactored EngineProcess management and UCI communication
- Optimized engine option setting
- Improved engine selection logic to include go mode
- Refactored ThemeSettings and editor components for consistent state management
- Disabled auto-detection for theme changes
- Improved board orientation handling and preview updates (thanks @dotneB)
- Streamlined OAuth authentication logic and removed unused imports
- Updated application icon on macOS

### Fixed
- Fixed game analysis handling for online games (thanks @undorev)
- Fixed engine options not applying in games against computer (thanks @undorev)
- Fixed immediate result emission and throttling in get_best_moves
- Fixed PGN save import when filename was empty (thanks @gm-m)
- Fixed save PGN to collection (thanks @gm-m)
- Fixed clicking import in dashboard without loaded boards (thanks @dotneB)
- Fixed countPgnGames caching of new files (thanks @dotneB)
- Fixed exercise pieces reset and move tracking
- Fixed move evaluation feedback messaging
- Fixed Armenian display name
- Fixed icon sizes in ThemeSettings (thanks @dotneB)
- Fixed board orientation stability (thanks @dotneB)
- Fixed next lesson title
- Enhanced puzzle difficulty adjustment logic based on completion status

## [0.3.2]

### Added
- Enhanced telemetry settings and improved database setup

### Fixed
- Improved error handling across various modules
- Fixed exercise reset so pieces correctly return to initial positions
- Fixed board orientation to respect player roles (thanks @gm-m)

## [0.3.1]

### Added
- Telemetry toggle in settings

### Fixed
- Fixed next lesson title (thanks @gm-m)

## [0.3.0]

### Added
- Lessons and Practice functionality
- Time control metadata for multiple game types
- Lightweight custom chess engine for move validation and FEN updates
- Dashboard page with the ability to hide on app startup
- Theme switching options to spotlight search
- Code of Conduct, Security Policy, and PR template
- Script to automatically update missing translation keys

### Changed
- Refactored settings management with improved search and tab organization
- Added alert for Chess.com API limitations
- Improved total games count calculation in Accounts
- Improved navigation paths for board-related components
- Revised spotlight, reload, and exit shortcuts for better usability
- Refactored theme switcher and OAuth authentication logic
- Streamlined layout handling in LessonsPage and PracticePage
- Updated Italian translation with missing keys and typo fixes (thanks @gm-m)

### Fixed
- Fixed lesson move errors causing invalid move sets
- Fixed navigation bugs affecting board access and routing
- Fixed decode_move failure handling to prevent crashes
- Fixed external image loading in production by updating CSP and allowlist
- Fixed window behavior on minimize and drag
- Fixed multiple lesson and practice bugs in Learn section
- Fixed window dragging and minimize action
- Fixed add puzzle modal size and puzzle count display (thanks @gm-m)
- Corrected ply count parsing and move parsing logic

## [0.2.0]

### Added
- Support for saving and reloading games
- Extended move format to support glyphs, comments, and variants
- Auto color scheme support in theme settings
- Filter option to game search for easier navigation
- Dockerfile and setup instructions

### Changed
- Improved database state management with a persistent store
- Initialized DatabaseViewStateContext using activeDatabaseViewStore
- Refactored session management and authentication logic
- Simplified confirmation modal usage across app
- Reorganized folder and file structure for better modularity
- Renamed binary casing in Cargo.toml and tauri.conf.json for consistency

### Fixed
- Fixed import modal functionality and hotkey behavior
- Fixed ImportModal close behavior and added error handling
- Added fallback to default document directory when XDG is not configured on Linux

## [0.1.0]

### Added
- Spotlight Search for quick access
- Personal Card Ratings Panel with rating components
- Armenian translation
- Russian translation completed
- Directory and file creation checks in main logic
- Improved account card UI and functionality
- Edit account names in Accounts page
- Restructured stats in a grid layout
- Improved progress tracking during game downloads
- Restructured board and settings pages for better usability
- readme-updater script for translation progress

### Changed
- Renamed keybinds to keybindings across the codebase
- Replaced Ctrl with Mod for cross-platform support
- Improved GameNotation component structure and variation handling
- Refactored Chess.com stats retrieval and TCN decoding
- Handled 404 errors gracefully in API responses
- Refactored report creation logic and UI handling
- Adjusted BoardSelect component behavior
- Improved README formatting

### Fixed
- Fixed timezone ISO bug in ratings panel
- Removed incorrect ELO averaging across rating systems
- Fixed infinite loop in promoteToMainline
- Prevented event spam during frequent updates
- Fixed SettingsPage layout
- Fixed PGN import and report progress bar
- Fixed crash on multiple View Solution in puzzles
- Improved puzzle caching and error handling
- Fixed hotkeys and tab navigation on board
- Fixed percentage calculation in AccountCard for zero games
- Fixed remembered report generation form state
