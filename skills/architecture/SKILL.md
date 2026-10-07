---
name: architecture
description: Use when designing or changing how a system is structured (service or module boundaries, data stores, events and messaging, durable workflows, caching, consistency, API or schema evolution, failure and overload handling, LLM integration), when writing an architecture decision record or design document, or when reviewing a design. Not for routine coding, bug fixes or refactors inside one module.
---

# Architecture reference

A sourced reference of established architecture and resilience practice. Each reference file holds principles with the same five fields: the claim, why it holds (the mechanism), when it does not apply, sources, and reviewer checks.

## Highest-leverage ideas

1. Every remote call gets a timeout, capped retries at one layer, backoff with jitter, and an idempotent receiver. [failure.md](references/failure.md)
2. "Exactly once" is at-least-once delivery plus deduplication at the receiver, keyed on an ID generated once per operation. [data-and-events.md](references/data-and-events.md)
3. Start as one deployable unit with enforced module boundaries; split only for a measured or structural need. [start-simple.md](references/start-simple.md)
4. Decide reversible things fast and irreversible things slowly, and record the irreversible ones. [decisions-and-documentation.md](references/decisions-and-documentation.md)
5. Bound every queue and pool, isolate tenants and workloads, and shed load before latency exceeds client timeouts. [overload.md](references/overload.md)
6. Every stored format and public contract will be read by older and newer code at once; change it in expand, migrate, contract steps. [schema-evolution.md](references/schema-evolution.md)
7. Interfaces get depended on beyond what they promise; define "breaking" and test the consumers. [boundaries.md](references/boundaries.md), [api-versioning.md](references/api-versioning.md)
8. Latency climbs steeply as utilisation nears 100 percent; keep headroom for the largest failure at peak. [queueing-and-capacity.md](references/queueing-and-capacity.md)
9. A few user-facing SLOs and an error budget policy settle the argument between features and reliability. [operations.md](references/operations.md)
10. Treat a model call as a slow, flaky, billed remote service, and its output as untrusted input validated against a schema and business rules. [llm-systems.md](references/llm-systems.md)

## Reference map

Open only the files the task needs.

| File | Open when the work involves |
|---|---|
| [decisions-and-documentation.md](references/decisions-and-documentation.md) | Recording a decision, judging reversibility, enforcing rules in CI, diagrams (C4), an architecture document (arc42) |
| [start-simple.md](references/start-simple.md) | Splitting into services, monolith versus microservices, choosing or adding technology |
| [boundaries.md](references/boundaries.md) | Team and module ownership, interface contracts, where a guarantee must live, ports and adapters |
| [domain-design.md](references/domain-design.md) | Bounded contexts, shared vocabulary, integrating another system's model, aggregates and transactions |
| [failure.md](references/failure.md) | Remote calls, timeouts, retries, circuit breakers, bulkheads, fallbacks, Nygard's patterns, chaos testing |
| [overload.md](references/overload.md) | Cascading failure, load shedding, back pressure, queue backlogs, static stability, cells, shuffle sharding |
| [queueing-and-capacity.md](references/queueing-and-capacity.md) | Little's law, utilisation and latency, load testing, headroom, cost per unit |
| [data-and-events.md](references/data-and-events.md) | Event logs, read models, outbox, idempotency keys, exactly-once, sagas |
| [durable-workflows.md](references/durable-workflows.md) | Replay-based workflow engines: determinism, versioning, activity bounds |
| [consistency.md](references/consistency.md) | Replication, CAP, PACELC, choosing a consistency model |
| [schema-evolution.md](references/schema-evolution.md) | Database migrations, message and storage formats, rollback-safe deploys |
| [api-versioning.md](references/api-versioning.md) | Breaking changes, version pinning, deprecation, input strictness |
| [caching.md](references/caching.md) | Adding a cache, invalidation, TTLs, stampedes, cold caches |
| [observability.md](references/observability.md) | Metrics, alerts, latency percentiles, label cardinality, tracing |
| [testing.md](references/testing.md) | Test suite shape, flakiness, contract tests, property tests, version-transition tests |
| [operations.md](references/operations.md) | SLOs, DORA metrics, on-call ownership, service templates, postmortems, twelve-factor |
| [security.md](references/security.md) | Credentials and permissions, service-to-service trust, build provenance, secrets |
| [llm-systems.md](references/llm-systems.md) | Model calls, agents, evals, provider failure, structured output, untrusted output |

## Rules

- Open only the references the task needs, and within them read the principles that apply.
- When a principle shapes a recommendation or decision, cite it by file and principle name, and name the source behind it.
- Source markers: [V] was verified on the cited page on the date given; [U] was not; [I] is the reference author's inference. State a [U] or [I] item as such ("reportedly", "by inference"), never as established fact.
- Quotes marked "(extraction)" passed through a summarising fetch tool. Before quoting any source in a decision record, re-open the URL and confirm the wording.
- Apply "When it does not apply" as seriously as the claim. A principle applied outside its conditions is a mistake, not rigour.
- When explaining a principle to a person, give the mechanism and a concrete example from their system, not the slogan.
