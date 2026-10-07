# Caching

When a cache is worth adding, how it changes the failure behaviour of the system it serves, and how to handle invalidation, expiry and stampedes.

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## A cache is a dependency that adds a mode

**Claim.** Add a cache only for a measured need (latency, cost, a dependency that cannot keep up) and for data that is reused across requests and tolerates staleness. Once added, plan for the cache being empty or gone: the system must survive a cold or failed cache without overloading what sits behind it.

**Why it holds.** A cache makes a system modal: it behaves one way on a hit and another on a miss. Over time the dependency behind it is sized for the hit rate. A database that serves 1,000 reads a second through a 95 percent hit rate sees 50; after a deploy that empties in-memory caches, or a cache fleet failure, it sees 1,000 and falls over, taking the service with it. Amazon calls this a service "addicted to its cache". Testing with the cache disabled shows whether the safeguards (load shedding, a cap on requests to the dependency, serving stale data) actually work.

**When it does not apply.** If each request needs unique data, the hit rate will be negligible and the cache only adds latency and failure modes. If the data cannot be stale even briefly (an account balance before a withdrawal), cache something else. An HTTP cache in front of genuinely static assets is low risk and rarely needs this analysis [I].

**Sources.**
- [V] Matt Brinkley and Jas Chhabra, Amazon Builders' Library, "Caching challenges and strategies", read through a Wayback Machine capture of 2023-12-08: "We've just described a service that has become addicted to its cache. The cache has been inadvertently elevated from a helpful addition to the service to a necessary and critical part of its ability to operate. At the heart of this issue is the modal behavior introduced by the cache." "Make sure there is a legitimate need for a cache that is justified in terms of cost, latency, and/or availability improvements." "Run load tests with caches disabled to validate this." https://web.archive.org/web/20231208234417id_/https://aws.amazon.com/builders-library/caching-challenges-and-strategies/ (fetched 2026-10-08)

**Reviewer checks.**
- What measured problem does each cache solve, and what hit rate does the design assume?
- If the cache is empty (deploy, restart, fleet failure), what load reaches the dependency, and can it take it?
- Has the system been load tested with the cache disabled?
- Is the cache operated (monitored, scaled, alarmed) like the rest of the system?

## Cache-aside and inline caches

**Claim.** In cache-aside, the application checks the cache, loads from the store on a miss, writes the result to the cache, and invalidates the entry on writes. In an inline (read-through or write-through) cache, the cache sits in the data path and does this itself. Choose knowing that an inline cache's availability becomes the dependency's availability.

**Why it holds.** Cache-aside keeps control in the application: on a cache failure it can choose to call the store, serve stale data or shed load. An inline cache is transparent, so it can be added or removed without changing clients, and its logic is written once rather than in every service. But if a Varnish fleet in front of a REST dependency goes down, the dependency appears down, with no chance for the client to compensate. Write-through updates store and cache in one operation, so readers see a new value immediately after a write; cache-aside invalidates on write, so a reader between the write and the next load can miss or see stale data briefly.

**When it does not apply.** Do not cache sensitive data shared between users or tenants in either pattern without encryption and strict keying. For a static data set that fits in memory, prime the cache at startup and do not expire it.

**Sources.**
- [V] Amazon Builders' Library, "Caching challenges and strategies": inline caches "embed cache management into the main data access API"; "the transparency of inline caches can also be an availability downside ... if that caching fleet goes down, from your service's perspective it's as if the dependency itself went down." https://web.archive.org/web/20231208234417id_/https://aws.amazon.com/builders-library/caching-challenges-and-strategies/ (fetched 2026-10-08)
- [V] Azure Architecture Center, "Cache-Aside pattern" (updated 2025-12-09): "When an application updates information, it writes the change to the data store and then invalidates the corresponding item in the cache." "The Cache-Aside pattern doesn't guarantee consistency between the data store and the cache." Write-through "updates the data store and the cache in the same write operation so that readers see the new value immediately after a successful write." https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside (fetched 2026-10-08)

**Reviewer checks.**
- For each cache, is it cache-aside or inline, and what does the caller do when it is unavailable?
- Is any user-specific or tenant-specific data cached under a key that could be shared?

## Invalidate after the write, and bound staleness with a TTL

**Claim.** When data changes, update the store first and then invalidate the cache entry. Give every entry a time-to-live as a backstop, so that any missed invalidation is bounded, and state how stale each cached item may be.

**Why it holds.** If the cache entry is deleted before the store is updated, a reader in the gap misses, loads the old value from the store and writes it back into the cache, where it stays until the next write or expiry. Updating the store first closes that window. Invalidation messages can still be lost (a process dies between the write and the delete, or another service writes the store directly), so a TTL guarantees that a stale entry eventually disappears. Phil Karlton's remark that cache invalidation is one of the two hard things in computer science is about exactly these races.

