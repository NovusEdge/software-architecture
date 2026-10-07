# Testing strategy

How a test suite should be shaped so that it catches regressions quickly and stays trustworthy, and which kinds of test protect architectural properties: contracts between services, invariants, and the transitions between versions. Fitness functions are in [decisions-and-documentation.md](decisions-and-documentation.md); model evaluations are in [llm-systems.md](llm-systems.md).

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Test at several granularities, with most tests small and fast

**Claim.** Write tests at different levels of scope, with many narrow, fast tests and progressively fewer broad ones. Broad end-to-end tests are slow, flaky and expensive to maintain, so they should check that the pieces connect, not cover every case.

**Why it holds.** A suite of 2,000 unit tests that runs in 30 seconds gives feedback on every save and points at the function that broke. Covering the same cases through a browser takes hours, fails for reasons unrelated to the change (a timeout, a slow container), and when it fails, says only that something somewhere is wrong. Google targets roughly 80 percent unit, 15 percent integration and 5 percent end-to-end tests by count.

**When it does not apply.** The pyramid assumes broad tests are slow and brittle; where they are fast and reliable, fewer narrow tests are needed. Kent C. Dodds's "testing trophy" argues for most tests at the integration level, because "the more your tests resemble the way your software is used, the more confidence they can give you", and heavily mocked unit tests can pass while the real integration is broken. What a "unit" is varies by team; the durable rule is the trade between scope, speed and diagnostic precision, not a particular ratio.

**Sources.**
- [V] Martin Fowler, "TestPyramid": "a balanced portfolio" with "many more low-level UnitTests than high level BroadStackTests running through a GUI"; UI tests are brittle, expensive and slow; the concept is from Mike Cohn's Succeeding with Agile (2009); if high-level tests are fast and reliable, the argument weakens (extraction). https://martinfowler.com/bliki/TestPyramid.html (fetched 2026-10-08)
- [V] Ham Vocke, "The Practical Test Pyramid" (martinfowler.com, 2018-02-26): keep two things from Cohn's pyramid: "Write tests with different granularity" and "The more high-level you get the fewer tests you should have" (extraction). https://martinfowler.com/articles/practical-test-pyramid.html (fetched 2026-10-08)
- [V] Software Engineering at Google, chapter 11 "Testing Overview": a target of roughly "80% unit tests, 15% integration tests, and 5% end-to-end tests" (extraction). https://abseil.io/resources/swe-book/html/ch11.html (fetched 2026-10-08)
- [V] Kent C. Dodds, "The Testing Trophy and Testing Classifications": "The more your tests resemble the way your software is used, the more confidence they can give you" (extraction). https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications (fetched 2026-10-08)

**Reviewer checks.**
- How long does the suite that runs on every change take, and does it run on every change?
- Are the broad tests limited to checking that components connect, with case coverage pushed down to faster tests?
- Do heavily mocked tests exist for behaviour that only matters in integration?

## Keep tests hermetic and fix flakiness as a defect

**Claim.** Classify tests by the resources they may use (a single process with no I/O; localhost only; anything), keep the frequently run suites hermetic, and treat any flaky test as a defect to fix or remove.

**Why it holds.** A test that depends on the network, the clock or shared state can fail without any code change, and every such failure costs an investigation. At 0.1 percent flakiness across 10,000 tests run daily, about ten false failures appear each day. Once people learn that red often means nothing, they re-run until green and stop trusting the suite, which is when real regressions get through. Limiting what small tests may touch (no sleeps, no network, no shared files) removes most sources of flakiness by construction.

**When it does not apply.** Some properties are only observable with real infrastructure (a database's locking, a cloud provider's quotas); those need large tests, run less often, with their flakiness tracked rather than tolerated.

**Sources.**
- [V] Software Engineering at Google, chapter 11: small tests "run in a single process" without I/O, sleep or network; medium tests may use multiple processes and network calls to localhost; large tests may span machines. At "0.1% flakiness with 10,000 daily tests" teams investigate about ten false failures a day (extraction). https://abseil.io/resources/swe-book/html/ch11.html (fetched 2026-10-08)

**Reviewer checks.**
- Which tests use the network, real time or shared state, and do they run on every change?
- Is flakiness measured, and is a flaky test treated as a bug with an owner?

## Contract tests at service boundaries

**Claim.** Verify each integration point by checking each side in isolation against a shared, executable contract. In consumer-driven contract testing, consumers' tests generate the contract (the requests they make and the responses they rely on) and the provider's build verifies it.

**Why it holds.** Unit tests on each side use test doubles for the other side, and the doubles drift: the provider renames a field, its own tests pass, the consumer's tests pass against the old double, and production breaks. A contract generated from what consumers actually use, and verified against the real provider in its build, fails on the provider's pull request that would break a consumer. It also tells the provider which fields nobody uses, so they can change freely, which is a practical answer to Hyrum's law (see [boundaries.md](boundaries.md)).

