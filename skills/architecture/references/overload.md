# Overload, isolation and blast radius

What happens when demand exceeds capacity, how to keep a system useful while it does, and how to limit how many users one failure can reach. Single-call patterns (timeouts, retries, breakers, bulkheads) are in [failure.md](failure.md); the arithmetic of queues is in [queueing-and-capacity.md](queueing-and-capacity.md).

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Cascading failure

**Claim.** Overload spreads by positive feedback: slower responses cause timeouts, timeouts cause retries, retries add load, and added load slows responses further. Only something that removes load breaks the loop.

**Why it holds.** Suppose one of four servers fails. Its traffic moves to the other three, each now running at 133 percent of its previous load. If they were at 80 percent utilisation, they are now past capacity, latency rises, clients time out and retry, and the extra retries push the next server over. The failure that started with one machine ends with none. Adding capacity into a loop that is already running often does not help, because new servers are overwhelmed as they start (and caches on them are cold).

**When it does not apply.** Systems with large headroom and no retries can absorb the loss of a node without feedback. The loop needs a shared resource and a source of amplification; remove either and the cascade stops.

**Sources.**
- [V] Google SRE book, "Addressing Cascading Failures": "A cascading failure is a failure that grows over time as a result of positive feedback." Causes include server overload, resource exhaustion and retries. https://sre.google/sre-book/addressing-cascading-failures/ (fetched 2026-10-07)

**Reviewer checks.**
- If one instance of each tier fails at peak, does the remaining capacity carry the load with room to spare?
- What in the design removes load when the system is saturated (shedding, back pressure, short queues), and what adds it (retries, health-check restarts, cold caches)?

## Load shedding and goodput

**Claim.** When a server approaches overload, reject excess requests early and cheaply so that the requests it accepts finish before their clients time out. Measure goodput (requests served correctly and fast enough to be useful), not throughput.

**Why it holds.** A server at 150 percent of capacity that accepts everything serves every request slowly; if each takes longer than the client's timeout, all of them are wasted and goodput is zero even though the server is busy. A server that rejects a third of requests at the door in microseconds serves the remaining two thirds within the timeout. Graceful degradation is a softer form: return cheaper, less complete answers under load. Per-customer quotas and request criticality decide what is rejected first.

