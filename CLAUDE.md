# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

This is the Vercel monorepo: the Vercel CLI, the Build Output / Runtime API implementations for every supported language, and the platform's build pipeline glue. It's a pnpm workspace managed with Turborepo, plus a small Rust workspace and Python packages.

- `packages/*` — public npm packages under the `@vercel` scope (the CLI itself is the package named `vercel` at `packages/cli`). Includes language runtimes (`node`, `python`, `go`, `ruby`, `rust`), framework adapters (`next`, `remix`, `react-router`, `redwood`, `gatsby-*`, `hydrogen`, `static-build`, ...), server-framework request adapters (`express`, `fastify`, `koa`, `hono`, `h3`, `nestjs`, `elysia`), and CLI-support libraries (`build-utils`, `client`, `fs-detectors`, `routing-utils`, `static-config`, `frameworks`, `cli-auth`, `cli-config`, `error-utils`, `oidc`, `mcp-adapter`, `firewall`, `connect`, `backends`, ...).
- `internals/*` — private `@vercel-internals` packages shared across the workspace (`constants`, `types`, `tsconfig`, `get-package-json`). Ignored by changesets.
- `api/` — the internal build/deploy API used by `vercel-build`. Ignored by changesets.
- `crates/vercel_runtime` + `Cargo.toml` — Rust workspace backing the `rust` runtime package.
- `python/vercel-runtime`, `python/vercel-workers` — Python packages (managed with `uv`, see `pyproject.toml` / `uv.lock`).
- `examples/` — framework example fixtures used by integration tests; **do not modify examples to make a test pass**, they are the test input.
- `utils/` — build/release scripting (`gen.js`, `pack.ts`, `build.mjs`, publish scripts).
- `.claude/skills/vercel-runtime-implementation-guide.md` — Fluid Compute IPC protocol reference for runtime authors (see below).

## Essential commands

Run from the repo root unless noted. Package manager is **pnpm** (`corepack enable` first); do not use `npm`/`yarn`.

```bash
pnpm install          # install workspace deps
pnpm build             # node utils/gen.js && turbo run build (builds all packages)
pnpm type-check        # turbo type-check across all packages
pnpm lint              # biome lint api internals packages test utils
pnpm format             # biome format --write (or `pnpm prettier --write .`)
pnpm test-unit          # root vitest + turbo run vitest-unit across packages
pnpm test-e2e            # turbo run vitest-e2e (fixture-based, real deployments)
pnpm test-dev             # turbo run test-dev
pnpm changeset            # create a changeset (required for every PR, see below)
```

Run tests for a single package:

```bash
cd packages/<name>
pnpm test-unit                              # whole package's unit tests
pnpm vitest run test/unit/path/to.test.ts   # a single test file (vitest packages)
```

Some packages (e.g. `cli`) use Jest-style layout but run on Vitest; check that package's `package.json` scripts (`test`, `vitest-unit`, `vitest-run`) rather than assuming.

Invoke the CLI with local changes instead of a global install:

```bash
cd packages/cli
pnpm vercel <cli-commands...>
# or from repo root: pnpm vercel <cli-commands...>
```

Integration/e2e tests create real deployments to a Vercel account (`VERCEL_TOKEN` / `VERCEL_TEAM_ID` env vars); avoid running the full e2e suite locally unless isolating a specific test (see README for details on interpreting failures).

## Changesets — required for every PR

Every PR must add a changeset:

```bash
pnpm changeset
```

- If the change touches a package under `packages/*`, list it in the frontmatter with a bump type (`patch`/`minor`/`major`).
- If the change is docs/config/tooling/examples only, still add a changeset but with **empty frontmatter**.
- `internals/*`, `api/`, and `examples/` are excluded from changesets (`.changeset/config.json`).

## Code style and lint conventions

- Formatting/linting is **Biome** (`biome.jsonc`), configured to match the repo's prior Prettier settings: single quotes, `es5` trailing commas, no parens on single arrow-function params, 2-space indent, 80-col width. Pre-commit runs `lint-staged` → `biome format --write` + `biome lint` via Husky.
- TypeScript: all packages extend `tsconfig.base.json` (which extends `@vercel/style-guide/typescript`), targeting ES2021/CommonJS. `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns` are enforced.
- `@typescript-eslint/no-unused-vars` is enforced; no focused/disabled tests (`jest/no-focused-tests`, `jest/no-disabled-tests`) are errors.
- Use `.slice()`, not the deprecated `.substr()`.
- `no-console` is enforced in `packages/cli` — don't use `console.log` there (use the CLI's output helpers, e.g. `output-manager.ts`).
- Cross-package imports use `workspace:*` versions in `package.json` (kept in sync via `syncpack`, see `.syncpackrc.json`).

