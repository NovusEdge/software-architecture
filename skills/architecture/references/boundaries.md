# Boundaries and contracts

Where to draw boundaries between parts of a system and between teams, what an interface actually promises, and where a guarantee has to live.

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Conway's law and the inverse Conway manoeuvre

**Claim.** A system's structure mirrors the communication structure of the organisation that builds it. To get a desired architecture, shape the teams and their communication paths to match it.

**Why it holds.** Coupling in code follows ease of conversation. Two people at adjacent desks share assumptions and call each other's internals; two teams that meet monthly negotiate an interface and keep to it. If the payments team and the orders team are one team, payments logic will leak into orders code because nothing stops it. Split them, and an interface hardens at the line between them whether or not it was designed.

**When it does not apply.** Reorganising people does not fix rigid existing code, and a reorganisation without refactoring creates friction as teams fight a codebase shaped for the old structure. A team of one to five people has one communication structure, so the law predicts one blob; the risk then is the opposite, contracts that exist only in people's heads [I].

**Sources.**
- [V] Martin Fowler, "Conway's Law" (2022-10-20), quoting Conway (1968): "Any organization that designs a system (defined broadly) will produce a design whose structure is a copy of the organization's communication structure." The page describes the inverse manoeuvre and notes that reorganising people does not fix rigid legacy code. https://martinfowler.com/bliki/ConwaysLaw.html (fetched 2026-10-07)

**Reviewer checks.**
- Does the team or ownership map match the intended module and service boundaries? Where it does not, which side will win?
- Who owns each cross-module or cross-service contract?
- In a small team, which contracts exist only in someone's head?

## Hyrum's law

**Claim.** With enough users of an interface, every observable behaviour is depended on by someone, whatever the documentation promises.

**Why it holds.** Consumers cannot tell documented behaviour from incidental behaviour. They ship against whatever works: the order of keys in a JSON response, the exact text of an error message, how long a call takes, an undocumented default page size. With enough consumers, each incidental behaviour has a dependant, so changing any of them breaks someone. A service that always returned results sorted by ID, without promising to, cannot switch to an unordered index without finding the client that paginates by "last ID seen".

**When it does not apply.** With a few consumers you control, you can find and fix them; the law bites with external users, long-lived stored data and many repositories [I]. Mitigations: keep the surface small, randomise unpromised behaviour (Go randomises map iteration order for this reason [U]), and run the consumers' tests, not only the producer's (see [testing.md](testing.md)).

**Sources.**
- [V] Hyrum Wright, hyrumslaw.com: "With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody." https://www.hyrumslaw.com/ (fetched 2026-10-07)

**Reviewer checks.**
- Which observable behaviours of each interface are unpromised but likely relied on (ordering, timing, error strings, defaults, page sizes)?
- Is there a test that pins each promised behaviour, so that unpromised ones can change knowingly?
- Can a contract change roll out without a lock-step deploy of all consumers?

## The end-to-end argument

**Claim.** A function such as reliable delivery, deduplication or integrity checking can be implemented completely and correctly only at the end points that know what the application needs. A lower layer's version of it is at most a performance optimisation.

**Why it holds.** Take reliable file transfer. Even over a perfectly reliable network, the file can be corrupted by a bug in the sender's disk read or the receiver's write. The end points must therefore checksum the whole file anyway, and once they do, the network's reliability guarantee is redundant for correctness. The same applies to a message queue that "guarantees delivery": the consumer can still crash after receiving the message and before acting on it, so the consumer must still be idempotent and check the outcome (see [data-and-events.md](data-and-events.md)).

**When it does not apply.** Where a lower-level mechanism is a large performance win (retransmission on a lossy radio link, so the end-to-end check rarely fails), it belongs there as an optimisation. The paper itself frames placement as a judgement about cost, not a ban on lower-layer features.

