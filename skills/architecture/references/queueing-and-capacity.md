# Queueing, capacity and cost

The arithmetic behind latency under load, how to find out what a system can carry, how much spare to keep, and how to make cost a design input rather than a surprise.

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Little's law

**Claim.** In a stable system, the average number of requests in flight equals the arrival rate times the average time each spends in the system (L = λW).

**Why it holds.** Every request that arrives stays for W seconds on average, so at any moment the system holds the last W seconds' worth of arrivals. A server handling 100 requests a second at 100 ms each has about 10 in flight, so about 10 threads busy. If a dependency slows and latency rises to 10 seconds while arrivals stay at 100 a second, 1,000 requests are in flight, which exhausts a pool of 200 threads. This is why a slow dependency is more dangerous than a failing one, and why concurrency limits must be set with latency in mind.

**When it does not apply.** It describes long-run averages of a stable system (arrivals do not exceed capacity indefinitely). It says nothing about the distribution: the average number in flight can be fine while bursts exceed a pool. During an overload, when the queue grows without bound, there is no steady state to apply it to.

**Sources.**
- [V] Amazon Builders' Library, "Avoiding insurmountable queue backlogs": "Little's Law, which states that the concurrency in a system is equal to the arrival rate multiplied by the average latency of each request. For example, if a server was processing 100 messages / sec at 100 ms average, it would consume 10 threads on average. If the latency suddenly spiked to 10 seconds, it would suddenly use 1,000 threads". It cites J. D. C. Little, "A Proof for the Queuing Formula: L = λW" (1961). https://web.archive.org/web/20240124001614id_/https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/ (fetched 2026-10-08)
- [U] Little's 1961 paper (Operations Research 9(3)) was not opened.

**Reviewer checks.**
- For each pool and concurrency limit, what latency of its dependency would exhaust it at peak arrival rate?
- Is any concurrency limit sized from average latency when tail latency is what fills it?

## Utilisation and latency

**Claim.** As a resource's utilisation approaches 100 percent, waiting time grows without bound, and it grows steeply well before 100 percent. Plan for latency-sensitive resources to run well below full utilisation.

**Why it holds.** In the simplest queueing model (one server, random arrivals, random service times, M/M/1), the mean time in system is 1/(μ − λ), where μ is the service rate and λ the arrival rate. With a service rate of 100 a second, response time is 20 ms at 50 percent utilisation, 100 ms at 90 percent and 1 second at 99 percent. Real systems differ in detail, but the shape (flat, then a sharp knee) holds whenever arrivals are bursty. A dashboard showing "CPU at 85 percent, fine" may be showing a service that is about to triple its latency on a 10 percent traffic increase [I].

**When it does not apply.** Batch and throughput-oriented work (nightly jobs, offline training) should run near full utilisation, because nobody waits on an individual item. Perfectly regular arrivals and service times (rare in practice) push the knee much closer to 100 percent.

**Sources.**
- [V] Wikipedia, "M/M/1 queue": "We write ρ = λ/μ for the utilization of the buffer and require ρ < 1 for the queue to be stable"; the average time in system is 1/(μ − λ) and the average number in system is ρ/(1 − ρ) (extraction). https://en.wikipedia.org/wiki/M/M/1_queue (fetched 2026-10-08)
- [I] The worked numbers (20 ms, 100 ms, 1 s) are computed from that formula.
- [V] Google SRE book, Introduction: "Software systems become slower as load is added to them. A slowdown in a service equates to a loss of capacity" (extraction). https://sre.google/sre-book/introduction/ (fetched 2026-10-08)

**Reviewer checks.**
- What utilisation do latency-sensitive resources run at during peak, and what does the latency curve look like above it?
- Are capacity targets set as a utilisation ceiling with headroom, or as "add capacity when it is full"?

## Find capacity by load testing to the breaking point

**Claim.** Know each service's capacity from measurement: load test with realistic traffic until it breaks and past that point, and model capacity in the resources it consumes (CPU, memory, connections), not only in requests per second.

**Why it holds.** Capacity estimated from a design is a guess about which resource runs out first. Load testing finds the real bottleneck (often a connection pool, a lock or a downstream quota, not CPU) and shows how the service fails: gracefully, with goodput flat, or by collapsing to zero. Requests are not uniform: a search that scans 10,000 rows and one that reads a single key both count as one request, and their mix changes over time, so "requests per second" capacity drifts while CPU-cores capacity does not.

**When it does not apply.** A system with tiny, predictable load and a generous margin can skip formal load testing until growth makes the margin uncertain [I]. Load tests in shared environments can harm other tenants or downstream services; test a dependency's limits only with its owner's agreement.

