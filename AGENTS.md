# Repository Guidelines

## Project Structure & Module Organization

- Frontend: `src/` React + TanStack Router + Tailwind.
- Backend: `worker/index.ts` (Cloudflare Worker + Durable Objects).
- Shared types: `src/sharedTypes.ts` with Zod schemas and shared models.

## Build, Test, and Development Commands

- Dev server: `bun run dev`
- Build: `bun run build`
- Lint: `bun run lint`
- Preview: `bun run preview`
- Deploy: `bun run deploy`
- Cloudflare typegen: `bun run cf-typegen`

## Coding Style & Naming Conventions

- TypeScript + React (ESM); 2-space indentation; double quotes; trailing commas in multiline literals.
- Components use PascalCase filenames (e.g., `PlayerBoard.tsx`); utilities and hooks use camelCase.
- Add new card/token metadata in `src/constants/` and keep asset filenames descriptive and consistent.

### Error handling

- Use `assert` in `src/util/assert.ts` for invariant checks when needed.
- Worker actions validate first; return errors via broadcast messages.
- Prefer explicit error responses (`sendError`) over silent failures.
- Log errors in worker `handleWebSocketMessage` and recover gracefully.

### Durable Object patterns

- Durable Object manages WebSocket sessions and game state.
- Action handlers use `validate` and `apply` steps with a typed context.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `valtism/harmonies-do` using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: read root `CONTEXT.md` and relevant ADRs under `docs/adr/` when present. See `docs/agents/domain.md`.
