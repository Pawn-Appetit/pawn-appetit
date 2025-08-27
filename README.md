<br />
<div align="center">
<a href="https://github.com/ChessKitchen/pawn-appetit">
    <img width="115" height="115" src="https://github.com/ChessKitchen/pawn-appetit/raw/main/src-tauri/icons/icon.png" alt="Logo">
</a>

<h3 align="center">Pawn Appétit</h3>

<p align="center">
    The Ultimate Chess Toolkit
    <br />
    <br />
    <a href="https://pawnappetit.com/">Website</a>
    ·
    <a href="https://discord.gg/8hk49G8ZbX">Discord Server</a>
    ·
    <a href="https://github.com/ChessKitchen/pawn-appetit/releases">Releases</a>
</p>

<p align="center">
    <a href="https://github.com/ChessKitchen/pawn-appetit/actions/workflows/test.yml">
        <img src="https://github.com/ChessKitchen/pawn-appetit/workflows/Test/badge.svg" alt="Test Status">
    </a>
    <a href="https://github.com/ChessKitchen/pawn-appetit/releases">
        <img src="https://img.shields.io/github/v/release/ChessKitchen/pawn-appetit?include_prereleases" alt="Release">
    </a>
    <a href="https://github.com/ChessKitchen/pawn-appetit/blob/main/LICENSE">
        <img src="https://img.shields.io/github/license/ChessKitchen/pawn-appetit" alt="License">
    </a>
    <a href="https://github.com/ChessKitchen/pawn-appetit/stargazers">
        <img src="https://img.shields.io/github/stars/ChessKitchen/pawn-appetit?style=social" alt="GitHub stars">
    </a>
    <a href="https://discord.gg/8hk49G8ZbX">
        <img src="https://img.shields.io/discord/1234567890?logo=discord&logoColor=white&label=Discord" alt="Discord">
    </a>
</p>
</div>

🏆 **The Ultimate Chess Toolkit** - A modern, cross-platform chess GUI that combines powerful analysis, repertoire training, and engine management in one beautiful application.

**Perfect for:** Chess coaches, competitive players, and enthusiasts who want professional-grade tools without the complexity.

**Why Pawn Appétit?**
- 🚀 **Lightning Fast** - Built with Tauri/Rust for native performance
- 🎯 **User-Focused** - Intuitive design that gets out of your way
- 🔧 **Highly Customizable** - Themes, layouts, and workflows tailored to you
- 🌍 **Cross-Platform** - Windows, macOS, and Linux support
- 🔒 **Privacy First** - Your data stays on your device (optional telemetry)

## ✨ Features That Matter

### 🎯 **Core Features**
| Feature | Description | Status |
|---------|-------------|--------|
| 🔍 **Smart Analysis** | Import from lichess/chess.com, analyze with any UCI engine | ✅ |
| 🧠 **Repertoire Training** | Spaced repetition system for opening mastery | ✅ |
| 📊 **Position Search** | Find patterns across your entire game database | ✅ |
| ⚡ **Engine/Database Management** | Easy engine/database installation and configuration | ✅ |
| 🎨 **Customizable UI** | Light/dark themes with custom theme creation | ✅ |

### 🚀 **What Makes Us Different**
- **No Subscription Required** - Open source and completely free
- **Privacy First** - Your data stays on your device (optional telemetry)
- **Modern UI** - Built with latest web technologies for smooth experience
- **Active Development** - Regular updates and new features
- **Community Driven** - Your feedback shapes the roadmap

## 📈 Performance & Stats

<div>

| Metric | Value |
|--------|-------|
| **App Size** | ~50MB (lightweight) |
| **Startup Time** | <2 seconds |
| **Supported Formats** | PGN, FEN, UCI engines |
| **Languages** | 14+ (70%+ translated) |
| **Platforms** | Windows, macOS, Linux |

</div>

## 📸 Screenshots

Here are some screenshots of Pawn Appétit in action:

