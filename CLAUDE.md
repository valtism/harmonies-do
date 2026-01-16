# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Harmonies-DO is a real-time multiplayer implementation of the board game Harmonies using Cloudflare Durable Objects for WebSocket-based game state synchronization. The frontend is a React SPA with hexagonal grid-based gameplay.

## Commands

- `bun run dev` - Start development server (Vite + Cloudflare local dev)
- `bun run build` - TypeScript compilation + Vite build
- `bun run lint` - Run ESLint
- `bun run deploy` - Build and deploy to Cloudflare Workers
- `bun run cf-typegen` - Generate Cloudflare types from wrangler config

## Architecture

### Frontend/Backend Split
- **Frontend** (`src/`): React SPA using TanStack Router with file-based routing
- **Backend** (`worker/index.ts`): Cloudflare Worker + Durable Object for WebSocket game server

### Durable Object Hierarchy
The worker exports two Durable Object classes:
- `Harmonies`: Base WebSocket session manager (tracks connections, handles broadcast)
- `HarmoniesGame`: Extends `Harmonies` with game-specific state and action handling

### Shared Types
`src/sharedTypes.ts` contains Zod schemas and TypeScript types used by both frontend and worker:
- `actionSchema`: Union of all valid game actions (joinGame, startGame, takeTokens, placeToken, etc.)
- `GameState`: Server-side state with player map, game status, and history
- `DerivedPublicGameState`: Client-facing state derived from server state

### WebSocket Communication
- Frontend connects via `useWebSocket` hook in `src/util/useWebSocket.ts`
- Actions are sent as JSON matching `ActionType` schema
- Server broadcasts `Broadcast` messages (gameState updates or errors)

### Hexagonal Grid
Uses `honeycomb-grid` library for hex coordinate math. Grid coordinates use axial system (q, r). Player boards render hexes over a static board image with calculated positioning.

### Key Game Entities
- **Tokens**: Colored cubes that move through states (pouch → centralBoard → taken → playerBoard)
- **AnimalCards**: Scoring patterns defined by hex shapes and token requirements
- **SpiritCards**: Additional scoring cards (partially implemented)

### Routing
TanStack Router with file-based routes in `src/routes/`:
- `/` - Home/lobby
- `/$roomId` - Game room (creates/joins Durable Object by room ID)

## TypeScript Configuration

Uses composite project structure with three configs:
- `tsconfig.app.json` - Frontend React code
- `tsconfig.worker.json` - Cloudflare Worker code
- `tsconfig.node.json` - Vite/build tooling
