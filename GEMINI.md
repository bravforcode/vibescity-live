# Project VibeCity

## Overview

VibeCity is a full-stack web application designed to help users discover nightlife, bars, and entertainment in Chiang Mai, Thailand.

- **Frontend:** The frontend is built with **Vue 3** and uses **Rsbuild** as its primary build tool. It incorporates **Tailwind CSS** for styling, **Pinia** for state management, and **Vue Router** for navigation. **Mapbox GL** is used for interactive map features.
- **Backend:** The backend is powered by **FastAPI** (Python).
- **Platform:** **Supabase** is used for the database, authentication, and storage.
- **Testing:** The project has a robust testing strategy:
    - **Unit/Component Testing:** **Vitest** is used for running unit and component tests.
    - **End-to-End (E2E) Testing:** **Playwright** is used for E2E tests, with configurations for multiple browsers (Chromium, WebKit) and environments.
- **Code Quality:** **BiomeJS** is used for linting and formatting the entire codebase, ensuring consistency.

## Key Technologies

- **Frontend:** Vue 3, Rsbuild, Vite, Tailwind CSS, Pinia, Vue Router, Mapbox GL
- **Backend:** FastAPI
- **Database:** Supabase (PostgreSQL)
- **Package Manager:** bun
- **Testing:** Vitest, Playwright
- **Linting/Formatting:** BiomeJS
- **Deployment:** Configuration files for Vercel, Firebase, Docker, and Fly.io are present.

## Getting Started

### Prerequisites

- **Bun:** This project uses Bun as the package manager and runtime.
- **Node.js:** Required for some scripts and tooling.

### Installation

Install the project dependencies using Bun:

```bash
bun install
```

If you are using Windows Subsystem for Linux (WSL), you may need to specify the OS target:

```bash
bun install --os linux --cpu x64
```

There is also a bootstrap script for a fresh WSL setup:
```bash
bash scripts/dev/wsl-bootstrap.sh
```

### Development

To start the local development server, which runs the Rsbuild dev server on port 5173 and proxies API requests to the FastAPI backend (expected to be running on port 8000):

```bash
bun run dev
```

### Building for Production

To create a production-ready build:

```bash
bun run build
```

This command bundles the frontend application and then runs a prerendering script for venue pages.

## Main Commands

| Command | Description |
| :--- | :--- |
| `bun run dev` | Starts the development server with hot-reloading. |
| `bun run build` | Builds the application for production. |
| `bun run preview` | Serves the production build locally for previewing. |
| `bun run check` | Runs Biome to check for linting and formatting issues. |
| `bun run format` | Formats the code using Biome. |
| `bun run lint` | Lints the code using Biome. |
| `bun run test:unit` | Runs all unit tests using Vitest. |
| `bun run test:unit:coverage`| Runs unit tests and generates a coverage report. |
| `bun run test:e2e` | Runs all Playwright E2E tests. |
| `bun run test:e2e:ui` | Opens the Playwright UI for interactive E2E testing. |
| `bun run storybook` | Starts the Storybook server for component development. |


## Development Conventions

- **Code Style:** The project enforces a consistent code style using **BiomeJS**. The configuration is in `biome.json`, which specifies tab-based indentation and double quotes for JavaScript/TypeScript.
- **Testing:**
    - Unit tests are located in the `tests/` directory and run with Vitest.
    - E2E tests are in `tests/e2e/` and run with Playwright. The configuration in `playwright.config.ts` is comprehensive, with settings for CI environments, different browsers (mobile and desktop), and trace recording on failure.
- **Source Code:** The main application source code is located in the `src/` directory. The entry point is `src/main.js`.
- **Environment Variables:** The project uses `.env` files for managing environment variables. Variables intended for the frontend must be prefixed with `VITE_`.
- **Build System:** While `vite.config.js` exists, `rsbuild.config.ts` appears to be the primary build configuration, handling chunk splitting, aliases (`@` for `src`), and defines. Vite is likely used for specific tasks like Storybook or PWA generation.
