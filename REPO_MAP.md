# ZuberiChat Repository Map

```text
ZuberiChat/
├── README.md                        # Top-level project overview
├── REPO_MAP.md                      # This visual map
├── apps/
│   └── veritas-kanban/              # Main application workspace
│       ├── README.md
│       ├── web/                     # Front-end app
│       │   └── src/
│       ├── server/                  # Back-end/API app
│       │   └── src/
│       ├── shared/                  # Shared code/types between web + server
│       │   └── src/
│       ├── cli/                     # Command-line tooling
│       │   └── src/
│       ├── mcp/                     # MCP integration layer
│       │   └── src/
│       ├── e2e/                     # End-to-end tests
│       │   └── helpers/
│       ├── load-tests/              # Performance/load test assets
│       │   └── k6/
│       ├── docs/                    # Feature and implementation docs
│       │   └── features/
│       ├── scripts/                 # Automation scripts
│       ├── assets/                  # Static assets
│       ├── demo/                    # Demo material
│       ├── site/                    # Site/documentation app content
│       ├── prompt-registry/         # Prompt definitions/registry
│       └── refactoring/             # Refactoring notes and experiments
└── services/
    └── clawdbot-feishu/             # Feishu integration service
        ├── README.md
        ├── src/
        │   ├── bitable-tools/       # Feishu Bitable toolset
        │   ├── doc-tools/           # Document operations
        │   ├── drive-tools/         # Drive/file operations
        │   ├── integrations/        # External/internal integrations
        │   ├── perm-tools/          # Permission management
        │   ├── task-tools/          # Task-related operations
        │   ├── tools-common/        # Shared service-level utilities
        │   └── wiki-tools/          # Wiki operations
        ├── scripts/                 # Service scripts
        ├── docs/                    # Service documentation
        └── skills/                  # Feishu-specific operational skills
            ├── feishu-doc/
            ├── feishu-drive/
            ├── feishu-perm/
            └── feishu-wiki/
```

## Notes
- This map intentionally focuses on primary product code and support directories.
- `node_modules/`, VCS internals, and hidden tool caches are omitted for readability.