**When it does not apply.** Work that cannot be dropped (a payment, a user's saved document) should be delayed or rejected with a clear, retryable error and kept durably, not silently discarded [I]. Shedding interacts badly with CPU-based autoscaling: if shedding holds CPU below the scaling threshold, the autoscaler never sees the overload. Rejected requests return fast and can make median latency look excellent while successful requests are slow; report latency for successful requests separately.

**Sources.**
- [V] David Yanacek, Amazon Builders' Library, "Using load shedding to avoid overload", read through a Wayback Machine capture of 2024-01-07: "Goodput is the subset of the throughput that is handled without errors and with low enough latency for the client to make use of the response." "The goal of load shedding is to keep latency low for the requests that the server decides to accept so that the service replies before the client times out." "If they haven't load tested their service to the point where it breaks, and far beyond the point where it breaks, they should assume that the service will fail in the least desirable way possible." Also the warnings about autoscaling and polluted latency metrics. https://web.archive.org/web/20240107143427id_/https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/ (fetched 2026-10-08)
- [V] Google SRE book, "Handling Overload": "One option for handling overload is to serve degraded responses: responses that are not as accurate as or that contain less data than normal responses, but that are easier to compute." Per-customer quotas and request criticality decide what to reject. https://sre.google/sre-book/handling-overload/ (fetched 2026-10-07)

**Reviewer checks.**
- Where in each request path is excess load rejected, and how cheap is the rejection?
- Which requests are shed first, by what rule (criticality, tenant quota)?
- Has the system been load tested past its breaking point, and does goodput stay flat or collapse?
- Is the latency of successful requests reported separately from rejected ones?

## Back pressure and bounded queues

**Claim.** Bound every queue and buffer. When a consumer cannot keep up, signal the producer to slow down or reject new work, rather than letting the buffer grow.

**Why it holds.** An unbounded queue converts overload into latency and memory, both without limit. A producer writing 1,000 messages a second to a consumer that handles 800 grows the queue by 200 a second, 720,000 an hour; each new message waits behind all of them, and eventually the process runs out of memory. A bounded queue makes the overload visible immediately, at the producer, where it can be handled (slow down, shed, tell the user). Short queues (the SRE book suggests about half the thread pool size or less) also bound the time any accepted request waits.

**When it does not apply.** Some businesses prefer to accept work and process it late: Amazon's order processing accepts orders even when a backlog builds, and prioritises behind the scenes. That is a deliberate choice with durable storage and prioritisation, not an unbounded in-memory buffer. Back pressure on a shared queue penalises every producer on it, including innocent ones; per-workload queues make it fair.

**Sources.**
- [V] Reactive Streams: "The purpose of Reactive Streams is to provide a standard for asynchronous stream processing with non-blocking backpressure"; the receiving side must not be "forced to buffer arbitrary amounts of data" (extraction). https://github.com/reactive-streams/reactive-streams-jvm (fetched 2026-10-08)
- [V] Amazon Builders' Library, "Avoiding insurmountable queue backlogs": "If a workload is driving an unreasonable backlog that the consumer is unable to keep up with, many of our systems automatically start rejecting work more aggressively in the producer." "Backpressure is not suitable for all systems at Amazon. For example, in systems that perform order processing for amazon.com, we tend to prefer to accept orders even if a backlog builds up." https://web.archive.org/web/20240124001614id_/https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/ (fetched 2026-10-08)
- [V] Google SRE book, "Handling Overload": keep queues short, about 50 percent of thread pool size or less, so overload is rejected early (extraction). https://sre.google/sre-book/handling-overload/ (fetched 2026-10-07)

**Reviewer checks.**
- Is every queue, channel, buffer and pool bounded, and what happens at the bound: reject, shed oldest, block the producer, or grow?
- Does the producer learn about consumer overload, and how quickly?
- Do workloads of different importance share a queue?

## Queue backlogs are bimodal

**Claim.** A queue-based system has two modes: fast, with no backlog, and slow, once arrivals have exceeded processing for a while. Recovery from the slow mode needs surplus capacity for a long time, so design to avoid entering it and to serve fresh work first when it does.

**Why it holds.** After a one-hour outage, a system that normally runs at full processing capacity has an hour of backlog plus new arrivals; clearing it requires double capacity for another hour. If a spike queues ten times consumer capacity and it takes 30 minutes for an operator to react, recovery can take hours. Meanwhile every new message waits behind the backlog, so even users unaffected by the original problem see hours of delay. Processing the newest messages first (sidelining old ones to a separate queue), per-workload queues and dead-letter queues for messages that cannot be processed keep the fast path fast.

**When it does not apply.** Work whose order matters (a ledger of balance changes) cannot be reordered freely. Work whose value expires (a status update superseded by a later one) can be dropped instead of sidelined [I].

**Sources.**
- [V] Amazon Builders' Library, "Avoiding insurmountable queue backlogs", read through a Wayback Machine capture of 2024-01-24: "a queue-based system has two modes of operation, or bimodal behavior"; when arrivals exceed processing "it quickly flips into a more sinister operating mode"; "recovering from the outage requires double the system's capacity for another hour after the recovery". Counter-measures: per-customer fairness limits, sidelining excess and old traffic to approximate LIFO, back pressure, dead-letter queues, per-workload concurrency limits. https://web.archive.org/web/20240124001614id_/https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/ (fetched 2026-10-08)

**Reviewer checks.**
- After an hour of consumer outage, how long does recovery take, and what do new requests experience meanwhile?
- Is the age of the oldest message monitored, not only queue depth?
- Where do messages that always fail go, and does anyone alarm on them?

## Static stability

**Claim.** Design so that the system keeps working, at its current capacity, when a dependency it would use to change state (a control plane, a scheduler, a configuration service) is impaired. Pre-provision for failures rather than reacting to them.

**Why it holds.** The machinery used to recover (launching instances, fetching configuration, updating DNS) is most likely to be failing at the moment you need it, because the same event that broke your service often broke it too, and everyone else is calling it at once. A service that runs in three zones with enough spare capacity that two zones can carry full load survives a zone loss without launching anything. One that relies on autoscaling to replace the lost zone depends on the launch system working during a zone outage.

**When it does not apply.** Spare capacity costs money; for workloads where an outage is tolerable, the price may exceed the value. Static stability is about recovery; it does not remove the need to handle the dependency failure itself.

**Sources.**
- [V] Amazon Builders' Library, "Static stability using Availability Zones": "In a statically stable design, the overall system keeps working even when a dependency becomes impaired." The article recommends pre-provisioning capacity so that surviving a zone failure needs no new launches. https://aws.amazon.com/builders-library/static-stability-using-availability-zones/ (fetched 2026-10-07; capture of 2023-12-20 also read 2026-10-08 at https://web.archive.org/web/20231220041047id_/https://aws.amazon.com/builders-library/static-stability-using-availability-zones/)

**Reviewer checks.**
- When the control plane (scheduler, workflow server, cloud API, secret store, configuration service) is down, do already-running workloads continue?
- Does recovery from the loss of one zone or node depend on launching something new?
- Are credentials and configuration cached locally with enough lifetime to ride out an outage of their source?

## Cells

**Claim.** Partition a workload into independent, complete copies (cells), each serving a subset of customers chosen by a partition key, behind a thin routing layer. A failure, a bad deploy or a poison request then affects one cell's customers.

**Why it holds.** With ten cells serving ten percent of customers each, a bad deploy rolled out one cell at a time hurts ten percent of customers before it is caught, not all of them. A poison request that crashes servers crashes only the cell its customer is routed to. The router must be the "thinnest possible layer", because it is the one shared component left.

**When it does not apply.** Cells need a partition key that matches the natural grain of the workload, with few cross-cell interactions; data that every request must see globally does not split this way. Cell migration, rebalancing and a control plane are real engineering. For a small system, separate pools per tenant class or a per-tenant concurrency cap give much of the benefit [I].

**Sources.**
- [V] AWS whitepaper, "Reducing the Scope of Impact with Cell-Based Architecture": "A cell-based architecture uses multiple isolated instances of a workload, where each instance is known as a cell. Each cell is independent, does not share state with other cells, and handles a subset of the overall workload requests." "If a workload uses 10 cells to service 100 requests, when a failure occurs in one cell, 90% of the overall requests would be unaffected by the failure." The cell router is "the thinnest possible layer". The partition key "needs to align with the grain of the service". https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/what-is-a-cell-based-architecture.html (fetched 2026-10-08)
- [V] Azure Architecture Center, "Bulkhead pattern": the approach is "also known as a cell-based architecture". https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead (fetched 2026-10-07)

**Reviewer checks.**
- What fraction of customers does one bad deploy or one poison request reach?
- Are deploys rolled out through isolation boundaries one at a time?
- What is shared by all customers, and how thin is it?

## Shuffle sharding

**Claim.** Assign each customer to a small, pseudo-random combination of workers rather than to one fixed shard. A problem caused by one customer then fully affects only the customers who share its exact combination, which is few or none.

**Why it holds.** With eight workers split into four fixed shards of two, a customer whose requests crash workers takes down its shard and 25 percent of customers with it. With shuffle sharding, each customer gets its own pair of the eight workers; there are 28 possible pairs, so the bad customer fully affects about 1/28 of customers, and others who share one of its two workers keep working on the other, provided clients retry against the second worker. Amazon Route 53 gives each domain four of 2,048 virtual name servers, which yields about 730 billion combinations.

**When it does not apply.** It needs many customers, several workers per customer, and clients that retry against another worker; without client retries a shared worker is still an outage. With few tenants the combinatorics give little; a per-tenant limit is simpler [I].

**Sources.**
- [V] Colm MacCárthaigh, Amazon Builders' Library, "Workload isolation using shuffle-sharding", read through a Wayback Machine capture of 2023-12-28: "With eight workers, there are 28 unique combinations of two workers, which means that there are 28 possible shuffle shards. If we have hundreds or more of customers, and we assign each customer to a shuffle shard, then the scope of impact due to a problem is just 1/28th. That's 7 times better than regular sharding." Clients must be "fault tolerant and can work around this (with retries for example)". Route 53: "2048 virtual name servers", four per domain, "730 billion possible shuffle shards". https://web.archive.org/web/20231228213255id_/https://aws.amazon.com/builders-library/workload-isolation-using-shuffle-sharding/ (fetched 2026-10-08)

**Reviewer checks.**
- Can one customer's traffic or poison input reach every worker?
- If customers are spread over workers, do clients retry against a different worker?
