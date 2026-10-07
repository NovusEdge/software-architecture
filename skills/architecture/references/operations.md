# Operating it

How a system is run once it exists: reliability targets, delivery measures, who operates what, the default way to build a new service, learning from incidents, and the twelve-factor conventions for deployable applications. Metrics and tracing are in [observability.md](observability.md).

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## SLOs and error budgets

**Claim.** Pick a few service level indicators that measure what users experience (usually good events divided by total events for a critical journey), set a target for each (the SLO), and treat the gap between the target and 100 percent as an error budget. A written policy says what happens when the budget is spent, such as pausing feature releases for reliability work.

**Why it holds.** 100 percent reliability is unreachable, and each additional nine is commonly said to cost far more than the last [U]. Without a target, every incident restarts the argument between shipping and stabilising. A 99.9 percent SLO over 30 days allows about 43 minutes of full failure; while budget remains, the team ships; when it is gone, the policy decides, and both sides agreed to the policy in advance. Measuring from the user's journey ("checkout completes within 2 seconds") rather than from internals ("database CPU") keeps the target tied to what matters.

**When it does not apply.** Without enough traffic, the indicator is too noisy to act on; with no users yet, an SLO is premature. An SLO that nobody acts on when it is breached is decoration [I].

**Sources.**
- [V] Google SRE Workbook, "Implementing SLOs": an SLI is "an indicator of the level of service that you are providing", typically good events over total events; the error budget is the gap between 100 percent and the SLO; an error budget policy states actions when the budget is spent, "such as halting feature releases or prioritizing reliability work"; choose SLIs from "common tasks and critical activities" of users (extraction). https://sre.google/workbook/implementing-slos/ (fetched 2026-10-07)
- [I] 43 minutes is 0.1 percent of 30 days (43,200 minutes).

**Reviewer checks.**
- Which two or three user journeys have an SLI, a numeric SLO and an owner?
- Is there an alert on SLO burn rate, rather than only on resource thresholds?
- Is there a written policy for what happens when the budget is exhausted, and has it ever been applied?

## Measure delivery with the DORA metrics, as trends

**Claim.** Measure software delivery by change lead time, deployment frequency and failed-deployment recovery time (throughput), and by change fail rate and deployment rework rate (instability). Use them to find where to improve and to compare a team with its own past, not as targets or league tables.

**Why it holds.** DORA's research finds that speed and stability are not trade-offs: teams that deploy small changes often also fail less and recover faster. A deploy that contains one change is easy to review, test and roll back, and when it fails the cause is obvious; a deploy that contains three months of changes is none of those. Measuring both sides prevents optimising one at the expense of the other.

**When it does not apply.** The metrics describe the delivery pipeline of a team that already ships to production; they say nothing about whether the product is right. Turned into targets they are gamed (splitting deploys to raise frequency), as Goodhart's law predicts. Comparing very different applications with them is misleading.

**Sources.**
- [V] DORA, "DORA's software delivery performance metrics": throughput metrics change lead time, deployment frequency and failed deployment recovery time; instability metrics change fail rate and deployment rework rate; "speed and stability are not tradeoffs. In fact, we see that the metrics are correlated for most teams"; warns against "Setting metrics as a goal" (extraction). https://dora.dev/guides/dora-metrics/ (fetched 2026-10-08)
- [V] DORA research page: "DORA is the longest running academically rigorous research investigation of its kind" (extraction). https://dora.dev/research/ (fetched 2026-10-08)
- [U] The survey reports and the book Accelerate (Forsgren, Humble and Kim, 2018) that underlie the metrics were not opened.

**Reviewer checks.**
- How long does a committed change take to reach production, and can it be rolled back automatically?
- Are lead time and change failure rate measured at all?
- Is the design making deploys larger or rarer (shared release trains, manual gates) without a stated reason?

## The team that builds it operates it

**Claim.** The team that develops a system also deploys, operates and supports it, with central teams providing tooling that makes this cheap. Ownership of the whole life cycle sits with the people who can change the design.

**Why it holds.** The person paged for a defect is then the person who can fix its cause. When development hands code to a separate operations team, operational pain lands on people who cannot change the code, and feedback about fragile designs travels through tickets and meetings, slowly and lossily. Netflix moved to "operate what you build" after finding that handoffs between developers and operations specialists made deploys slower and incidents longer to resolve.

**When it does not apply.** Without tooling for deployment, monitoring and on-call, full ownership becomes overload (see team cognitive load in [boundaries.md](boundaries.md)); Netflix pairs it with central platform teams and a rotation. Some domains need specialists (database internals, security response) whose expertise one product team cannot hold. A very small team is full-cycle by default; the questions are on-call fairness and runbooks.

**Sources.**
- [V] Philip Fisher-Ogden, Greg Burrell and Dianne Marsh, Netflix Technology Blog, "Full Cycle Developers at Netflix — Operate What You Build" (2018), read through a Wayback Machine capture of 2023-10-09: "'Operate what you build' puts the devops principles in action by having the team that develops a system also be responsible for operating and supporting that system. Distributing this responsibility to each development team, rather than externalizing it, creates direct feedback loops and aligns incentives." Downsides acknowledged: breadth "increases each developer's cognitive load". https://web.archive.org/web/20231009062701id_/https://netflixtechblog.com/full-cycle-developers-at-netflix-a08c31f83249 (fetched 2026-10-08)

