# Failure is normal

How remote calls fail, and the patterns that keep one failing dependency from taking the caller down with it. Overload, queues and blast radius are in [overload.md](overload.md).

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## The fallacies of distributed computing

**Claim.** Eight assumptions that hold on one machine are false across a network: the network is reliable; latency is zero; bandwidth is infinite; the network is secure; topology does not change; there is one administrator; transport cost is zero; the network is homogeneous.

**Why it holds.** Code written with local-call habits has no branch for the cases that only appear across a network. A function call either returns or throws; a remote call can also hang forever, return after the caller gave up, succeed while its reply is lost, or reach a different server than last time because DNS changed. Each fallacy names a class of these cases. "Latency is zero" produces a page that makes 200 sequential calls and takes 10 seconds once each call costs 50 ms.

**When it does not apply.** Inside one process, calls are in fact reliable and effectively instant. The fallacies apply at every process, VM, container or SaaS boundary, including calls to a cloud API, a model provider or a database on the same host.

**Sources.**
- [V] Peter Deutsch, "The Eight Fallacies of Distributed Computing", as hosted on James Gosling's site: "Essentially everyone, when they first build a distributed application, makes the following eight assumptions. All prove to be false in the long run and all cause big trouble and painful learning experiences." The eight are listed as above. Read through a Wayback Machine capture of 2016-12-19. https://web.archive.org/web/20161219170844id_/http://nighthacks.com/jag/res/Fallacies.html (fetched 2026-10-08)
- [U] The attribution history (Bill Joy and Tom Lyon's first four, Deutsch's extension in 1994, Gosling adding the eighth around 1997) is as given by Wikipedia, which cites no primary document. https://en.wikipedia.org/wiki/Fallacies_of_distributed_computing

**Reviewer checks.**
- For each call that crosses a process boundary, what happens when it hangs, when it fails after doing the work, and when the reply is lost?
- Does any request path make sequential remote calls whose latencies add up past the user's patience?
- Is any traffic trusted because it is on an internal network?

## Timeouts, retries, backoff and jitter

**Claim.** Every remote call needs an explicit timeout, a capped number of retries at a single layer, exponential backoff with jitter between attempts, a budget that limits retries as a share of traffic, and a receiver that tolerates duplicates. Pass the remaining deadline downstream.

**Why it holds.** Without a timeout, a slow dependency holds the caller's threads until the caller also stops responding. Retries are "selfish": the client spends more of the server's capacity to raise its own chance of success, which is fine for rare transient errors and harmful when the server is failing because it is overloaded. Without backoff, failed clients return at the moment the server is weakest; without jitter, clients that failed together retry together. Stacked retries multiply: five layers that each try three times send 3^5 = 243 requests to the database for one user action. A timed-out call may have succeeded, so a retry is safe only if the receiver deduplicates (see [data-and-events.md](data-and-events.md)). Deadline propagation stops downstream services working on requests the caller has already abandoned.

**When it does not apply.** Do not retry errors that will not change on retry: validation errors, authentication failures, quota or spending caps. Retrying at the top of a long stack wastes the work already done below; for cheap operations, retry at one point in the stack. Some APIs tell the client when to retry (a `Retry-After` header); honour that instead of a computed backoff.

**Sources.**
- [V] Marc Brooker, Amazon Builders' Library, "Timeouts, retries, and backoff with jitter", read through a Wayback Machine capture of 2023-12-25: "Retries are 'selfish.' In other words, when a client retries, it spends more of the server's time to get a higher chance of success." On stacked retries: "If each layer retries independently, the load on the database will increase 243x"; "our best practice is to retry at a single point in the stack." "Jitter adds some amount of randomness to the backoff to spread the retries around in time." Timeouts: choose "an acceptable rate of false timeouts (such as 0.1%)" and use "the corresponding latency percentile on the downstream service (p99.9 in this example)". Retry rate limited locally with a token bucket. https://web.archive.org/web/20231225054225id_/https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/ (fetched 2026-10-08)
- [V] Google SRE book, "Handling Overload": a per-request retry budget of up to three attempts and a per-client retry ratio below 10 percent (extraction). https://sre.google/sre-book/handling-overload/ (fetched 2026-10-08)
- [V] Google SRE book, "Addressing Cascading Failures": "Rather than inventing a deadline when sending RPCs to backends, servers should employ deadline propagation." https://sre.google/sre-book/addressing-cascading-failures/ (fetched 2026-10-07)
- [V] Brandur Leach, Stripe blog, "Designing robust and predictable APIs with idempotency" (2017-02-22): clients should "follow something akin to an exponential backoff algorithm"; adding random "jitter" addresses the "thundering herd problem". https://stripe.com/blog/idempotency (fetched 2026-10-08)
- [V] Anthropic API errors page: a spend-cap 429 "has no `retry-after` header and keeps failing until access resumes"; the official SDK retries "twice by default, honoring the `retry-after` header when present". https://platform.claude.com/docs/en/api/errors (fetched 2026-10-07)

