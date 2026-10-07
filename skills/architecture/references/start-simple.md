# Start simple and grow

Why a working simple system beats a designed complex one, when to split a codebase into services, and how to choose technology.

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Gall's law

**Claim.** A complex system that works has evolved from a simple system that worked. A complex system designed from scratch does not work and cannot be patched into working.

**Why it holds.** A working simple system gives real feedback about where the load, the users and the failures are. A large up-front design encodes guesses about all three. When ten untested components are integrated at once and the result fails, there is no known-good state to bisect from: any of the 45 pairwise interactions could be the cause. When one component is added to a working system and it fails, the new component or its one interface is the cause [I].

**When it does not apply.** It is an observation, not a theorem. Systems with stable, well-specified requirements (a compiler for a standardised language, a port of an existing system) can be designed larger up front because the guesses are not guesses. It does not say "never plan"; it says each increment must work end to end.

**Sources.**
- [U] John Gall, Systemantics: How Systems Work and Especially How They Fail (self-published 1975; Quadrangle 1977; Pocket Books 1978; later editions titled The Systems Bible). The wording "A complex system that works is invariably found to have evolved from a simple system that works" is as reported by Wikipedia, which cites pages 79-82 of the 1978 edition. The book's scans on the Internet Archive are lending-only and were not read. https://en.wikipedia.org/wiki/Systemantics

**Reviewer checks.**
- Is there a working end-to-end slice of the simplest version, or is the design a large untested whole?
- Does the plan add components one at a time to something that already works?
- Could the first version run on one machine with one database, and if not, what concretely forces it not to?

## Monolith first, and the microservice premium

**Claim.** Start a new system as one deployable unit. Distribution has a fixed cost per boundary (the "microservice premium") that pays off only when a system is too complex to manage as one unit or teams need to deploy independently.

**Why it holds.** Splitting turns a function call into a network call, and every network call brings the problems in [failure.md](failure.md): timeouts, partial failure, retries, versioned contracts, tracing, separate deploys. A function call from `orders` to `inventory` that fails throws an exception in the same stack; the same call over HTTP can time out after inventory has reserved the stock, leaving the caller unsure whether it happened. That cost is paid per boundary, while the benefit (independent deploy and scaling by separate teams) appears only with enough teams or load. Boundaries drawn before the domain is understood are usually wrong, and moving a boundary between services is far harder than moving one inside a codebase.

**When it does not apply.** Parts with genuinely different runtime needs split early for structural reasons, not stylistic ones: a component that needs a different OS image or hardware (GPUs), runs untrusted code, has a different licence boundary, or must scale on a very different curve [I]. Fowler himself notes that teams experienced with microservices can start there, and that his evidence is anecdotal.

**Sources.**
- [V] Martin Fowler, "MonolithFirst" (2015-06-03): "You shouldn't start a new project with microservices, even if you're sure your application will be big enough to make it worthwhile." Services "only work well if you come up with good, stable boundaries between the services." He calls his evidence anecdotal ("I don't feel I have enough anecdotes yet"). https://martinfowler.com/bliki/MonolithFirst.html (fetched 2026-10-07)
- [V] Martin Fowler, "MicroservicePremium" (2015-05-13): microservices "introduce complexity on their own account. This adds a premium to a project's cost and risk"; worth paying when "you have a system that's too complex to manage as a monolith". https://martinfowler.com/bliki/MicroservicePremium.html (fetched 2026-10-07)
- [V] Fowler and Lewis, "Microservices": "applications need to be designed so that they can tolerate the failure of services." https://www.martinfowler.com/articles/microservices.html (fetched 2026-10-07)

**Reviewer checks.**
- Does each independently deployed service exist because of a measured or structural need (runtime, licence, trust level, scaling profile, team independence), or because it seemed clean?
- For each boundary, who pays the premium: which timeouts, retries, contract versions and traces does it add?
- Would merging two services remove more failure modes than it adds?

## Modular monolith

**Claim.** Get the low coupling people want from services by enforcing module boundaries inside one deployable unit, with a build or CI check that fails when one module reaches into another's internals.

