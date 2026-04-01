# Customization Notes

This repository contains local customizations on top of upstream `CherryHQ/cherry-studio`.

## Comparison Baseline

- Upstream/base commit used for comparison: `e2c8edab61239365530d6d415e517f2ed0831c9f`
- Local compared commit: `2bb955f8fa9b47dc9d8e6d71b019b2467e6a35e5`

## Summary

Relative to the baseline above, the local branch includes 38 changed files.

Main customization areas:

1. Disable built-in auto update flow.
2. Replace upstream branding, links, and assets with local distribution branding.
3. Reduce or lock provider configuration to local service endpoints.
4. Simplify or hide some display/settings capabilities.
5. Keep several local compatibility fixes and behavior changes.

## Key Customizations

### 1. Update system disabled

- `src/main/services/AppUpdater.ts`
- `src/renderer/src/pages/settings/AboutSettings.tsx`
- `src/main/services/__tests__/AppUpdater.test.ts`

Notes:

- Auto update download/install is forced off.
- Update checking returns current version only.
- Settings page shows a manual update prompt instead of the full upstream update flow.

### 2. Branding and distribution entry changes

- `src/renderer/src/pages/settings/AboutSettings.tsx`
- `src/renderer/src/assets/images/avatar.png`
- `src/renderer/src/assets/images/logo.png`
- `src/renderer/src/App.tsx`
- `src/renderer/src/config/env.ts`

Notes:

- GitHub/release links point to the local fork/distribution.
- App assets were replaced.
- About page adds a local video tutorial entry.

### 3. Provider configuration narrowed to local endpoints

- `src/renderer/src/config/providers.ts`
- `src/renderer/src/config/models/default.ts`
- `src/renderer/src/types/index.ts`

Notes:

- Many upstream system providers were commented out or effectively disabled.
- `new-api` default endpoint was changed to `https://api.nwafu-ai.cn`.
- OpenAI-related links were redirected to local service pages.

### 4. Settings/UI simplification

- `src/renderer/src/pages/settings/DisplaySettings/DisplaySettings.tsx`
- `src/renderer/src/pages/settings/DisplaySettings/SidebarIconsManager.tsx`
- `src/renderer/src/components/app/Sidebar.tsx`
- `src/renderer/src/config/sidebar.ts`

Notes:

- Sidebar icon management and custom CSS settings were hidden or reduced.
- Some sidebar-related behavior was adjusted for the local build.

### 5. Local behavior and packaging adjustments

- `electron-builder.yml`
- `.github/workflows/release.yml`
- `package.json`
- `.gitignore`
- `.yarnrc.yml`
- `docs/dev.md`
- `src/main/ipc.ts`
- `src/main/services/ConfigManager.ts`
- `src/main/services/ReduxService.ts`
- `src/renderer/src/hooks/useAppInit.ts`
- `src/renderer/src/store/migrate.ts`
- `src/renderer/src/store/selectionStore.ts`
- `src/renderer/src/store/settings.ts`
- `src/renderer/src/store/tabs.ts`
- `src/renderer/src/pages/launchpad/LaunchpadPage.tsx`
- `src/renderer/src/pages/minapps/MinAppsPage.tsx`
- `src/renderer/src/pages/paintings/NewApiPage.tsx`
- `src/renderer/src/pages/home/Messages/MessageHeader.tsx`
- `src/renderer/src/i18n/locales/en-us.json`
- `src/renderer/src/i18n/locales/zh-cn.json`
- `src/renderer/src/i18n/locales/zh-tw.json`
- `src/renderer/src/i18n/translate/ja-jp.json`
- `src/renderer/src/i18n/translate/ru-ru.json`
- `packages/shared/config/constant.ts`

Notes:

- Includes local merge adaptations, packaging changes, Linux/macOS fixes, and feature defaults.
- Commit history indicates custom fixes such as default enabling of the selection assistant and local build fixes.

## Notable Local Commits

- `9b7d675b5` `合并最新版本`
- `842209b96` `修复linux无法构建的bug`
- `92e0e2d70` `默认打开划词助手`
- `778fe4168` `修复定制版bug`
- plus several `手动合并` / `Merge branch 'CherryHQ:main' into main` commits

## Rebuild Plan

When rebuilding these customizations on a clean upstream branch, prioritize:

1. update-system changes
2. provider/local endpoint changes
3. branding/assets changes
4. settings/UI simplifications
5. packaging and workflow fixes
