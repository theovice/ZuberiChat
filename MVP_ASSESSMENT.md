# MVP Assessment: ZuberiChat Umbrella Repo

## Scope Reviewed

This assessment covers the current umbrella structure and the two bundled projects:

- `services/clawdbot-feishu` (Feishu/Lark channel plugin)
- `apps/veritas-kanban` (local-first Kanban + agent orchestration)

## Current MVP Readiness (High-Level)

**Overall:** The repo contains substantial functionality, but as an **umbrella product MVP** it is still in a **pre-integrated state**.

- The root README explicitly positions this as an umbrella layout, not a unified product runtime.
- Setup must be performed independently inside each project directory.
- There is no root-level, single-command developer or operator flow.

## What Exists Today (MVP Strengths)

1. **Clear separation of concerns**
   - Brain (`services/`) and Face (`apps/`) split is documented and easy to reason about.

2. **Strong feature surface in Veritas Kanban**
   - Rich task lifecycle, agent orchestration primitives, API/CLI/MCP support, and extensive documentation.

3. **Operational guidance is present**
   - Multiple SOP-style docs, setup guidance, and troubleshooting references reduce onboarding risk.

4. **Security baseline controls exist**
   - Auth, API keys, JWT secret support, CORS, and role-based key model are already documented in env config.

## What Is Lacking for a True MVP (Priority Gaps)

### P0 — Unified Product Experience

1. **No integrated "run the product" flow from root**
   - Root docs explicitly say to avoid a combined workspace and install/run each project independently.
   - MVP should provide a one-command local bootstrap (e.g., `make dev` or `pnpm dev:all`) with health checks.

2. **No explicit end-to-end integration contract between UI and Feishu service**
   - Both projects are present, but umbrella-level wiring, ownership boundaries, and success criteria are not defined at root.
   - MVP needs a top-level integration spec: required env vars, event flow, failure behavior, and smoke test steps.

3. **No umbrella acceptance checklist**
   - There are project-level docs, but no root-level Definition of Done for "MVP is usable".
   - MVP should include user-journey checks (create task → agent pickup → external channel update/notification).

### P1 — Production Readiness

4. **Security defaults still optimized for local dev**
   - Localhost auth bypass guidance is useful for dev but can be misused if copied into production.
   - MVP should include a production profile with hardened defaults and a deployment safety checklist.

5. **Rate limiting and edge hardening are not first-class at umbrella level**
   - Docs call out missing built-in protections for public exposure.
   - MVP should ship a recommended reverse proxy template (nginx/Caddy) and baseline limits.

6. **No single deployment story for the combined system**
   - Each component has setup guidance, but umbrella deployment topology is not standardized.
   - MVP should define a reference deployment (local + one cloud/self-host target).

### P2 — UX and Operability Completeness

7. **Onboarding still partly manual**
   - Docs mention "manual today, guided tomorrow" setup direction.
   - MVP should include a guided setup that validates dependencies, env, auth, and connectivity end-to-end.

8. **Roadmap/future features in key docs indicate unfinished operational loops**
   - Example: future "Doc Steward" automation indicates maintenance workflows are not yet fully closed.
   - MVP should either include these loops or clearly de-scope them from MVP messaging.

9. **Scalability/performance guardrails are acknowledged but not fully closed**
   - Refactoring docs mention backlog-related performance work as backlog priority.
   - MVP should include explicit tested limits (task count, concurrency, expected latency) and a scale envelope.

## Recommended MVP Definition (Practical)

You can call this umbrella repo MVP-ready when all of the following are true:

1. A new user can clone repo and run **one command** to boot all required services.
2. A documented **happy-path E2E flow** succeeds in under 10 minutes:
   - login/setup
   - create task
   - trigger agent action
   - observe state change in UI
   - verify external channel or webhook signal.
3. Production-safe defaults are available via a dedicated profile and checklist.
4. Root-level smoke tests validate service health and core API contracts.
5. A root-level troubleshooting matrix maps common failures to fixes.

## Suggested Next 2-Week MVP Plan

### Week 1 (P0 focus)
- Add root `dev` orchestration scripts (start/stop/health).
- Write umbrella integration contract (`docs/integration-mvp.md`).
- Add root `MVP_CHECKLIST.md` with pass/fail criteria.

### Week 2 (P1 focus)
- Add production baseline docs + sample reverse-proxy config.
- Add automated smoke test script covering the happy-path flow.
- Tighten defaults and add explicit "dev vs prod" env templates.

## Bottom Line

The building blocks are strong, especially inside `apps/veritas-kanban`, but the **umbrella MVP is currently missing integration, standardization, and production framing**. Closing the P0 items will move this from "powerful components" to a coherent MVP product.
