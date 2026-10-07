# API versioning and deprecation

How to evolve an interface that other people's code depends on: what counts as breaking, how to version, how to retire old behaviour, and how strict to be about input. Hyrum's law (every observable behaviour gets depended on) is in [boundaries.md](boundaries.md); stored-format compatibility is in [schema-evolution.md](schema-evolution.md).

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Define "breaking" before you need to

**Claim.** Write down what counts as a backward-incompatible change for your API, covering source, wire and semantic compatibility, and check proposed changes against it. Adding optional fields and new endpoints is normally compatible; removing or renaming fields, changing types or formats, changing defaults and changing pagination or error behaviour is not.

**Why it holds.** Without a written rule, "breaking" is decided case by case by whoever is in a hurry, and semantic breaks slip through because the schema still validates. Changing a default page size from 100 to 50 breaks no type and no test, yet a client that fetches "the first page" and assumes it has everything now silently loses half its data. Google's AIP-180 separates three kinds: source (client code still compiles), wire (old clients still talk to the new server) and semantic (old clients still get what a reasonable developer expects); a change must preserve all three within a major version.

**When it does not apply.** Internal interfaces whose only consumers are deployed together with the provider can change freely, as long as that is actually true; a second consumer in another repository ends the exemption.

**Sources.**
- [V] Google API Improvement Proposals, AIP-180 "Backwards compatibility": source compatibility: "Code written against a previous version must compile against a newer version"; wire compatibility: "Code written against a previous version must be able to communicate correctly with a newer server"; semantic compatibility: "Code written against a previous version must continue to receive what most reasonable developers would expect." Examples of breaking changes include removing or renaming components, changing field types or value formats, changing defaults and changing pagination behaviour (extraction). https://google.aip.dev/180 (fetched 2026-10-08)

**Reviewer checks.**
- Is there a written definition of a breaking change for each public or cross-team interface?
- Is there an automated check (schema diff, contract tests) that flags incompatible changes before release?
- Which behaviours that are not in the schema (defaults, ordering, page sizes, error codes) are part of the contract?

## Pin each client to a version and translate at the edge

**Claim.** When breaking changes are unavoidable, version the API, let each client stay on the version it was built against until it chooses to upgrade, and implement old versions as transformations of the current one at the boundary rather than as parallel code paths.

**Why it holds.** Stripe names versions by release date and pins each account to the version current at its first request. Each breaking change is a small module that converts a current response into the previous shape; to serve an old version, the server applies these modules backwards until it reaches the client's version. Core logic is written once against the current model, and the cost of old versions is confined to a list of translations. A client whose code expects `bank_account.verified` keeps getting it after the internal model replaced it with `status`.

**When it does not apply.** Every supported version is a maintenance cost and a test matrix; Stripe reduces it by reviewing API changes up front and avoiding unnecessary ones. For APIs with a few known clients, coordinating an upgrade can be cheaper than maintaining versions. Translation works for response shapes; it does not help when the semantics of an operation change (a refund that used to be synchronous becoming asynchronous) [I].

**Sources.**
- [V] Brandur Leach, Stripe blog, "APIs as infrastructure: future-proofing Stripe with versioning" (2017-08-05): "rolling versions that are named with the date they're released"; an account is pinned to the current version on its first request; breaking changes are encapsulated in "version change modules" applied backwards to reach the requested version; versioning is "a compromise between improving developer experience and the additional burden of maintaining old versions" (extraction). https://stripe.com/blog/api-versioning (fetched 2026-10-08)

**Reviewer checks.**
- How does a client say which version it expects, and what does it get if it says nothing?
- Is old-version behaviour isolated at the boundary, or spread through core logic as conditionals?
- How many versions are live, and what does supporting each one cost?

## Deprecate in the protocol, with a date

**Claim.** Announce deprecation where clients' code can see it, in the response itself, with a date, and announce the removal date separately. On HTTP, the `Deprecation` header (RFC 9745) signals that a resource is or will be deprecated, and the `Sunset` header (RFC 8594) gives when it will stop responding.

**Why it holds.** Deprecation notices in changelogs and emails reach people who read changelogs and emails; a header reaches every client on every call, can be logged and alerted on by client tooling, and shows up in the traffic of the teams that have not migrated. Paired with usage metrics per client and version, it turns "can we remove v1 yet?" into a query: who still called it this week?

**When it does not apply.** Non-HTTP interfaces need their own equivalent (a warning field in responses, a log line in the client library). A sunset date that passes without removal teaches clients to ignore the next one; announce only dates you will keep.

**Sources.**
- [V] RFC 9745, "The Deprecation HTTP Response Header Field" (Standards Track, March 2025): "The Deprecation HTTP response header field is used to signal to consumers of a resource (identified by a URI) that the resource will be or has been deprecated." The value is a date, for example `Deprecation: @1688169599`; it can be combined with `Sunset` (RFC 8594), whose timestamp must not be earlier than the deprecation (extraction). https://www.rfc-editor.org/rfc/rfc9745.html (fetched 2026-10-08)
- [U] RFC 8594 (the Sunset header) was not opened directly.

**Reviewer checks.**
- When a version or endpoint is deprecated, how does a client's code find out?
- Is usage measured per client and version, so that removal can be decided from data?
- Who decides the removal date, and has a past sunset date ever slipped?

## Be strict about what you accept

**Claim.** Validate input against the specification and reject what does not conform, rather than silently accepting and correcting it. Tolerance of malformed input, applied widely, turns bugs into de facto standards that every later implementation must reproduce.

**Why it holds.** The robustness principle ("be conservative in what you send, liberal in what you accept") seems kind to clients, but a server that accepts a misspelled field, a date in the wrong format or a missing required value lets a client ship with that bug. Other clients copy the working example, and the server can never become strict without breaking them; every new server implementation must accept the same mistakes. Rejecting non-conforming input with a clear error gets the bug fixed while there is one client, not fifty.

**When it does not apply.** Ignoring unknown fields is not the same as accepting malformed ones: forward compatibility (see [schema-evolution.md](schema-evolution.md)) needs readers to skip fields they do not know. Where clients cannot be changed (deployed devices, long-lived integrations), the server may have to accept known deviations; document them as part of the contract.

**Sources.**
- [V] RFC 9413, "Maintaining Robust Protocols" (IAB, Informational, June 2023): "The main goal of the networking standards process is to enable the long-term interoperability of protocols. This document describes active protocol maintenance, a means to accomplish that goal." "Tolerating unexpected input might seem logical, even necessary. However, that conclusion relies on an assumption that existing specifications and implementations cannot change" (extraction). https://www.rfc-editor.org/rfc/rfc9413.html (fetched 2026-10-08)

**Reviewer checks.**
- Does each interface validate input against its schema and reject what does not conform?
- Are there known client deviations the server tolerates, and are they documented as part of the contract?
- Do readers distinguish unknown fields (skip) from invalid values (reject)?
