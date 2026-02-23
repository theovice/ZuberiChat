# Build / Run Matrix

| Mode | Command | Notes |
|---|---|---|
| Dev (diagnostics + local checks) | `pnpm dev` | Runs `scripts/diagnose.ts` via tsx. |
| Type-check | `pnpm lint` | Uses `tsc --noEmit`. |
| Test (smoke) | `pnpm test` | Alias to lint/type-check for now. |
| Prod build | `pnpm build` | Emits compiled JS + declarations to `dist/`. |
| Prod run (compiled diagnose) | `pnpm start` | Runs `dist/scripts/diagnose.js`. |

## Node and package management
- Node: use current LTS (document/pin in deployment environment).
- Package manager: pnpm with committed `pnpm-lock.yaml`.

## Optional container flow
- Build image from repo with `pnpm install --frozen-lockfile && pnpm build`.
- Runtime container should inject env vars from secret manager and run `pnpm start` (or host entrypoint).
