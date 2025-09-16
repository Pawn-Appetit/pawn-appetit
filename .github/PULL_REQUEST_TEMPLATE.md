# Pull Request

## 📋 PR Summary

**Type of Change** (check all that apply):
- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 🔧 Refactoring (code change that neither fixes a bug nor adds a feature)
- [ ] 📝 Documentation update
- [ ] 🌍 Translation update
- [ ] 🎨 UI/UX improvement
- [ ] ⚡ Performance improvement
- [ ] 🧪 Test coverage improvement
- [ ] 🏗️ Build/CI configuration change
- [ ] 🔒 Security improvement

**Related Issues**: 
<!-- Link to related issues using #issue_number or "Closes #issue_number" -->

---

## 📖 Description

### What
<!-- Brief description of what this PR does -->

### Why
<!-- Explain the motivation for this change - what problem does it solve? -->

### How
<!-- Describe your implementation approach and any significant technical decisions -->

---

## 🧪 Testing

### Testing Performed
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] Cross-platform testing (if applicable)
- [ ] Performance testing (if applicable)

### Test Coverage
<!-- Describe what you tested and how -->

### Manual Testing Instructions
<!-- Step-by-step instructions for reviewers to test your changes -->
1. 
2. 
3. 

---

## ♟️ Chess-Specific Considerations

**Chess Domain Impact** (check all that apply):
- [ ] Chess engine integration/compatibility
- [ ] PGN file parsing/generation
- [ ] Opening database functionality
- [ ] Position validation/setup
- [ ] Game analysis features
- [ ] UCI protocol implementation
- [ ] Chess notation handling
- [ ] Board rendering/interaction
- [ ] Time control management
- [ ] Tournament features

**Engine Compatibility**:
- [ ] Tested with Stockfish
- [ ] Tested with other engines: ___________
- [ ] No engine interaction required

**PGN Compatibility**:
- [ ] Tested with standard PGN files
- [ ] Tested with complex/annotated PGN files
- [ ] Handles edge cases in notation
- [ ] No PGN interaction required

---

## 🖥️ Tauri/Desktop Specific

**Platform Testing** (check all that apply):
- [ ] Windows tested
- [ ] macOS tested  
- [ ] Linux tested
- [ ] Cross-platform compatibility verified

**Tauri Features** (if applicable):
- [ ] File system operations
- [ ] System notifications
- [ ] Window management
- [ ] Auto-updater compatibility
- [ ] Menu/system tray changes
- [ ] Deep linking/protocol handling
- [ ] No Tauri-specific changes

**Build Verification**:
- [ ] Development build tested (`pnpm dev`)
- [ ] Production build tested (`pnpm tauri build -b none`)
- [ ] No build issues introduced

---

## 🎨 UI/UX Changes

**Visual Changes** (if applicable):
- [ ] Screenshots/recordings attached
- [ ] Responsive design tested
- [ ] Dark/light theme compatibility
- [ ] Accessibility considerations addressed
- [ ] No visual changes

**Screenshots/Recordings**:
<!-- Add screenshots or screen recordings to show UI changes -->

---

## 🌍 Translation Impact

**Internationalization** (check all that apply):
- [ ] New translatable strings added
- [ ] Translation keys updated
- [ ] Existing translations modified
- [ ] RTL language compatibility considered
- [ ] No translation changes

**Translation Keys Added/Modified**:
<!-- List any new or changed translation keys -->

---

## 📚 Documentation

**Documentation Updates** (check all that apply):
- [ ] Code comments added/updated
- [ ] README updated
- [ ] API documentation updated
- [ ] User guide updated
- [ ] Contributing guidelines updated
- [ ] Changelog updated
- [ ] No documentation changes needed

---

## 🔧 Code Quality

**Code Quality Checklist**:
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Biome formatting applied (`pnpm format`)
- [ ] Linting passes (`pnpm lint:fix`)
- [ ] TypeScript compilation successful (`pnpm lint`)
- [ ] No console.log statements left in production code
- [ ] Error handling implemented appropriately
- [ ] Performance impact considered

**Technical Debt**:
- [ ] No new technical debt introduced
- [ ] Existing technical debt addressed
- [ ] Refactoring opportunities identified

---

## 🚀 Performance Impact

**Performance Considerations**:
- [ ] No performance regression expected
- [ ] Performance improvement achieved
- [ ] Memory usage optimized
- [ ] Bundle size impact considered
- [ ] Database query optimization (if applicable)

**Benchmarks** (if applicable):
<!-- Include any performance measurements or benchmarks -->

---

## 🔒 Security Considerations

**Security Impact**:
- [ ] No security implications
- [ ] Input validation added/improved
- [ ] File access properly restricted
- [ ] No sensitive data exposed
- [ ] External dependencies reviewed

---

## 🎯 Reviewer Guidelines

**Areas needing special attention**:
<!-- Highlight specific areas where you want focused review -->

**Review checklist for maintainers**:
- [ ] Code quality and architecture
- [ ] Chess domain accuracy (if applicable)
- [ ] Cross-platform compatibility
- [ ] Performance implications
- [ ] Security considerations
- [ ] Documentation completeness
- [ ] Test coverage adequacy

---

## 📝 Additional Notes

<!-- Any additional information, concerns, or context for reviewers -->

### Breaking Changes
<!-- If this is a breaking change, describe the impact and migration path -->

### Future Work
<!-- Any follow-up work or improvements that could be done -->

### Questions for Reviewers
<!-- Any specific questions or areas where you'd like feedback -->

---

## 🤝 Contribution Checklist

**Before requesting review**:
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

**Commit Requirements**:
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/) format
- [ ] Commit messages are clear and descriptive
- [ ] Related commits are squashed appropriately

---

**Discord**: Join our [Discord community](https://discord.gg/8hk49G8ZbX) for discussions and real-time feedback!

**Thank you for contributing to Pawn Appétit!**
