# Contributing

HangarWiki is in early development. Contributions are welcome.

## Getting started

See [INSTALLATION.md](INSTALLATION.md) for development setup and [TESTING.md](TESTING.md) for running tests.

## Before you start

- Check [PROJECT-PLAN.md](PROJECT-PLAN.md) for the current roadmap and what's in progress
- Check [DEBT.md](DEBT.md) for known issues that need attention
- Open an issue to discuss larger changes before starting work

## Guidelines

- **Tests required.** New features and bug fixes should include tests. Run `npm test` before submitting.
- **Follow existing patterns.** The codebase has consistent conventions — match them rather than introducing new ones.
- **Keep it simple.** This is a focused tool for small teams. Resist adding complexity for edge cases that don't exist yet.
- **Git commits matter.** Write clear commit messages. Each commit should be a coherent unit of work.

## Architecture notes

- **Server**: Fastify with TypeScript. Routes in `packages/server/src/routes/`, business logic in `services/`.
- **Frontend**: React + Vite + Tailwind. Page components in `packages/web/src/pages/`, shared components in `components/`.
- **Shared**: The Markdown pipeline (`packages/shared/`) is used by both server and client.
- **Git**: We shell out to the `git` CLI — no JS git libraries. See `GitService` in `packages/server/src/services/git.ts`.
- **Forge API**: Gitea-compatible baseline with Forgejo extensions. See `ForgeClient` in `packages/server/src/services/forge.ts`.

## Code style

- TypeScript strict mode
- ESM (`"type": "module"`)
- Imports use `.js` extensions (Node.js ESM resolution)
