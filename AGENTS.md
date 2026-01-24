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
