# ADR-001: Modular monorepo with provider-neutral commerce

**Status:** Accepted

Yubie needs one coherent product surface today without coupling its long-term commerce stack to one vendor. The project therefore uses npm workspaces with deployable `web` and `api` applications plus small domain packages.

This raises initial repository structure slightly, but creates explicit ownership, makes request validation reusable, allows independent API deployment, and keeps future payment/provider migration away from UI code.
