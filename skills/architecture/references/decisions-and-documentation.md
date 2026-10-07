# Decisions and documentation

How to make architectural decisions, record them, keep them true, and describe the resulting structure so a new reader can find their way.

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Architecture decision records

**Claim.** Keep a short, dated record for each architecturally significant decision: the context, the decision, its status and its consequences. Records are superseded, never edited into a different decision or deleted.

**Why it holds.** Code shows what was chosen. It never shows what was rejected or which constraint forced the choice. Six months later a team sees a hand-written retry loop instead of the HTTP client's built-in one and removes it, not knowing the built-in retries were not idempotency-aware and had double-charged customers. A record that says "we retry here, by hand, because the client library retries POSTs" stops that. Without the motivation a team either keeps an outdated decision out of fear or reverses a load-bearing one by accident.

**When it does not apply.** Local, cheap-to-reverse choices (a variable name, a helper library used in one file) do not need a record; recording everything buries the few that matter. A record that is never superseded when reality changes is worse than none, because it asserts something false with the authority of a document.

**Sources.**
- [V] Michael Nygard, "Documenting Architecture Decisions" (2011-11-15): "We will keep a collection of records for 'architecturally significant' decisions: those that affect the structure, non-functional characteristics, dependencies, interfaces, or construction techniques." Sections Title, Context, Decision, Status, Consequences; "one or two pages long"; superseded records are marked as such with a reference to the replacement. Also: "One of the hardest things to track during the life of a project is the motivation behind certain decisions." https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions (fetched 2026-10-07)
- [V] Spotify Engineering, "When Should I Write an Architecture Decision Record" (2020-04): "An ADR should be written whenever a decision of significant impact is made; it is up to each team to align on what defines a significant impact." Cases: backfill an undocumented decision; RFC first then ADR for large changes; ADR directly for small ones; "ADRs can be lightweight". https://engineering.atspotify.com/2020/04/when-should-i-write-an-architecture-decision-record (fetched 2026-10-07)

**Reviewer checks.**
- Is each decision that is expensive to reverse recorded with the alternatives that lost and the reason they lost?
- Does each record say what would make it be revisited, and does a status show which records are superseded?
- Do any current records contradict each other or the code, with neither marked superseded?
- Can a new engineer find the reason for the three largest structural choices in under five minutes?

## One-way and two-way doors

**Claim.** Classify each decision by how costly it is to undo. Decide reversible ("two-way door") decisions quickly with few people; slow down, widen review and write down irreversible ("one-way door") ones.

**Why it holds.** The expected cost of a wrong decision is the cost to undo it times the chance of being wrong. Choosing a logging library is a two-way door: if it is wrong, a day of work swaps it. Choosing the wire format of events kept forever is a one-way door: once a year of events is stored in it, every future reader must parse it. Speed on the first kind is what pays for care on the second. Organisations that apply the slow process to everything stall; those that apply the fast process to everything ship one-way mistakes.

**When it does not apply.** Reversibility is a property of the decision in a particular system, not of its label. Data formats, public APIs, stored event schemas, identifiers handed to customers, vendor contracts and licences look like configuration but become one-way as soon as data or customers depend on them [I]. Conversely, many "big" decisions (which cloud region to start in) are cheaper to reverse early than they look. A two-way door can also be made one-way by delay: a choice nobody revisits for a year accumulates dependants.

**Sources.**
- [V] Jeff Bezos, 2015 letter to shareholders (filed 2016): "Some decisions are consequential and irreversible or nearly irreversible – one-way doors"; "most decisions aren't like that – they are changeable, reversible – they're two-way doors." "Type 2 decisions can and should be made quickly by high judgment individuals or small groups." "As organizations get larger, there seems to be a tendency to use the heavy-weight Type 1 decision-making process on most decisions, including many Type 2 decisions." https://www.sec.gov/Archives/edgar/data/1018724/000119312516530910/d168744dex991.htm (fetched 2026-10-07)
- [V] Amazon Builders' Library, "Ensuring rollback safety during deployments": "One of the guiding tenets of how we build solutions at Amazon is: Avoid walking through one-way doors. It means that we stay away from choices that are hard to reverse or extend." Read through the Wayback Machine capture of 2023-12-28 because the live page redirects to a script-rendered site. https://web.archive.org/web/20231228212327id_/https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/ (fetched 2026-10-08)

**Reviewer checks.**
- Which decisions in the design are one-way doors (stored formats, public contracts, identifiers, vendor lock, licences), and is each one recorded and reviewed in proportion?
- Are cheap, reversible choices being deliberated at length while an irreversible one was made in passing?
- Where a one-way door is unavoidable, has the design narrowed it (a version field, an adapter, an export path) so that it is less one-way?

## Fitness functions

**Claim.** Turn each architectural rule you care about into an automated check that fails when the rule is broken: a test, a build rule, a metric with an alert.

