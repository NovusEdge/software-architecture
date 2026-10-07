# Data, events and side effects

How to change state across systems without losing or duplicating effects: event logs, read models, the outbox, idempotency keys, exactly-once processing and sagas. Durable workflow engines are in [durable-workflows.md](durable-workflows.md); stored-format evolution is in [schema-evolution.md](schema-evolution.md).

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Event logs and event sourcing

**Claim.** Record every change to application state as an event in an append-only log. Current state is derived from the log, which gives an audit trail, replay, queries about past states and the ability to rebuild a view after a bug.

**Why it holds.** A table of current balances stores the result; a log of deposits and withdrawals stores the cause. If a bug miscomputes interest for a week, the log lets you fix the code and recompute every balance; the table only lets you guess. Any number of read views (a balance, a monthly statement, a fraud score) can be derived from the same log, and a new view can be built later from history.

**When it does not apply.** The costs are real. Replaying events re-triggers external side effects unless replay is separated from effect. Results of external queries must be recorded in the log, or replay will see different answers. Changing business logic makes reprocessing old events ambiguous. Events are kept forever, so their schema is a one-way door (see [decisions-and-documentation.md](decisions-and-documentation.md)). Event sourcing as the entire data model is a much larger commitment than keeping an event log beside current state [I].

**Sources.**
- [V] Martin Fowler, "Event Sourcing": "Capture all changes to an application state as a sequence of events." Benefits include rebuilding state ("discard the application state completely and rebuild it by re-running the events") and temporal queries ("determine the application state at any point in time"); difficulties include external side effects on replay, recording external query results and changing logic. https://martinfowler.com/eaaDev/EventSourcing.html (fetched 2026-10-07)
- [V] Eric Evans, DDD Reference (2015), Domain Events: "Model information about activity in the domain as a series of discrete events. Represent each event as a domain object." https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf (fetched 2026-10-08)

**Reviewer checks.**
- Which state is canonical: the log, or a table beside it? Is that stated?
- Can a view be rebuilt from the log without re-sending emails, charging cards or calling external APIs?
- Are external results that affect state recorded as events?
- Can the current code read the oldest stored event?

## Separate read models only where they pay (CQRS)

**Claim.** Command Query Responsibility Segregation uses one model to update information and a different model to read it. Use it where reads and writes have genuinely different shapes or scale; most systems fit a single model.

**Why it holds.** Writes are often small, validated changes to one aggregate; reads are often wide, denormalised views across many. A dashboard that joins eight tables on every page load can instead read a view kept up to date from change events. The cost is keeping the two in sync and accepting that the read side lags the write side: a user who saves and immediately reloads may not see the change.

**When it does not apply.** Most of the time. Fowler warns that "for most systems CQRS adds risky complexity". A read view derived from a log for one heavy query is a modest, contained use; separate command and query stacks across a whole system need a concrete read problem to justify them.

**Sources.**
- [V] Martin Fowler, "CQRS": "At its heart is the notion that you can use a different model to update information than the model you use to read information." "For most systems CQRS adds risky complexity"; "many systems do fit a CRUD mental model, and so should be done in that style". https://martinfowler.com/bliki/CQRS.html (fetched 2026-10-07)

**Reviewer checks.**
- For each separate read model, what concrete read problem does it solve?
- How long can the read side lag, and does the user interface handle read-after-write?
- Can each read model be rebuilt from its source?

## Transactional outbox

**Claim.** To update a database and publish a message atomically, write the message to an outbox table in the same database transaction as the business change, and have a separate relay publish from the outbox. Consumers must then tolerate duplicates.

**Why it holds.** A database commit and a broker publish are two systems with no shared transaction. If the service commits the order and crashes before publishing "order placed", downstream never hears of the order; if it publishes first and the commit fails, downstream acts on an order that does not exist. Writing the message into the same database in the same transaction makes "the order exists" and "the message will be sent" one atomic fact. The relay may publish a message twice (it can crash after publishing and before marking it sent), so delivery becomes at-least-once.

**When it does not apply.** If the log of changes is itself the source of truth and consumers read it directly, the log already plays the outbox role and there is no second write [I]. It is not needed when the only side effect is inside the same database.

**Sources.**
- [V] Chris Richardson, microservices.io, "Pattern: Transactional outbox": "How to atomically update the database and send messages to a message broker?" Solution: "first store the message in the database as part of the transaction that updates the business entities. A separate process then sends the messages to the message broker." "Messages are guaranteed to be sent if and only if the database transaction commits." The relay "might publish a message more than once", so "a message consumer must be idempotent". https://microservices.io/patterns/data/transactional-outbox.html (fetched 2026-10-07)

**Reviewer checks.**
- For each place where a database write and an external call or message must both happen, what happens if the process dies between them?
- Is the relay's at-least-once delivery matched by idempotent consumers?

## Idempotency keys

**Claim.** For any operation with side effects that may be retried, have the client generate a unique key per logical operation and send it with every attempt; the server records the key with the first result and returns that result for repeats.

**Why it holds.** A caller that times out cannot tell "the request never arrived" from "it ran and the reply was lost". Retrying is safe only if running twice equals running once. With a key, the server sees the second attempt, recognises it and returns the saved outcome instead of charging the card again. Amazon's APIs (EC2 `RunInstances` has a `ClientToken`) and Stripe's `Idempotency-Key` header both work this way. When the operation itself calls other systems, it can be split into atomic phases (local database changes committed together) separated by foreign calls, with a recorded recovery point after each, so that a retry resumes where the last attempt stopped.