**When it does not apply.** Contract tests check message shape and agreed examples, not end-to-end behaviour or performance. With one consumer and one provider in the same repository and release, a direct integration test is simpler. Public APIs with unknown consumers cannot collect contracts from them; a schema compatibility check (see [api-versioning.md](api-versioning.md)) is the substitute.

**Sources.**
- [V] Pact documentation: "Contract testing is a technique for testing an integration point by checking each application in isolation to ensure the messages it sends or receives conform to a shared understanding that is documented in a 'contract'." In consumer-driven contracts only the interactions consumers actually use are tested, leaving providers free to change the rest (extraction). https://docs.pact.io/ (fetched 2026-10-08)
- [V] Martin Fowler, "ContractTest" (2011-01-12): contract tests check that calls against test doubles "return the same results as a call to the external service would" (extraction). https://martinfowler.com/bliki/ContractTest.html (fetched 2026-10-08)

**Reviewer checks.**
- For each cross-team or cross-service interface, what test fails when the provider breaks a consumer, and in whose build does it fail?
- Do test doubles of external services get checked against the real service?

## Property-based tests for invariants

**Claim.** For logic with clear invariants (serialisation round-trips, ordering, conservation of totals, idempotency), state the property and let a tool generate many random inputs, including edge cases, and shrink any failure to a minimal example.

**Why it holds.** Example-based tests check the cases the author thought of; bugs live in the ones they did not. A property such as "decoding an encoded value returns the original value" or "applying the same event twice gives the same state as applying it once" can be checked against thousands of generated inputs: empty strings, Unicode, huge numbers, duplicate keys. The idempotency and compatibility rules elsewhere in this reference are properties, and this is the cheapest way to test them.

**When it does not apply.** Properties are harder to write than examples, and weak properties ("does not crash") find little. Slow systems under test limit how many cases can run. Generated inputs need generators that produce valid domain data, which is real work for complex types.

**Sources.**
- [V] Koen Claessen and John Hughes, "QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs" (ICFP 2000): "QuickCheck is a tool which aids the Haskell programmer in formulating and testing properties of programs. Properties are described as Haskell functions, and can be automatically tested on random input, but it is also possible to define custom test data generators." https://www.cs.tufts.edu/~nr/cs257/archive/john-hughes/quick.pdf (fetched 2026-10-08)
- [V] Hypothesis documentation: "With Hypothesis, you write tests which should pass for all inputs in whatever range you describe, and let Hypothesis randomly choose which of those inputs to check - including edge cases you might not have thought about" (extraction). https://hypothesis.readthedocs.io/en/latest/ (fetched 2026-10-08)
- [U] Shrinking to a minimal failing example is a standard feature of QuickCheck and Hypothesis but was not on the pages read.

**Reviewer checks.**
- Which invariants does the design rely on (round-trips, idempotency, conservation, ordering), and is each tested as a property?
- Are serialisers tested by round-tripping generated values, including old versions?

## Test the transitions, not only the states

**Claim.** Test what happens between versions and during recovery: mixed old and new code running together, rollback after a partial deploy, replay of in-flight workflows against new code, restore from backup, and failover. These transitions are where architectural assumptions break.

**Why it holds.** Most test environments run one instance of each service and deploy all at once, so a version mix never occurs in testing, and a change that breaks when old and new servers coexist passes every test. Amazon's upgrade-downgrade test deploys to half the fleet, completes the deploy, then rolls back, with traffic running throughout. The same logic applies to workflow replay tests, backup restore drills and failover rehearsals: each exercises a path that otherwise runs for the first time during an incident.

**When it does not apply.** Systems deployed atomically, with downtime accepted, have no mixed-version state to test. Restore drills for data that can be regenerated cheaply are lower priority than for data that cannot [I].

**Sources.**
- [V] Amazon Builders' Library, "Ensuring rollback safety during deployments": upgrade-downgrade testing; test environments once had "only one server each" so "all deployments were atomic which precluded the possibility of running different versions of the software concurrently"; the three-stage test deploys to about half the fleet, completes, then rolls back. https://web.archive.org/web/20231228212327id_/https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/ (fetched 2026-10-08)
- [V] Temporal documentation, Python versioning: "To determine whether your Workflow needs a patch ... you should incorporate Replay Testing." https://docs.temporal.io/develop/python/versioning (fetched 2026-10-07)

**Reviewer checks.**
- Do test environments run multiple instances per service and use the same rollout configuration as production?
- Is rollback tested, not just deploy?
- When was a backup last restored and the result checked?
