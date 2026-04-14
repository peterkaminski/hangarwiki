# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] - 2026-04-14

### Added

- Orphan pages detection — API endpoint and "Orphans" tab on wiki home page
- Transclusion rendering — `![[Page Name]]` embeds resolve in page view and editor preview, with circular dependency protection (max depth 3)
- Image preview in editor — inline thumbnail widgets for `![[image.ext]]` in CodeMirror
- Background git push — page saves, attachment uploads, and deletions now push to Forgejo automatically without blocking the response
- Vitest config for server package to exclude `data/` directory from test discovery

### Fixed

- Forgejo repo creation used `auto_init: true`, which created a diverged history and silently broke all subsequent pushes; changed to `auto_init: false`

### Changed

- Updated PROJECT-PLAN.md to reflect completed Phase 2 items