**Reviewer checks.**
- Does every network call (including cloud APIs and model APIs) have an explicit timeout derived from the dependency's observed latency?
- Is there exactly one retrying layer per call path, with a cap, exponential backoff and jitter?
- Is there a retry budget or token bucket so retries cannot exceed a fixed share of normal traffic during an outage?
- Which errors are classified as non-retryable?
- Does the deadline shrink as a request passes through layers?

## Circuit breakers

**Claim.** Wrap calls to a dependency in a breaker that counts failures; once they pass a threshold, fail calls immediately for a period without calling the dependency, then let a few probe calls through to test recovery (closed, open, half-open).

**Why it holds.** A dependency that hangs is worse than one that fails, because each waiting call holds a thread or connection until its timeout. If a service makes 100 calls a second to a dependency with a 2-second timeout and the dependency hangs, 200 calls are waiting at any moment, which can exhaust the caller's pool and take it down too. A breaker converts the slow failure into a fast one, frees the caller's resources and stops sending load to a dependency that is trying to recover.

**When it does not apply.** Breakers add state and tuning (threshold, window, probe rate), and they make behaviour modal: the system acts differently when the breaker is open, which is hard to test. On low-volume calls the failure statistics are noisy and the breaker flaps. Amazon reports preferring a local retry token bucket over breakers for this reason. A timeout plus a capped retry is often enough [I].

**Sources.**
- [V] Martin Fowler, "CircuitBreaker": "You wrap a protected function call in a circuit breaker object, which monitors for failures. Once the failures reach a certain threshold, the circuit breaker trips, and all further calls ... return with an error, without the protected call being made at all." States closed, open and half-open; unresponsive suppliers can exhaust callers' resources, "leading to cascading failures". https://martinfowler.com/bliki/CircuitBreaker.html (fetched 2026-10-07)
- [V] Amazon Builders' Library, "Timeouts, retries, and backoff with jitter": "circuit breakers introduce modal behavior into systems that can be difficult to test, and can introduce significant addition time to recovery. We have found that we can mitigate this risk by limiting retries locally using a token bucket." https://web.archive.org/web/20231225054225id_/https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/ (fetched 2026-10-08)
- [V] Netflix Hystrix README: "Hystrix is no longer in active development, and is currently in maintenance mode"; final release 1.5.18; Netflix will use "open and active projects like resilience4j for new internal projects" (extraction). Use the pattern, not this library. https://github.com/Netflix/Hystrix (fetched 2026-10-08)

**Reviewer checks.**
- Which dependencies can hang rather than fail, and what bounds the caller's resources while they do?
- Where a breaker exists, is its open state tested, and is it observable?
- Is the call volume high enough for the breaker's statistics to mean anything?

## Bulkheads

**Claim.** Partition resources (thread pools, connection pools, queues, concurrency limits) per dependency or per workload, so that one exhausting its share cannot consume the rest.

**Why it holds.** With one shared pool of 50 connections, a single slow dependency can hold all 50 and stall calls to healthy dependencies too. With a pool of 10 per dependency, the slow one stalls only its own 10. The same holds for tenants: a per-tenant concurrency limit means one tenant's flood waits in its own queue. The name comes from the watertight compartments in a ship's hull.

**When it does not apply.** Partitioned resources are used less efficiently: idle capacity in one pool cannot serve another. When utilisation matters more than isolation, or the system has one dependency, the complexity is not justified.

**Sources.**
- [V] Azure Architecture Center, "Bulkhead pattern": "Isolate the elements of an application into pools so that if one element fails, the others continue to function"; one connection pool per downstream service as the example; not suitable when "less efficient use of resources might not be acceptable"; AI and inference workloads "often require strict bulkheads because of deployment-level quotas and concurrency limits". https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead (fetched 2026-10-07)
- [V] Amazon Builders' Library, "Avoiding insurmountable queue backlogs": "we use separate thread pools for each workload to avoid one workload from consuming all of the available threads." https://web.archive.org/web/20240124001614id_/https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/ (fetched 2026-10-08)

**Reviewer checks.**
- Is there any pool, queue or rate limit shared by workloads of different importance?
- If one tenant, project or dependency misbehaves, what else stops working?

## Prefer a reliable primary path to a rarely used fallback

**Claim.** Fallback logic that runs only during failures is usually untested and often makes outages worse. Invest in the reliability of the primary path; where a second path exists, run it continuously so that it is exercised (which makes it failover, not fallback), or let the caller retry.

**Why it holds.** A fallback runs when the system is already in trouble, under conditions that are hard to reproduce in a test. Amazon's caching article describes a service that falls back to calling its dependency directly when its cache fleet fails: the fallback sends a sudden, never-tested surge to a database that was sized for cache-filtered traffic and takes it down. The fallback has its own failure modes, has not run in months and is triggered at the worst moment. Pushing data ahead of time (credentials pushed to every host and valid for hours) removes the need for a fallback because no remote call is needed at the critical moment.

**When it does not apply.** Some degraded modes are simple enough to be safe: serving the last good cached value until a hard expiry, or a static page. A degraded mode that runs constantly in production (a hedged request, a quorum read) is tested by use. Degradation that is part of normal load shedding (see [overload.md](overload.md)) is planned capacity behaviour, not fallback.

