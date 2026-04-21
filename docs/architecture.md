# Gutu Core Architecture

## Intent

This repository is the canonical core of the Gutu ecosystem. It is intentionally smaller than the extracted workspace that now surrounds it.

## Active Components

### `@gutu/kernel`

Owns:

- package manifest shape
- repository role and package-kind rules
- core-repo boundary enforcement

### `@gutu/ecosystem`

Owns:

- ecosystem catalog entry model
- compatibility channel model
- workspace lockfile and overrides model
- consumer workspace bootstrap files
- artifact download, digest verification, and vendor installation
- external repository scaffolding for plugin/library/integration repos

### `@gutu/release`

Owns:

- release bundle preparation
- manifest and provenance generation
- manifest signing and signature verification

### `@gutu/cli`

Owns:

- `gutu init`
- `gutu doctor`
- human-readable command output around core and workspace state

### `@platform/kernel`

Owns:

- extracted package definitions and validation errors
- compatibility helpers for package metadata shared across split repos

### `@platform/permissions`

Owns:

- install review planning
- policy definition and permission evaluation helpers

### `@platform/schema`

Owns:

- action and resource definitions
- normalized action execution
- JSON schema projection for AI/MCP and admin surfaces

### `@platform/commands`

Owns:

- explicit cross-plugin command definitions
- idempotent command dispatch receipts
- command-to-event and command-to-job handoff

### `@platform/events`

Owns:

- event envelopes and idempotency keys
- outbox records
- subscriber registration
- retry, dead-letter, and replay semantics

### `@platform/jobs`

Owns:

- job definitions and queue/runtime semantics
- retry and dead-letter handling
- workflow definitions and state-transition guards

### `@platform/plugin-solver`

Owns:

- activation ordering
- dependency warnings
- event-subscription topology warnings
- duplicate command detection

## Cross-Plugin Orchestration

The active framework direction is:

1. Commands for synchronous intent and validation.
2. Events for asynchronous facts that already happened.
3. Jobs for retryable background execution.
4. Workflows for explicit multi-state business processes.

This is intentionally different from WordPress-style generic hooks. The framework now favors explicit, typed, replay-safe orchestration over hidden bidirectional extension points.

## Explicit Non-Goals

- plugin execution
- plugin source hosting
- built-in application surfaces
- product admin shells
- legacy framework distribution bundling
- generic, implicit bidirectional hook chains as the primary integration model

## Boundary

Plugin, library, app, catalog, and integration repositories now live outside this repo in sibling folders of the umbrella workspace. They are not part of the active core architecture.