**Sources.**
- [V] Amazon Builders' Library, "Using load shedding to avoid overload": "The ideal load test result is for goodput to plateau when the service is close to being fully utilized, and to remain flat even when more throughput is applied." Measure "client-perceived availability and latency in addition to server-side availability and latency." https://web.archive.org/web/20240107143427id_/https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/ (fetched 2026-10-08)
- [V] Google SRE book, "Handling Overload": rather than queries per second, "measure capacity directly in available resources", because "different queries can have vastly different resource requirements" (extraction). https://sre.google/sre-book/handling-overload/ (fetched 2026-10-08)
- [V] Google SRE book, Introduction: capacity planning requires "Regular load testing of the system to correlate raw capacity (servers, disks, and so on) to service capacity" (extraction). https://sre.google/sre-book/introduction/ (fetched 2026-10-08)

**Reviewer checks.**
- What is each service's measured capacity, and which resource runs out first?
- Has each service been tested past its limit, and how does it fail there?
- Do the load tests use a realistic mix of request types?

## Headroom for failure and growth

**Claim.** Provision so that the system meets its targets at forecast peak with its largest likely failure (one instance, one zone) already subtracted, and plan for both organic growth and step changes such as launches.

**Why it holds.** Capacity that is sufficient only when everything is healthy is not sufficient, because the moment of peak load is also when failures are most expensive and most likely to cascade (see [overload.md](overload.md)). A service in three zones running at 70 percent of total capacity has 105 percent load on the remaining two zones after losing one, which is an outage. At 60 percent it has 90 percent, which survives. Launches and marketing campaigns move demand in steps that trend-based forecasts do not predict.

**When it does not apply.** Headroom costs money continuously. For non-critical traffic (crawlers, background jobs) a business may choose to shed rather than provision; Amazon notes this must be explicit, tested and known to clients, or a zone failure looks like a critical outage. Elastic capacity reduces the need for idle headroom only if scaling is fast enough and does not depend on a control plane that may fail at the same time (static stability).

**Sources.**
- [V] Google SRE book, Introduction: capacity planning must account for "organic growth (which stems from natural product adoption and usage by customers) and inorganic growth (which results from events like feature launches, marketing campaigns, or other business-driven changes)" (extraction). https://sre.google/sre-book/introduction/ (fetched 2026-10-08)
- [V] Amazon Builders' Library, "Using load shedding to avoid overload": "Services are scaled to a point where an Availability Zone's worth of their capacity can become unavailable while preserving our latency goals"; with load shedding, "a fleet might run much closer to the point at which requests would be rejected than system metrics indicate". https://web.archive.org/web/20240107143427id_/https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/ (fetched 2026-10-08)

**Reviewer checks.**
- At forecast peak, with the largest failure domain lost, is each tier still within its measured capacity?
- Which known upcoming events (launches, campaigns, seasonal peaks) are in the capacity plan?
- Does recovery capacity depend on launching new resources during the failure?

## Cost is a design input

**Claim.** Estimate the cost of a design per unit of business value (per customer, per request, per job, per thousand tokens) before building it, attribute running costs to the components and owners that cause them, and track that unit cost over time.

**Why it holds.** Architecture decides most of the bill: a design that calls a paid model API on every keystroke, keeps a GPU warm for occasional traffic or stores every intermediate artefact forever is expensive by construction, and no later tuning fixes that. A unit cost makes the trade visible: "this feature costs 4 cents per active user per day, and we charge 10 cents" is a design constraint; "the cloud bill went up" is not. Attributing cost to owners gives the people who can change a design the signal to change it.

**When it does not apply.** Before there are users, precise unit economics are guesses; a rough order-of-magnitude estimate per unit is enough to rule out designs that cannot be profitable [I]. Optimising cost early in a component that is a small share of the total wastes engineering time; find the dominant cost first.

**Sources.**
- [V] AWS Well-Architected, Cost Optimization Pillar design principles: "Measure overall efficiency: Measure the business output of the workload and the costs associated with delivery." "Analyze and attribute expenditure: ... allows transparent attribution of IT costs to revenue streams and individual workload owners." "Adopt a consumption model": stopping development environments outside working hours saves about 75 percent (40 of 168 hours). https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/design-principles.html (fetched 2026-10-08)
- [V] FinOps Foundation, Unit Economics capability: "Unit Economics brings together what an organization spends on technology and the value that technology spending creates." Example unit metrics include cost per customer, per transaction and per token (extraction). https://www.finops.org/framework/capabilities/unit-economics/ (fetched 2026-10-08)

**Reviewer checks.**
- What is the estimated cost per unit of value for the main user journey, and what dominates it?
- Is every paid resource tagged or attributable to a component and an owner?
- Is there a spending cap or alert per tenant, project or time window, so that one runaway loop cannot consume the budget?
- Which design choices would change if the dominant cost doubled?