**Reviewer checks.**
- Who is on call for each component, and can they change its code and configuration?
- Does each on-call person have runbooks and the access needed to act?
- Is any component's operational knowledge held by one person?

## Golden paths

**Claim.** Provide a supported, opinionated default way to build and run a new service or job (a template that already includes logging, metrics, health checks, timeouts, deployment and security settings). Teams may leave the path when they have a reason, and then own the difference.

**Why it holds.** Every new service built from scratch makes the same decisions again, and some get them wrong: one service has no request timeout, another logs secrets, a third has no health check. A template makes the right defaults free, so the easy path is the correct one. Netflix's paved road and Spotify's golden path work by being easier than the alternative, not by mandate.

**When it does not apply.** With one team, a golden path is a template repository and a README; building a developer portal is over-investment [I]. A path that is mandatory and badly maintained becomes an obstacle teams route around.

**Sources.**
- [V] Spotify Engineering, "How We Use Golden Paths to Solve Fragmentation in Our Software Ecosystem" (2020-08): the Golden Path is the "opinionated and supported" way to build something; "If you are an adventurer you can of course leave the Golden Path and do your own thing, but then you will not have the same support." https://engineering.atspotify.com/2020/08/how-we-use-golden-paths-to-solve-fragmentation-in-our-software-ecosystem (fetched 2026-10-07)
- [V] Netflix Technology Blog, "Full Cycle Developers at Netflix": "We don't mandate adoption of those paved roads but encourage adoption by ensuring that development and operations using those technologies is a far better experience than not using them." https://web.archive.org/web/20231009062701id_/https://netflixtechblog.com/full-cycle-developers-at-netflix-a08c31f83249 (fetched 2026-10-08)

**Reviewer checks.**
- Is the default way to start a new service or worker a template that already includes logging, metrics, timeouts and health checks?
- Do existing services diverge from the template, and is each divergence deliberate?

## Blameless postmortems

**Claim.** After an incident, write a postmortem that identifies contributing causes in systems and processes, not individuals, with follow-up actions that have owners and dates.

**Why it holds.** If an honest account of an incident gets someone punished, people stop giving honest accounts, and the next incident has the same hidden cause. "An engineer ran the wrong command" ends the inquiry; "the command for production and staging differ by one flag, and nothing confirms which is targeted" leads to a fix that protects everyone. People can not be fixed; the systems and processes around them can.

**When it does not apply.** Blameless does not mean consequence-free for repeated disregard of known process. A postmortem whose actions have no owners or dates changes nothing.

**Sources.**
- [V] Google SRE book, "Postmortem Culture: Learning from Failure": "For a postmortem to be truly blameless, it must focus on identifying the contributing causes of the incident without indicting any individual or team"; "You can't 'fix' people, but you can fix systems and processes to better support people making the right choices." https://sre.google/sre-book/postmortem-culture/ (fetched 2026-10-07)

**Reviewer checks.**
- Do past incidents have postmortems with completed follow-up actions?
- Did any postmortem lead to a design change, and is that change recorded as a decision?

## Twelve-factor conventions, and where they are dated

**Claim.** The twelve-factor app conventions for deployable services still describe good defaults: one codebase with many deploys; explicitly declared dependencies; configuration separate from code; backing services as attached resources; separate build, release and run stages; stateless processes; port binding; scaling out by process; fast startup and graceful shutdown; dev/prod parity; logs as event streams; admin tasks as one-off processes. Apply the concepts; check the details against current platforms.

**Why it holds.** Each factor removes a common cause of deploy-time surprise. A process that keeps session state in memory cannot be restarted or scaled without logging users out; one that writes logs to a local file loses them when the container is replaced; one that reads configuration from a file baked into the image needs a rebuild to change a database URL. The conventions make processes disposable, which is what schedulers, autoscalers and rolling deploys assume.

**When it does not apply.** The document dates from 2011, when container-based deployment was just emerging, and its maintainers say that while the concepts remain relevant "many of the details have started to show their age". Storing secrets in environment variables, for instance, exposes them to every child process and to crash dumps; a secret manager or mounted files are now the common practice [I]. It says little about observability beyond logs, or about stateful services. Long-running, stateful workloads (databases, game servers) do not fit "stateless processes" and need their own rules.

**Sources.**
- [V] The Twelve-Factor App, by Adam Wiggins and Heroku: the twelve factors as listed above, for example "Store config in the environment", "Execute the app as one or more stateless processes", "Treat logs as event streams" (extraction). https://12factor.net/ (fetched 2026-10-08)
- [V] Twelve-Factor blog, "Twelve-Factor App Methodology is now Open Source" (2024-11-12): "the concepts remain relevant, many of the details have started to show their age"; the project was written "when container-based deployment was still just emerging" and is being refreshed as a living document (extraction). https://www.12factor.net/blog/open-source-announcement (fetched 2026-10-08)

**Reviewer checks.**
- Can every process be killed and replaced at any moment without losing user state or in-flight work?
- Is configuration that differs between environments outside the build artefact, and are secrets kept out of plain environment variables where a better mechanism exists?
- Does a deploy promote the same built artefact through every environment?