**Why it holds.** Most of what teams want from services is the boundary, not the network. A boundary enforced in CI gives the same "you may only call my public API" guarantee without timeouts or partial failure, and keeps the option to extract a module later at a cost already partly paid. Shopify reorganised about 6,000 Ruby classes by business domain and added a tool that flags any access to another component "through anything but its publicly defined API".

**When it does not apply.** A modular monolith with weak enforcement (boundaries documented but not checked) turns back into a ball of mud within a few releases. It still shares one deploy, one runtime and usually one database, so it does not isolate failures or let teams release independently; when those are the actual problem, it does not solve them. The Shopify and Stack Overflow cases are existence proofs for large read-heavy products, not predictions for yours.

**Sources.**
- [V] Kirsten Westeinde, Shopify Engineering, "Deconstructing the Monolith" (2019-02-21): "We wanted a solution that increased modularity without increasing the number of deployment units"; "A modular monolith is a system where all of the code powers a single application and there are strictly enforced boundaries between different domains." The tool "highlights any violations of domain boundaries (when another component is accessed through anything but its publicly defined API), and data coupling across boundaries" (extraction; the article calls the tool Wedge). https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity (fetched 2026-10-08)
- [V] Shopify's later open-source checker, Packwerk: "Packwerk is a Ruby gem used to enforce boundaries and modularize Rails applications" (extraction). https://github.com/Shopify/packwerk (fetched 2026-10-08)
- [V] Nick Craver, "Stack Overflow: The Architecture - 2016 Edition" (2016-02-17): about 209 million HTTP requests a day served by 11 IIS web servers and 4 SQL Servers plus 2 Redis servers, "a predominantly scale-up" design. No later architecture edition exists on the author's blog as of the fetch date. https://nickcraver.com/blog/2016/02/17/stack-overflow-the-architecture-2016-edition/ (fetched 2026-10-07; archive checked 2026-10-08)

**Reviewer checks.**
- Inside the single codebase, are module boundaries enforced by a build or CI check (import rules, dependency-graph test), or by convention?
- Does any module read or write another module's tables directly?
- If a module had to be extracted into a service next quarter, what would break first?

## Choose boring technology

**Claim.** Treat new technology as a scarce budget ("innovation tokens"). Solve problems with the tools the team already runs well unless one demonstrably cannot do the job, and do not adopt a tool built for a problem of a scale or shape you do not have.

**Why it holds.** A known tool has known failure modes, known fixes and people who have seen them. A new tool's failure modes are discovered by you, in production, under pressure. A team that already runs Postgres knows how it behaves when the disk fills, how to restore it and what its locks do; the same team adopting a new distributed database learns those things during its first incident. Copying a tool from a company with a different problem imports its trade-offs: Cassandra prioritises write availability because Amazon's "add to cart" must never fail, which is the wrong trade for a read-heavy workload loaded once a night.

**When it does not apply.** Boring is relative to the team: the tool a team already operates well is boring even if it is new to the industry. Boring is a reason to choose, not to stay: when the existing tool provably cannot do the job (McKinley's own process allows for this), switching is right, with a migration plan for the old one.

**Sources.**
- [V] Dan McKinley, "Choose Boring Technology": "every company gets about three innovation tokens. You can spend these however you want, but the supply is fixed for a long while." For new technology, "the magnitude of unknown unknowns is significantly larger". https://mcfunley.com/choose-boring-technology (fetched 2026-10-07)
- [V] Oz Nova, "You Are Not Google" (Bradfield blog, 2017-06-07), read through a Wayback Machine capture of 2020-01-05 because the live page now redirects through a sign-in wall. Proposes UNPHAT: "Don't even start considering solutions until you Understand the problem"; "eNumerate multiple candidate solutions"; read the Paper; determine the Historical context; "Weigh Advantages against disadvantages. Determine what was de-prioritized to achieve what was prioritized"; "Think!" The Cassandra example is from this essay. https://web.archive.org/web/20200105135110id_/https://blog.bradfieldcs.com/you-are-not-google-84912cf44afb (fetched 2026-10-08)

**Reviewer checks.**
- How many technologies new to this team does the design add, and for each: what existing tool was tried, and what exactly failed?
- For each tool adopted from a large company, what problem was it built for, and does this system have that problem?
- What would have to be different (data size, write rate, team size) for the team to choose differently?