**Why it holds.** A rule that lives only in a document decays because nothing fails when it is broken. "The billing module must not import the catalogue module's internals" holds for exactly as long as someone remembers it. As a dependency check in CI it fails on the pull request that breaks it, at the moment the author still has the context to fix it. The same works for runtime qualities: "p99 checkout latency under 400 ms" as an alert on a dashboard, or "every public endpoint requires authentication" as a test that enumerates routes.

**When it does not apply.** Qualities that resist measurement (is this module understandable?) get a proxy metric, and a proxy can be satisfied while the quality degrades. Each check is code that must be maintained; dozens of brittle ones become noise that people learn to override. Write checks for the rules whose breakage would be expensive and silent.

**Sources.**
- [V] Thoughtworks Technology Radar, "Architectural fitness function" (updated 2018-05-15): a fitness function "provides an objective integrity assessment of some architectural characteristics, which may encompass existing verification criteria, such as unit testing, metrics, monitors, and so on"; run continuously they "communicate, validate and preserve architectural characteristics". https://www.thoughtworks.com/radar/techniques/architectural-fitness-function (fetched 2026-10-07)
- [V] Book site for Ford, Parsons and Kua, Building Evolutionary Architectures: "Evolutionary architectures make it explicit what 'fit' means with as much automation as possible." https://evolutionaryarchitecture.com/ (fetched 2026-10-08)
- [U] The book itself (O'Reilly, 2017; second edition 2022) was not opened.

**Reviewer checks.**
- For each architectural rule the design states ("no cross-module imports", "all side effects idempotent", "no secrets in logs"), is there an automated check, or only prose?
- When a check fails, does it block the change, or only warn where nobody looks?
- Are there runtime fitness functions (latency, error rate, cost per unit) for the qualities the design claims?

## Describe the structure at a few fixed zoom levels (C4)

**Claim.** Describe a system with a small set of diagrams at fixed levels of detail: the system in its context (people and other systems), its containers (separately running applications and data stores), the components inside a container, and, rarely, code. Keep each diagram at one level.

**Why it holds.** Most architecture diagrams fail because they mix levels: a box for "Postgres" next to a box for "UserService class" next to a box for "AWS", with unlabelled arrows. A reader cannot tell what runs where or what talks to what. Fixing the abstraction per diagram answers one question at a time: the context diagram answers "what does this system depend on and who uses it", the container diagram answers "what processes and stores are there and how do they communicate". In C4, "container" means anything that must be running for the system to work (a web app, a worker, a database), not a Docker container.

**When it does not apply.** A single-process tool with no external dependencies needs one paragraph, not four diagrams. Code-level diagrams go stale fastest and are usually better generated from code or skipped. C4 is a notation-independent convention, not a modelling language; it does not capture behaviour over time (use a sequence diagram) or deployment topology on its own.

**Sources.**
- [V] Simon Brown, c4model.com: "The C4 model is an easy to learn, developer friendly approach to software architecture diagramming." Levels: system context, container, component, code; the model is "notation independent" (extraction). https://c4model.com/ (fetched 2026-10-08)
- [V] c4model.com, Container: "In the C4 model, a container represents an application or a data store. A container is something that needs to be running in order for the overall software system to work." It notes the term predates and differs from Docker containers (extraction). https://c4model.com/abstractions/container (fetched 2026-10-08)

**Reviewer checks.**
- Is there a context diagram showing every external system and user type the system depends on or serves?
- Does a container-level view show every separately running process and data store, with the protocol on each arrow?
- Does any single diagram mix levels so that a reader cannot tell what is a process and what is a class?

## Use a template for the architecture document (arc42)

**Claim.** When a system needs more than decision records and diagrams, write the architecture description against an established template so that readers know where to find goals, constraints, context, building blocks, runtime behaviour, deployment, cross-cutting concepts, decisions, quality requirements, risks and a glossary. Fill only the sections that carry information.

**Why it holds.** A free-form design document tends to cover what its author found interesting and omit what the next reader needs, most often constraints, quality requirements and known risks. A template is a checklist of questions: an empty "Risks and technical debt" section is visible as empty. arc42's "Glossary" section is where a team's agreed vocabulary lives, which links to the ubiquitous-language practice in [domain-design.md](domain-design.md).

**When it does not apply.** For a small system, a README, a context and container diagram, and a set of decision records cover the same ground with less to maintain. A template filled in for completeness, with every section present and most of them restating the obvious, is worse than a short document because it hides the few sections that matter.

**Sources.**
- [V] arc42.org overview: arc42 answers "what should you document and communicate about your architecture, and how"; twelve sections (Introduction and Goals, Constraints, Context and Scope, Solution Strategy, Building Block View, Runtime View, Deployment View, Crosscutting Concepts, Architectural Decisions, Quality Requirements, Risks and Technical Debt, Glossary); "Licensed under CC BY-SA 4.0"; created by Peter Hruschka and Gernot Starke (extraction). https://arc42.org/overview (fetched 2026-10-08)

**Reviewer checks.**
- Are quality requirements (latency, availability, cost, data retention) written down with numbers, or only implied?
- Is there a list of known risks and technical debt with owners?
- Is there a glossary, and do the documents and code use its terms consistently?
