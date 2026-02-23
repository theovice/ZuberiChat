# ZuberiChat Umbrella Repository

This repository is organized into an umbrella structure:

- `services/` — backend and core agent logic (Brain)
  - `services/clawdbot-feishu/` contains the original `clawdbot-feishu` project.
- `apps/` — user-facing interfaces (Face)
  - `apps/veritas-kanban/` is reserved for the vendored `veritas-kanban` UI project.

## Setup and Installation

Do **not** use a combined workspace at the umbrella root.

Install dependencies and configure environments **inside each project directory** independently, for example:

- `services/clawdbot-feishu/`
- `apps/veritas-kanban/`