**Sources.**
- [V] Jacob Gabrielson, Amazon Builders' Library, "Avoiding fallback in distributed systems", read through a Wayback Machine capture of 2023-12-28: "At Amazon we have found that spending engineering resources on making the primary (non-fallback) code more reliable usually raises our odds of success more than investing in an infrequently used fallback strategy." "One of the worst things about fallback is that it isn't exercised regularly and is likely to fail or increase the scope of impact when it triggers during an outage." "A service must run both the fallback and the non-fallback logic continuously." The IAM credentials example is from this article. https://web.archive.org/web/20231228195651id_/https://aws.amazon.com/builders-library/avoiding-fallback-in-distributed-systems/ (fetched 2026-10-08)
- [V] Amazon Builders' Library, "Caching challenges and strategies": falling back to the dependency during a cache outage "will cause an atypical spike in traffic to the downstream service, leading to throttling or brownout of that dependent service". https://web.archive.org/web/20231208234417id_/https://aws.amazon.com/builders-library/caching-challenges-and-strategies/ (fetched 2026-10-08)

**Reviewer checks.**
- List every fallback path in the design. When did each last run in production, and what load does it put on what?
- Could data be pushed ahead of time so that the critical path needs no remote call?
- Does any fallback silently change the quality of results users rely on?

## Nygard's stability patterns and antipatterns

**Claim.** Michael Nygard's Release It! catalogues the ways production systems fail and the patterns that contain them. Use the catalogue as a checklist: for each antipattern, name where it could occur in the design and which pattern contains it.

**Why it holds.** Most production failures are not novel; they are instances of a few recurring shapes. An "integration point" (any call to another system) is where most failures enter; "chain reactions" spread a failure across a horizontally scaled tier when the load from a dead node shifts to the survivors; "unbounded result sets" let a query that returned ten rows in testing return ten million in production; "self-denial attacks" are the system's own marketing email sending everyone to one page at once. Naming the shape makes the matching defence obvious: timeouts and circuit breakers at integration points, bulkheads against chain reactions, limits on every query and response, shedding load and back pressure against floods, a governor against automation that acts too fast.

**When it does not apply.** The catalogue targets long-running networked services under production load. A batch job or a single-user tool meets few of these shapes. The patterns cost configuration and testing; apply the ones whose antipattern actually appears in the design.

**Sources.**
- [V] Pragmatic Bookshelf, Release It! Second Edition by Michael Nygard (2018-01): stability antipatterns Integration Points, Chain Reactions, Cascading Failures, Users, Blocked Threads, Self-Denial Attacks, Scaling Effects, Unbalanced Capacities, Dogpile, Force Multiplier, Slow Responses, Unbounded Result Sets; stability patterns Timeouts, Circuit Breaker, Bulkheads, Steady State, Fail Fast, Let It Crash, Handshaking, Test Harnesses, Decoupling Middleware, Shed Load, Create Back Pressure, Governor (extraction of the table of contents). https://pragprog.com/titles/mnee2/release-it-second-edition/ (fetched 2026-10-08)
- [U] The descriptions of each pattern above are from memory of the book; its text was not opened.

**Reviewer checks.**
- Does every query and every list response have a limit?
- Does anything grow without bound over time (logs on local disk, sessions, caches without eviction, temp files), and what removes it (Steady State)?
- Can any automation (autoscaling, cleanup jobs, deploy tooling) act faster or more widely than a human could stop it, and what governs its rate?
- Can a predictable spike the business causes (a launch, an email campaign) overwhelm the system?

## Chaos engineering and rehearsed recovery

**Claim.** Build confidence in failure handling by experiment: state a hypothesis about steady-state output, inject a realistic failure, and check whether the output stays within bounds. Start small, in a controlled environment, and keep the blast radius limited.

**Why it holds.** Recovery paths run rarely, so they rot. A failover script written a year ago references a host that no longer exists; a retry policy assumes an error code the provider changed. Rehearsing failures while stakes are low (kill a worker mid-job, expire a credential, make a dependency return errors) finds the broken paths before an incident does. Measuring steady-state output (orders per minute, successful builds) rather than internals tells you whether users would have noticed.

**When it does not apply.** Do not experiment in production without a rollback, a defined steady state and observability; a system with no baseline metrics cannot be experimented on. For a small team, the first useful step is a scheduled game day in a staging environment, not continuous automated chaos in production.

**Sources.**
- [V] Principles of Chaos Engineering: "Chaos Engineering is the discipline of experimenting on a system in order to build confidence in the system's capability to withstand turbulent conditions in production." Principles: hypothesise about steady-state behaviour; vary real-world events; run in production; automate continuously; "minimize blast radius". https://principlesofchaos.org/ (fetched 2026-10-07)
- [V] AWS Well-Architected Reliability Pillar, design principles: "Test recovery procedures" by simulating failures. https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/design-principles.html (fetched 2026-10-07)

**Reviewer checks.**
- Which failure has been rehearsed (not only reasoned about) recently, and what did it show?
- Is there a defined steady-state metric that would show user impact during an experiment?
- Is every documented recovery procedure run on a schedule?