<div align="center">
  <img src="./screenshots/dashboard-page.png" alt="Dashboard Page" width="600" />
  <br />
  <em>Dashboard Page</em>
  <br /><br />
  <img src="./screenshots/game-page.png" alt="Game Page" width="300" />
  <img src="./screenshots/analyze-page.png" alt="Analyze Page" width="300" />
  <br />
  <em>Game & Analyze Pages</em>
  <br /><br />
  <img src="./screenshots/learn-page.png" alt="Learn Page" width="300" />
  <img src="./screenshots/practice-page.png" alt="Practice Page" width="300" />
  <br />
  <em>Learn & Practice Pages</em>
  <br /><br />
  <img src="./screenshots/keybindings-page.png" alt="Keybindings Page" width="300" />
  <img src="./screenshots/settings-page.png" alt="Settings Page" width="300" />
  <br />
  <em>Keybindings & Settings Pages</em>
</div>

## 🚀 Quick Start

### 📥 Download & Install

<div>

| Platform | Download |
|----------|----------|
| **Windows** | [![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/ChessKitchen/pawn-appetit/releases/latest) |
| **macOS** | [![macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/ChessKitchen/pawn-appetit/releases/latest) |
| **Linux** | [![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/ChessKitchen/pawn-appetit/releases/latest) |

</div>

### ⚡ First Steps
1. **Download** the latest release for your platform
2. **Install** and launch Pawn Appétit
3. **Import** your first game from lichess.org or chess.com
4. **Start analyzing** with the built-in engine
5. **Join our [Discord](https://discord.gg/8hk49G8ZbX)** for tips and support

## 🛠️ Development Setup

### Prerequisites
Ensure you have the required tools installed for your platform:
- [Tauri prerequisites](https://tauri.app/start/prerequisites/)
- [pnpm package manager](https://pnpm.io/)

### Build Instructions

1. **Clone the repository**:

   ```bash
   git clone git@github.com:ChessKitchen/pawn-appetit.git
   cd pawn-appetit
   ```

2. **Install dependencies using pnpm**:

   ```bash
   pnpm install
   ```

3. **Run in Development Mode**:

    Build and run the desktop application using Tauri:

    ```bash
    pnpm tauri dev
    ```

4. **Build for Production**:

    Build the application for production:

    ```bash
    pnpm tauri build
    ```

    The compiled application will be available at:

    ```bash
    src-tauri/target/release
    ```

### 🐳 Using Docker

You can also build Pawn Appétit using Docker (make sure [Docker](https://www.docker.com/) is installed and running):

1. **🏗️ Build the Docker image**:

   ```bash
   docker build -t pawn-appetit .
   ```

2. **🚀 Run the container**:

   ```bash
   docker run -d --name pawn-appetit-app pawn-appetit
   ```

3. **📦 Copy the built binary from the container**:

   ```bash
   docker cp pawn-appetit-app:/output/pawn-appetit ./pawn-appetit
   ```

The binary will be available in your current directory.

## ⚖️ How We Compare

| Feature | Pawn Appétit | ChessBase | Arena | Scid |
|---------|--------------|-----------|-------|------|
| **Price** | Free ✅ | $199+ ❌ | Free ✅ | Free ✅ |
| **Modern UI** | ✅ | ✅ | ❌ | ❌ |
| **Cross-platform** | ✅ | Windows only ❌ | Windows only ❌ | ✅ |
| **Open Source** | ✅ | ❌ | ❌ | ✅ |

## 🌍 Translations

<!-- TRANSLATIONS_START -->
| Language  | Status   | File                        |
|-----------|----------|-----------------------------|
| 🇺🇸 US | ✅ 100% | [US](./src/translation/en_US.ts) |
| 🇫🇷 FR | ✅ 100% | [FR](./src/translation/fr_FR.ts) |
| 🇦🇲 AM | ✅ 100% | [AM](./src/translation/hy_AM.ts) |
| 🇷🇺 RU | ✅ 100% | [RU](./src/translation/ru_RU.ts) |
| 🇮🇹 IT | 🟡 76% | [IT](./src/translation/it_IT.ts) |
| 🇧🇾 BY | 🟡 57% | [BY](./src/translation/be_BY.ts) |
| 🇩🇪 DE | 🟡 57% | [DE](./src/translation/de_DE.ts) |
| 🇪🇸 ES | 🟡 57% | [ES](./src/translation/es_ES.ts) |
| 🇳🇴 NO | 🟡 57% | [NO](./src/translation/nb_NO.ts) |
| 🇵🇱 PL | 🟡 57% | [PL](./src/translation/pl_PL.ts) |
| 🇵🇹 PT | 🟡 57% | [PT](./src/translation/pt_PT.ts) |
| 🇹🇷 TR | 🟡 57% | [TR](./src/translation/tr_TR.ts) |
| 🇺🇦 UA | 🟡 57% | [UA](./src/translation/uk_UA.ts) |
| 🇨🇳 CN | 🟡 57% | [CN](./src/translation/zh_CN.ts) |
| 🇯🇵 JP | 🔴 9% | [JP](./src/translation/ja_JP.ts) |
<!-- TRANSLATIONS_END -->

📢 Want to help translate? See [CONTRIBUTING_TRANSLATIONS.md](./CONTRIBUTING_TRANSLATIONS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md).

## 🗺️ Roadmap

### 🎯 **Coming Soon**

- [ ] **Web Version** - Play and manage your games in the browser
- [ ] **Mobile Companion App** - Sync your repertoire to mobile
- [ ] **Cloud Sync** - Access your data from anywhere (optional)
- [ ] **Tournament Mode** - Tools for competitive play
- [ ] **Advanced Statistics** - Deeper game insights

### 💭 **Your Ideas**
Have a feature request? [Let us know!](https://github.com/ChessKitchen/pawn-appetit/discussions)

## 📊 Telemetry

Pawn Appétit uses Supabase for anonymous telemetry to help improve the application. The telemetry collects:

- Application version and platform information (OS, version, and architecture)
- Anonymous user country code, detected locally or via a public IP geolocation API (`ip-api.com`)
- Basic usage events

No personal information, IP addresses, or game content are used for data collection. You can disable telemetry in the settings if preferred.

## 📦 Changelog

For a list of recent changes, see the [Changelog](./CHANGELOG.md).

## 🤝 Join Our Community

We're building something amazing together! Here's how you can be part of it:

### 💬 **Get Help & Connect**
- 💭 [Discord Server](https://discord.gg/8hk49G8ZbX) - Chat with users and developers
- 🐛 [Report Issues](https://github.com/ChessKitchen/pawn-appetit/issues) - Help us improve
- 💡 [Feature Requests](https://github.com/ChessKitchen/pawn-appetit/discussions) - Share your ideas

### 🌟 **Contribute**
- 🔧 [Development Guide](./CONTRIBUTING.md) - Code contributions welcome
- 🌍 [Translation Help](./CONTRIBUTING_TRANSLATIONS.md) - Help localize the app
- ⭐ **Star this repo** - It really helps us grow!

### 📊 **Project Stats**
![GitHub contributors](https://img.shields.io/github/contributors/ChessKitchen/pawn-appetit)
![GitHub last commit](https://img.shields.io/github/last-commit/ChessKitchen/pawn-appetit)
![GitHub issues](https://img.shields.io/github/issues/ChessKitchen/pawn-appetit)

We welcome contributions! Please refer to the [Contributing Guide](./CONTRIBUTING.md) for details on how to get started.

## 💬 Community

Join our [Discord server](https://discord.gg/8hk49G8ZbX) to connect with other users, get help, and contribute to discussions.

## 🧱 About This Project

Pawn Appétit is a fork of [En Croissant](https://github.com/franciscoBSalgueiro/en-croissant), extended with additional features, refinements, and a focus on user experience.