**When it does not apply.** Naturally idempotent operations (set a value, delete by ID) need no key. The key must be generated once per logical operation, not once per attempt, or it protects nothing. Keys expire (Stripe prunes after 24 hours), so the deduplication window must exceed the longest retry horizon [I]. Reusing a key with different parameters must be an error, or a client bug becomes a silent wrong answer.

**Sources.**
- [V] Stripe API reference, "Idempotent requests": "A client generates an idempotency key, which is a unique key that the server uses to recognize subsequent retries of the same request." The server saves "the resulting status code and body of the first request made for any given idempotency key, regardless of whether it succeeds or fails"; keys up to 255 characters; may be pruned after 24 hours; reuse with different parameters is an error. https://docs.stripe.com/api/idempotent_requests (fetched 2026-10-07)
- [V] Malcolm Featonby, Amazon Builders' Library, "Making retries safe with idempotent APIs", read through a Wayback Machine capture of 2023-12-25: "our preferred approach is to incorporate a unique caller-provided client request identifier into our API contract"; the service returns "a semantically equivalent response in every case for the same unique request identifier for some interval". https://web.archive.org/web/20231225054222id_/https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/ (fetched 2026-10-08)
- [V] Brandur Leach, "Implementing Stripe-like Idempotency Keys in Postgres" (2017-10-27): "An atomic phase is a set of local state mutations that occur in transactions between foreign state mutations"; "A recovery point is a name of a check point that we get to after having successfully executed any atomic phase or foreign state mutation." https://brandur.org/idempotency-keys (fetched 2026-10-08)
- [V] Temporal documentation, Activity Definition: "You should always make your business logic Activities idempotent in Temporal"; keys can combine Workflow Run ID and Activity ID. https://docs.temporal.io/activity-definition (fetched 2026-10-07)

**Reviewer checks.**
- Does every retried side effect carry a key generated once per logical operation, and does the receiver actually deduplicate on it?
- Is the deduplication window longer than the longest possible retry?
- For operations that call other systems, where are the recovery points, and what happens on a retry after each?

## Exactly-once means end-to-end idempotency

**Claim.** No transport delivers a message exactly once. "Exactly-once" effects are built from at-least-once delivery plus a receiver that deduplicates on a stable identifier.

**Why it holds.** A sender that gets no acknowledgement cannot tell a lost message from a lost acknowledgement. If it does not resend, a lost message is never delivered; if it resends, a lost acknowledgement causes a duplicate. No protocol removes this choice. The receiver is the only place that knows whether the effect already happened, so it records processed message IDs (in the same transaction as the effect) and ignores repeats. This is the end-to-end argument (see [boundaries.md](boundaries.md)) applied to delivery.

**When it does not apply.** Effects that cannot be deduplicated by the receiver (an email sent, a VM created through an API without a client token, a charge with a provider that has no idempotency support) need either the provider's own key support or a record-intent-then-check pattern: record "about to send email X", send, record "sent", and on retry check the provider before sending again [I]. Some brokers advertise exactly-once within their own boundary; that does not extend to side effects outside it [I].

**Sources.**
- [I] Combines the end-to-end argument (Saltzer, Reed and Clark, https://web.mit.edu/Saltzer/www/publications/endtoend/endtoend.pdf) with the outbox pattern page, which says consumers must be idempotent, "perhaps by tracking the IDs of the messages that it has already processed" (https://microservices.io/patterns/data/transactional-outbox.html, fetched 2026-10-07).

**Reviewer checks.**
- Where does the design claim "exactly once", and which component deduplicates to make it true?
- Is the processed-ID record written in the same transaction as the effect?
- Which effects cannot be deduplicated, and how are they protected?

## Sagas

**Claim.** Split a long-running business transaction into a sequence of local transactions, each with a compensating action that semantically undoes it. If a step fails, run the compensations for the steps already done. Coordinate either by choreography (participants react to each other's events) or by an orchestrator that tells each participant what to do.

**Why it holds.** Holding a database lock across minutes, a VM boot or a human approval is not feasible. Booking a trip as one distributed transaction across an airline, a hotel and a car rental would lock all three for the duration. As a saga, each booking commits locally; if the car rental fails, the saga cancels the hotel and the flight. Resources stay free and the system always has a defined path back to a consistent state.

**When it does not apply.** Some steps have no true compensation (an email sent, a build published, money paid out); order them last, after every step that can fail. A compensation is a new action that can itself fail, so it must be idempotent and retried. Sagas lack isolation: other transactions see intermediate states (the hotel is booked, the flight not yet), which the design must tolerate.

**Sources.**
- [V] Hector Garcia-Molina and Kenneth Salem, "Sagas" (SIGMOD 1987): a long-lived transaction is a saga "if it can be written as a sequence of transactions that can be interleaved with other transactions"; the system guarantees that "either all the transactions in a saga are successfully completed or compensating transactions are run to amend a partial execution". Text extracted from a scanned PDF; OCR is noisy. https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf (fetched 2026-10-07)
- [V] Chris Richardson, microservices.io, "Pattern: Saga": "A saga is a sequence of local transactions"; compensating transactions "undo the changes that were made by the preceding local transactions"; choreography versus orchestration ("An orchestrator (object) tells the participants what local transactions to execute"); "The lack of isolation means that there's risk that the concurrent execution of multiple sagas and transactions can [cause] data anomalies." https://microservices.io/patterns/data/saga.html (fetched 2026-10-07)

**Reviewer checks.**
- For each multi-step operation, what is the compensation for each step, and is it idempotent?
- Which steps are irreversible, and are they placed after every step that can fail?
- What do other users or processes see while a saga is half done?