## Architecture

### Runtime API (Build packages)

Language runtimes (`node`, `python`, `go`, `ruby`, `rust`, and framework builders like `next`/`static-build`) all implement the same **Runtime interface** documented in `DEVELOPING_A_RUNTIME.md`:

```typescript
export const version = 3;
export async function build(options: BuildOptions): Promise<BuildResult>;
// optional:
export async function prepareCache(options): Promise<Files>;
export async function shouldServe(options): Promise<boolean>;
export async function startDevServer(options): Promise<StartDevServerResult>;
```

`build()` turns a project's source into a `BuildResult` (typically a Lambda created via `@vercel/build-utils`'s `createLambda`, plus any additional `routes`). `@vercel/build-utils` (`packages/build-utils/src`) provides the shared primitives every runtime builds on: `File`/`FileFsRef`/`FileBlob` abstractions, `Lambda`/`EdgeFunction` output types, glob/ignore-file handling, and Node builder helpers (`generate-node-builder-functions.ts`).

Runtimes that run under Fluid Compute (the newer streaming execution model) speak the **Fluid IPC protocol** — a JSON-over-Unix-socket protocol between the Rust core (`crates/vercel_runtime`) and the language process. Full protocol details (message types, `VERCEL_IPC_PATH`) are in `.claude/skills/vercel-runtime-implementation-guide.md`, with `packages/node` as the primary reference implementation.

### CLI (`packages/cli`)

- `src/commands/<name>/` — one directory per CLI subcommand (65+ commands: `deploy`, `dev`, `build`, `env`, `domains`, `dns`, `blob`, `certs`, `alias`, `crons`, `ai-gateway`, `agent`, ...). `src/commands-bulk.ts` registers/dispatches them; `src/args.ts` and `src/help.ts` handle argument parsing and help text.
- `src/util/<name>/` — mirrors the commands directory with shared helper logic (API clients, formatting, validation) reused across commands.
- `src/util/client.ts` — the authenticated API client used to talk to the Vercel API; most commands take a `Client` instance.
- `src/output-manager.ts` — centralized stdout/stderr/spinner output (use this instead of `console.log`).
- The CLI depends on nearly every other package in the monorepo as `workspace:*` (runtimes, framework adapters, `@vercel/client`, `@vercel/build-utils`, etc.) since it orchestrates builds and deployments locally (`vercel dev`, `vercel build`) and remotely (`vercel deploy`).
- `@vercel/client` (`packages/client/src`) implements the lower-level deployment protocol: `create-deployment.ts`, `upload.ts`, `check-deployment-status.ts`.

### Framework detection

`@vercel/fs-detectors` and `@vercel/frameworks` (referenced from `api/frameworks.ts` and the CLI) detect which framework a project uses and select the appropriate builder/runtime; `@vercel/static-config` reads in-source config (e.g. `export const config = {...}`) that individual functions can declare.

### Turborepo task graph

`turbo.json` defines the task pipeline: `build` depends on upstream packages' `build` (`^build`); test tasks (`vitest-unit`, `vitest-e2e`, `test-unit`, `test-dev`, etc.) depend on `build`; `type-check` depends on `source` + upstream `^source`. CI only runs tasks for changed packages and their dependents (affected-based testing), so a change in a low-level package like `build-utils` will trigger rebuilds/retests across dependents.

## Runtime Packages

Runtime packages (node, python, go, ruby, rust) implement the Builder API described above. New packages should be published under `@vercel/*` with `"publishConfig": { "access": "public" }`.

## Common pitfalls

1. Don't use `console.log` in `packages/cli` — `no-console` is enforced there.
2. Don't skip CI hooks (lint/type-check run in pre-commit via Husky + lint-staged).
3. Run `pnpm type-check` before pushing.
4. Don't modify `examples/` to make a test pass — they're fixture inputs for integration tests.
5. Forgetting a changeset (`pnpm changeset`) will fail PR checks, even for non-package changes (use empty frontmatter).
