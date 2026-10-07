# Consistency models, CAP and PACELC

What guarantees replicated data can offer, what CAP actually says, and why the trade-off that shapes everyday design is between consistency and latency. Aggregate-level consistency is in [domain-design.md](domain-design.md); cache staleness is in [caching.md](caching.md).

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## CAP is a statement about partitions

**Claim.** CAP says that while a network partition separates replicas, a system must choose, per operation, between answering (availability) and guaranteeing that every read sees the latest write (consistency, in CAP's strict sense of linearizability). When there is no partition, it constrains nothing. "Pick two of three" misstates it.

**Why it holds.** Two replicas that cannot talk cannot both accept a write and guarantee the other sees it. If a user in Europe updates a profile on replica A while A is cut off from replica B in the US, a read on B can either return the old value (available, not consistent) or refuse (consistent, not available). That choice exists only during the partition. Brewer points out that in practice the decision is made at a timeout: a replica that waits too long for a peer has decided the peer is partitioned.

**When it does not apply.** A single-node database has no partitions to choose about (it is simply unavailable when down). CAP's definitions are narrow: consistency means linearizability of a single register, and availability means every non-failed node must answer; most real systems meet neither definition fully, so labelling a product "CP" or "AP" says little about how it behaves.

**Sources.**
- [V] Eric Brewer, "CAP Twelve Years Later: How the 'Rules' Have Changed" (InfoQ, 2012): "The '2 of 3' formulation was always misleading because it tended to oversimplify the tensions among properties." "Because partitions are rare, there is little reason to forfeit C or A when the system is not partitioned." "Operationally, the essence of CAP takes place during a timeout, a period when the program must make a fundamental decision—the partition decision" (extraction). https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/ (fetched 2026-10-08)
- [V] Martin Kleppmann, "Please stop calling databases CP or AP" (2015-05-11): CAP's consistency is linearizability, its availability requires every non-failing node to respond, and the theorem covers a single register; he recommends retiring CP/AP labels in favour of precise consistency models (extraction). https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html (fetched 2026-10-08)

**Reviewer checks.**
- For each replicated store, what does a read return during a partition, and what does a write do?
- Does the design describe a component as "CP" or "AP" without saying which operations behave how?

## The everyday trade-off is consistency against latency (PACELC)

**Claim.** If there is a Partition, a replicated system trades Availability against Consistency; Else, in normal operation, it trades Latency against Consistency. The second trade is present on every request and usually matters more.

**Why it holds.** A strongly consistent write to replicas in two regions must wait for at least one cross-region round trip, perhaps 80 ms, on every write, all day, whether or not anything has failed. A system that acknowledges after the local write is fast but lets a reader in the other region see stale data for a while. Partitions are rare; this latency cost is constant. Abadi classifies systems on both axes: Dynamo, Cassandra and Riak by default are PA/EL (give up consistency for both availability and latency), while fully consistent systems are PC/EC.

**When it does not apply.** The latency/consistency trade applies only to replicated data. Abadi himself says neither CAP nor PACELC explains every trade-off in distributed databases; they are a framing, not a design method.

**Sources.**
- [V] Daniel Abadi, "Consistency Tradeoffs in Modern Distributed Database System Design" (IEEE Computer, February 2012): PACELC: "if there is a partition (P), how does the system trade off availability and consistency (A and C); else (E), when the system is running normally in the absence of partitions, how does the system trade off latency (L) and consistency (C)?" "The latency/consistency tradeoff (ELC) only applies to systems that replicate data." "The default versions of Dynamo, Cassandra, and Riak are PA/EL systems." "Neither CAP nor PACELC can explain them all." https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf (fetched 2026-10-08)

**Reviewer checks.**
- For each replicated store, what latency does strong consistency cost on the main write path, and is that cost accepted or avoided?
- Where the design chose low latency, which reads can return stale data, and for how long?

## Name the consistency model each operation needs

**Claim.** Instead of "strong" or "eventual", state the specific guarantee each operation requires: linearizable (every read sees the latest completed write), serializable (transactions appear in some serial order), causal (effects are never seen before their causes), read-your-writes (a user always sees their own updates), or eventual (replicas converge if writes stop). Choose the weakest model that keeps the business correct.

**Why it holds.** Different operations need different guarantees, and stronger guarantees cost latency and availability. A username uniqueness check needs linearizability: two users must not both get "alice". A comment feed needs only causal consistency: a reply must not appear before the comment it answers. A profile page needs read-your-writes: a user who changes their avatar and reloads must see the new one, though other users can see it a few seconds later. Treating all three as "strong" pays the highest cost everywhere; treating all three as "eventual" produces duplicate usernames.

**When it does not apply.** A single-node database with serializable transactions gives strong guarantees for free until it must be replicated or sharded; then this analysis becomes necessary [I]. Vendor documentation uses these terms inconsistently; check what a product guarantees under failure, not what its marketing calls it.

**Sources.**
- [V] Martin Kleppmann, "Please stop calling databases CP or AP" (2015-05-11): recommends reasoning in terms of specific consistency models (eventual, causal, sequential and others) and points to Doug Terry's and Peter Bailis's work on consistency and availability (extraction). https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html (fetched 2026-10-08)
- [V] Jepsen, "Consistency Models": "a consistency model is a safety property which declares what a system can do" (extraction). https://jepsen.io/consistency (fetched 2026-10-08)
- [U] The definitions of the individual models above are standard but were not each checked against a primary page on the fetch date; the Jepsen site has a page per model.

**Reviewer checks.**
- For each user-visible operation, which consistency model does correctness require?
- Where the design relies on read-your-writes or causal order, which mechanism provides it (sticky sessions, version tokens, a single leader)?
- Does any uniqueness or "never twice" rule rely on an eventually consistent store?