**Sources.**
- [V] Saltzer, Reed and Clark, "End-to-End Arguments in System Design" (1981; ACM TOCS 1984): "The function in question can completely and correctly be implemented only with the knowledge and help of the application standing at the end points of the communication system. Therefore, providing that questioned function as a feature of the communication system itself is not possible. (Sometimes an incomplete version of the function provided by the communication system may be useful as a performance enhancement.)" https://web.mit.edu/Saltzer/www/publications/endtoend/endtoend.pdf (fetched 2026-10-07)

**Reviewer checks.**
- For each integrity function (delivery, deduplication, ordering, authentication, checksums), is it checked at the final end point?
- Does the design rely on a queue, broker or workflow engine's guarantee where only the consumer can know whether the effect happened?

## Team cognitive load (Team Topologies)

**Claim.** Cut the system so that each team can hold its whole part in its head. Team Topologies names four team types (stream-aligned, enabling, complicated-subsystem, platform) and three interaction modes (collaboration, X-as-a-Service, facilitation).

**Why it holds.** Cognitive load is the real limit on what a team can own. A team that owns a service, its deployment pipeline, its database tuning, a message broker and a mobile client has five domains to keep current; incidents in the least familiar one take longest and are fixed worst. A platform team that offers the pipeline and broker "as a service" removes two domains from every stream-aligned team.

**When it does not apply.** The model assumes several teams. A team of a handful is one stream-aligned team that is also the platform team; use only the idea of limiting what each person must hold, and do not build internal "platform" abstractions for a single consumer [I].

**Sources.**
- [V] Team Topologies, Key Concepts: four team types and three interaction modes; "Teams can only handle so much complexity before breaking down. Each new tool, responsibility or domain your team is given taxes their mental bandwidth." Stream-aligned teams "own the outcomes." https://teamtopologies.com/key-concepts (fetched 2026-10-07)

**Reviewer checks.**
- How many distinct technologies and domains must one person understand to make the most common change?
- Does any team own a part it cannot operate at three in the morning?
- Is there an internal platform with only one consumer?

## Ports and adapters (hexagonal architecture)

**Claim.** Keep the application's core logic independent of the technologies that drive it and that it drives. The core exposes ports (purposeful interfaces such as "place order" or "store order"); adapters translate between each port and a specific technology (HTTP, a CLI, a test harness, Postgres, an in-memory fake).

**Why it holds.** When business rules live in HTTP handlers and SQL calls, they cannot run without a web server and a database: tests are slow, a batch job has to fake HTTP requests, and swapping the queue means rewriting the rules. With a port, the same "place order" logic is called by the HTTP adapter in production, by a batch adapter at night and by a test directly, and it stores orders through a port that a Postgres adapter implements in production and a dictionary implements in tests. The inside does not know which outside is attached.

**When it does not apply.** For a thin CRUD service where the "logic" is the mapping between HTTP and SQL, ports add indirection with nothing behind it. An abstraction over the database that pretends all stores are alike hides the transactional and consistency properties the logic depends on; a port should express what the application needs ("save this order atomically with its lines"), not a generic repository over any store [I].

**Sources.**
- [V] Alistair Cockburn, "Hexagonal Architecture" (version 0.9, 2005-09-04; HaT Technical Report 2005.02): intent "Allow an application to equally be driven by users, programs, automated test or batch scripts, and to be developed and tested in isolation from its eventual run-time devices and databases." The hexagon shape is arbitrary and chosen to show inside-outside asymmetry with room for several ports (extraction). https://alistair.cockburn.us/hexagonal-architecture/ (fetched 2026-10-08)
- [V] Eric Evans, DDD Reference (2015), Layered Architecture: "Isolate the expression of the domain model and the business logic, and eliminate any dependency on infrastructure, user interface, or even application logic that is not business logic." https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf (fetched 2026-10-08)

**Reviewer checks.**
- Can the core logic run in a test without a network, a database or a web framework?
- Do any business rules live in request handlers, ORM hooks or SQL triggers?
- Does each port describe what the application needs, or does it re-expose a generic database or HTTP interface?
