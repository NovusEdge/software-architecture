# Domain-driven design

Strategic and tactical ideas from domain-driven design that shape boundaries and consistency: bounded contexts, ubiquitous language, context maps and aggregates.

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Bounded contexts

**Claim.** Do not try to build one model of the whole business. Divide it into bounded contexts, each with its own consistent model and an explicit boundary, and state how the contexts relate.

**Why it holds.** The same word means different things in different parts of a business, and forcing one definition makes every part worse. At an electricity utility "meter" can mean the grid connection, the customer's connection or the physical device. A single `Meter` class that serves billing, field service and grid planning accumulates fields and rules from all three, and a change for one breaks another. Three models, each correct in its context, with a translation where they meet, keeps each simple. Bounded contexts are also natural candidates for module or service boundaries, because coupling inside one is high and between them is deliberate.

**When it does not apply.** A small system in one domain has one context; drawing several adds translation layers with nothing to translate. Contexts drawn before the domain is understood are as wrong as early service boundaries (see [start-simple.md](start-simple.md)).

**Sources.**
- [V] Martin Fowler, "BoundedContext" (2014-01-15): "total unification of the domain model for a large system will not be feasible or cost-effective"; the "meter" example from an electricity utility (extraction). https://martinfowler.com/bliki/BoundedContext.html (fetched 2026-10-08)
- [V] Eric Evans, DDD Reference (2015), Bounded Context: "Explicitly define the context within which a model applies. Explicitly set boundaries in terms of team organization, usage within specific parts of the application, and physical manifestations such as code bases and database schemas." https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf (fetched 2026-10-08)

**Reviewer checks.**
- Does any central entity (Customer, Order, Project, User) carry fields and rules for several unrelated parts of the business?
- Are the contexts named, and does each have one owning team or module?
- Where two contexts share a word, is the translation between them explicit?

## Ubiquitous language

**Claim.** Within a bounded context, use one rigorous vocabulary, shared by domain experts and developers, in conversation, documents and code. When the language changes, change the code.

**Why it holds.** Translation between how experts talk and how code is named loses information at every hop. If product people say "cancel" for what the code calls `void_order`, and `cancel_order` exists but means something else, every requirement is translated by whoever reads it, and some translations are wrong. Using the experts' term in the code makes misunderstandings visible in review: a function called `cancel` that does not do what experts mean by cancel is a bug anyone can spot.

**When it does not apply.** Purely technical subsystems (a cache, a scheduler) have no domain experts beyond engineers; their vocabulary is the technical one. The language is per context; enforcing one company-wide vocabulary recreates the single-model problem above.

**Sources.**
- [V] Martin Fowler, "UbiquitousLanguage" (2006-10-31): "Ubiquitous Language is the term Eric Evans uses in Domain Driven Design for the practice of building up a common, rigorous language between developers and users"; "software doesn't cope well with ambiguity" (extraction). https://martinfowler.com/bliki/UbiquitousLanguage.html (fetched 2026-10-08)
- [V] Eric Evans, DDD Reference (2015), Ubiquitous Language: "Use the model as the backbone of a language. Commit the team to exercising that language relentlessly in all communication within the team and in the code." https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf (fetched 2026-10-08)

**Reviewer checks.**
- Do the design documents, the API and the code use the same name for the same concept?
- Is there a glossary, and is it current?
- Are there two names for one concept, or one name for two concepts, within a single context?

## Context maps and anticorruption layers

**Claim.** Record how bounded contexts relate: who is upstream, who adapts to whom, and what is shared. When your context depends on a model you do not control, put a translating layer (an anticorruption layer) between it and your model.

**Why it holds.** Relationships between contexts are where integration bugs and political friction live, and they are usually implicit. If an order service consumes a legacy ERP's "customer" record directly, every quirk of the ERP's model (status codes, nullable fields, a "customer" that is sometimes a site) spreads through the order code. An anticorruption layer converts the ERP's shape into the order context's own `Customer` at one boundary, so when the ERP changes, one translator changes. The DDD reference names the alternatives: partnership, shared kernel, customer/supplier, conformist (adopt the upstream model as is), anticorruption layer, open-host service, published language and separate ways.

**When it does not apply.** A conformist relationship is the right choice when the upstream model is good enough and translation would cost more than it saves. A shared kernel is cheap until two teams need to change it at different speeds. Small systems with one team rarely need a written map [I].

**Sources.**
- [V] Eric Evans, DDD Reference (2015), Context Map: "Identify each model in play on the project and define its bounded context. This includes the implicit models of non-object-oriented subsystems. Name each bounded context, and make the names part of the ubiquitous language." Anticorruption Layer: "As a downstream client, create an isolating layer to provide your system with functionality of the upstream system in terms of your own domain model." Conformist: "Eliminate the complexity of translation between bounded contexts by slavishly adhering to the model of the upstream team." https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf (fetched 2026-10-08)

**Reviewer checks.**
- For each external or legacy system the design depends on, does its model stop at a translating boundary, or does it leak through the codebase?
- Is the relationship to each upstream (conformist, customer/supplier, anticorruption layer) a deliberate choice?
- Is any shared kernel changed by more than one team?

## Aggregates as consistency boundaries

**Claim.** Group the objects that must change together under one root and treat the group as a unit. Transactions do not cross aggregate boundaries; other aggregates are referenced by identity and brought into line with eventual consistency. Keep aggregates small: model only true invariants inside one.

**Why it holds.** An invariant is a rule that must hold at the end of every transaction, such as "an order's total equals the sum of its lines". Putting the order and its lines in one aggregate, changed only through the order root, lets one transaction enforce that rule. Putting the whole product catalogue, its backlog and all its releases into one aggregate "for consistency" makes every edit lock or conflict with every other edit to the same product, which fails as soon as two users work at once. Vernon's rule is to model only the invariants that are truly transactional and make everything else eventually consistent between aggregates.

**When it does not apply.** Simple CRUD data with no cross-object rules gains nothing from aggregate design. Some invariants span what would be two aggregates and cannot tolerate any lag (a bank balance never below zero across two accounts in one transfer); those force either a larger aggregate, a saga with compensation (see [data-and-events.md](data-and-events.md)), or a database transaction across both, with the contention that brings.

**Sources.**
- [V] Martin Fowler, "DDD_Aggregate" (2013-04-23): an aggregate is "A cluster of domain objects that can be treated as a single unit"; "Any references from outside the aggregate should only go to the aggregate root"; "Transactions should not cross aggregate boundaries" (extraction). https://martinfowler.com/bliki/DDD_Aggregate.html (fetched 2026-10-08)
- [V] Vaughn Vernon, "Effective Aggregate Design, Part I" (2011): "An invariant is a business rule that must always be consistent"; rules "Model True Invariants In Consistency Boundaries" and "Design Small Aggregates". https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf (fetched 2026-10-08)
- [V] Eric Evans, DDD Reference (2015), Aggregates: "Cluster the entities and value objects into aggregates and define boundaries around each. Choose one entity to be the root of each aggregate, and allow external objects to hold references to the root only." https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf (fetched 2026-10-08)
- [U] Vernon's parts II and III ("reference other aggregates by identity", "use eventual consistency outside the boundary") were not opened; the rules are stated here from memory of those papers.

**Reviewer checks.**
- For each rule the design says "must always hold", which aggregate or transaction enforces it?
- Does any transaction update several aggregates, and if so, is that deliberate and is the contention acceptable?
- Is any aggregate large enough that two ordinary users editing at once would conflict?