**When it does not apply.** For data that never changes (content-addressed blobs, immutable versions), invalidation is unnecessary: change the key instead of the value. Where a race between concurrent writers and readers is unacceptable, cache-aside is the wrong tool; use the store directly or a cache with versioned or conditional writes [I].

**Sources.**
- [V] Azure Architecture Center, "Cache-Aside pattern": "Update the data store before removing the item from the cache. If you remove the cached item first, there's a small window of time when a client might fetch the item before the data store is updated." https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside (fetched 2026-10-08)
- [V] Martin Fowler, "TwoHardThings" (2009-07-14): "There are only two hard things in Computer Science: cache invalidation and naming things." — Phil Karlton; the earliest online source Fowler found was Tim Bray's blog in 2005 (extraction). https://martinfowler.com/bliki/TwoHardThings.html (fetched 2026-10-08)

**Reviewer checks.**
- On each write path, is the store updated before the cache is invalidated?
- Does every cache entry have a TTL, and is the maximum staleness stated for each kind of data?
- Can anything write the store without invalidating the cache (another service, a migration, a manual fix)?

## Choose expiry deliberately: soft and hard TTLs, and negative caching

**Claim.** Pick TTLs from how stale clients can tolerate and how fast the data changes, measure hit rates, and revisit the values. Use a soft TTL (refresh after this) and a hard TTL (never serve after this) so a dependency outage serves slightly stale data instead of errors. Cache error and not-found responses too, with their own TTL.

**Why it holds.** TTLs picked arbitrarily at implementation and never revisited are a known source of outages. With soft and hard TTLs, a client refreshes an entry after 5 minutes but, if the dependency does not answer, keeps using it for up to an hour; a brief outage downstream becomes invisible upstream. Amazon's IAM client works this way. Without negative caching, a missing or failing resource is requested from the dependency on every call, which turns one deleted record into a flood of requests during the incident when the dependency can least afford it.

**When it does not apply.** Data with legal or safety freshness requirements (a revoked permission) must not be served past the point it is known to be wrong; give it a short hard TTL or push invalidations. Negative caching of a "not found" delays visibility of a newly created record by up to that TTL.

**Sources.**
- [V] Amazon Builders' Library, "Caching challenges and strategies": "We want to avoid the situation where a developer arbitrarily picks some cache size and TTL values during initial implementation and then never goes back and validates their appropriateness." "Another pattern we use to improve resiliency when downstream services are unavailable is to use two TTLs: a soft TTL and a hard TTL." "Cache the error response (that is, we use a 'negative cache') using a different TTL than positive cache entries"; "We have seen real-world examples in which a failure to cache negative responses led to increased failure rates and faults." https://web.archive.org/web/20231208234417id_/https://aws.amazon.com/builders-library/caching-challenges-and-strategies/ (fetched 2026-10-08)

**Reviewer checks.**
- Where do the TTL values come from, and are hit rates and miss counts emitted as metrics?
- During a dependency outage, does the cache keep serving the last good value, and for how long?
- Are not-found and error responses cached, with a shorter TTL?

## Coalesce requests to prevent stampedes

**Claim.** When many requests miss on the same key at once, let only one go to the dependency and have the rest wait for its result (request coalescing). Spread expiry times so that popular keys do not all expire together.

**Why it holds.** A popular key expires, and in the next 50 ms a thousand requests miss on it; without coalescing, all thousand call the dependency for the same value at the same moment (the "thundering herd"). The same happens when a new server joins with an empty local cache. With coalescing, one request fetches and 999 wait a few milliseconds for it. Adding jitter to TTLs prevents keys that were filled together from expiring together [I].

**When it does not apply.** Coalescing needs a lock or a shared in-flight table, which adds latency for waiters and a failure mode if the leader request hangs (bound it with a timeout). Low-traffic keys rarely stampede.

**Sources.**
- [V] Amazon Builders' Library, "Caching challenges and strategies": "One final consideration is the 'thundering herd' situation, in which many clients make requests that need the same uncached downstream resource at approximately the same time. This can also occur when a server comes up and joins the fleet with an empty local cache." "To remedy this issue we use request coalescing, where the servers or external cache ensure that only one pending request is out for uncached resources." https://web.archive.org/web/20231208234417id_/https://aws.amazon.com/builders-library/caching-challenges-and-strategies/ (fetched 2026-10-08)
- [V] Amazon Builders' Library, "Timeouts, retries, and backoff with jitter": "we consider adding some jitter to all timers, periodic jobs, and other delayed work." https://web.archive.org/web/20231225054225id_/https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/ (fetched 2026-10-08)

**Reviewer checks.**
- What happens when the most popular key expires at peak traffic?
- Do new instances start with an empty cache, and what load does that put on dependencies during a deploy?
- Are expiry times jittered?
