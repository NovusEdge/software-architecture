# Schema, data and stored-format evolution

How to change database schemas, message formats and serialised data while old and new code run side by side, and while data written years ago must still be read. Public API versioning is in [api-versioning.md](api-versioning.md).

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Expand, migrate, contract

**Claim.** Make an incompatible change to an interface or schema in three separately released steps: expand (add the new form beside the old), migrate (move every user and every row to the new form), contract (remove the old form). Each step is safe to release and to roll back on its own.

**Why it holds.** Renaming a column `fullname` to `display_name` in one release breaks every running instance of the old code the moment the migration runs, and a rollback of the code cannot read the renamed column. In three steps: add `display_name` and write both columns; backfill old rows and switch readers to `display_name`; once nothing reads `fullname`, drop it. At every point, the old and new code both work against the schema as it stands. The same applies to function signatures, API fields and message formats.

**When it does not apply.** When every reader and writer deploys atomically together (a single process with an embedded database, a script) and downtime is acceptable, a single-step change is simpler. The contract step is often forgotten, leaving both forms forever; it needs an owner and a condition ("when no reader of `fullname` remains").

**Sources.**
- [V] Danilo Sato, "ParallelChange" on martinfowler.com (2014-05-13): "Parallel change, also known as expand and contract, is a pattern to implement backward-incompatible changes to an interface in a safe manner, by breaking the change into three distinct phases: expand, migrate, and contract" (extraction). https://martinfowler.com/bliki/ParallelChange.html (fetched 2026-10-08)
- [V] Pramod Sadalage and Martin Fowler, "Evolutionary Database Design" (rewritten 2016-05): all database changes are migrations kept in version control; a transition phase lets old and new structures coexist, for example a view with the old table name while consumers move (extraction). https://martinfowler.com/articles/evodb.html (fetched 2026-10-08)

**Reviewer checks.**
- For each planned schema or interface change, can old code run against the new schema and new code against the old one?
- Is every pending contract step tracked with an owner and a removal condition?
- Are schema migrations versioned in the repository and applied by automation, not by hand?

## Know which direction of compatibility each change needs

**Claim.** Backward compatibility means new readers can read data written in the old format; forward compatibility means old readers can read data written in the new format. The direction determines the order of deployment: backward-compatible changes deploy readers first, forward-compatible ones deploy writers first, fully compatible ones in any order.

**Why it holds.** During a rolling deploy, and for as long as old data exists, both versions coexist. Adding an optional field is backward compatible (new readers treat it as absent in old data) and forward compatible only if old readers ignore unknown fields. Removing a field that old readers require breaks them as soon as a new writer omits it. Schema registries encode this as a rule checked at publish time so that an incompatible schema cannot be registered. For stored data that lives for years, compatibility must hold across every version still present, not just the previous one ("transitive" compatibility).

**When it does not apply.** If all data is rewritten during the change and all readers and writers stop and restart together, compatibility in either direction is unnecessary. Ephemeral messages that expire in minutes need compatibility only across the deploy window [I].

**Sources.**
- [V] Confluent Schema Registry documentation, "Schema Evolution and Compatibility": BACKWARD: "consumers using new schema can read data written with old schema"; FORWARD: "consumers using old schema can read data written with new schema"; FULL is both; transitive variants extend the check to all earlier versions. Upgrade order: BACKWARD, consumers first; FORWARD, producers first; FULL, independently (extraction). https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html (fetched 2026-10-08)

**Reviewer checks.**
- For each stored or transmitted format, which compatibility direction is required, and is it checked automatically?
- What is the oldest data the current code must read, and is there a test that reads it?
- Do readers ignore unknown fields, and do writers preserve fields they do not understand when rewriting a record?

## Make every deploy safe to roll back (two-phase deployment)

**Claim.** Before deploying a change, make sure the previous version can run against anything the new version writes. For a change in how data is written, first deploy readers that understand both old and new formats ("prepare"), wait, then deploy writers that produce the new format ("activate").

**Why it holds.** The most common reason a deploy cannot be rolled back is a protocol change. If version 2 starts writing compressed data and is rolled back, version 1 cannot read what version 2 wrote. Subtle changes count: raising a heartbeat interval from 5 to 10 seconds makes old servers that expect a heartbeat every 5 seconds close connections to new ones during the rollout. With two phases, each phase can be rolled back safely: after "prepare" nothing new has been written; after "activate", the rolled-back code is the "prepare" version, which reads both formats. The reader-capability step must reach every server before activation, and the old format can be dropped only after every record has been rewritten (backfill).

**When it does not apply.** Changes that do not alter anything another version reads (internal refactors, new endpoints nobody calls yet) do not need two phases. Serialisers that preserve unknown fields when rewriting data remove the need for two phases for additive changes.

**Sources.**
- [V] Sandeep Pokkunuri, Amazon Builders' Library, "Ensuring rollback safety during deployments", read through a Wayback Machine capture of 2023-12-28: "We found that the most common reason for not being able to roll back is a change of protocol"; the compression and heartbeat examples; two-phase deployment with "Prepare" and "Activate" phases; "we explicitly verify that all the servers have picked up the change in the Prepare phase"; a bake period of "usually a few days" between phases; old-format reading can be removed only after "backfilling"; "readers go before writers while rolling forward whereas writers go before readers while rolling backward". https://web.archive.org/web/20231228212327id_/https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/ (fetched 2026-10-08)

**Reviewer checks.**
- For each change to a stored or exchanged format, can the previous version read what the new version writes?
- Is there an upgrade-downgrade test: deploy to half the fleet, complete, roll back, with traffic running throughout?
- Do test environments run more than one instance per service, so that mixed-version states actually occur in testing?

## Version stored data explicitly and use an established serialisation format

**Claim.** Store a format or schema version with every serialised record or message, read every version still in storage, and use a serialisation framework with defined evolution rules rather than a hand-written format or language-native object serialisation.

**Why it holds.** A version field turns "what format is this?" from a guess into a lookup, so a reader can choose the right parser and an operator can count how much data is still in an old format. Established formats (Protocol Buffers, Avro, JSON with a schema) define what happens to missing and unknown fields, and track whether a field was set or defaulted. Language-native serialisation (Java object serialisation, Python pickle) ties stored data to the class layout of one library version, so a runtime or library upgrade can make old data unreadable.

**When it does not apply.** Short-lived data in a single process (an in-memory cache with no persistence) does not outlive its code. A version field adds a few bytes and a branch; for formats that will never change (a fixed external standard) the format's own identifier is enough [I].

**Sources.**
- [V] Amazon Builders' Library, "Ensuring rollback safety during deployments": prefer established frameworks such as "JSON, Protocol Buffers, Cap'n Proto, and FlatBuffers" over custom serialisation; "We also store the serializer version with the serialized data or in the metadata"; reflection-based serialisation of Java collections can fail after a JDK upgrade; "our serializers retain unknown attributes while writing back the data". https://web.archive.org/web/20231228212327id_/https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/ (fetched 2026-10-08)
- [V] Amazon Builders' Library, "Caching challenges and strategies": "Cached data is treated as if it were in a persistent store. We ensure that updated software can always read data that a previous version of the software wrote, and that older versions can gracefully handle seeing new formats/fields." https://web.archive.org/web/20231208234417id_/https://aws.amazon.com/builders-library/caching-challenges-and-strategies/ (fetched 2026-10-08)

**Reviewer checks.**
- Does every stored record, event and message carry a format version?
- Is any persisted data written with language-native object serialisation?
- Is there a metric or query showing how much stored data is in each format version?
