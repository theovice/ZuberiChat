# Chosen Topology

## Decision
**Pattern A: Standalone Feishu Gateway (recommended deployment shape), while keeping this repo as the channel adapter implementation.**

## Why
- This repository is an OpenClaw plugin, but operationally the highest-reliability setup is to run a dedicated Feishu-facing integration layer that can be validated independently from core agent behavior.
- It reduces config coupling risk when OpenClaw gateway settings drift.
- It gives clearer ownership of Feishu auth, mode (WS/webhook), and diagnostics.
- It remains portable across different agent cores by preserving a normalized DTO + endpoint contract.

## Practical interpretation for this repo
- Keep plugin compatibility for OpenClaw users.
- Add a strict env contract and diagnostics so a gateway deployment can be treated as a first-class service boundary.
