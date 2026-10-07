# LLM systems as unreliable dependencies

How to design systems that call large language models: prefer fixed workflows to open-ended agents, bound every model call, test with evaluations, plan for provider failure, and validate output before it changes state. Everything in [failure.md](failure.md) applies to model calls unchanged.

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Start simple: workflows before agents

**Claim.** Use the simplest design that works: a single model call, then a fixed workflow of calls orchestrated by code, and only then an agent that chooses its own steps. When an agent is used, bound it with stopping conditions (iterations, tokens, cost, wall-clock time) and run it in a sandbox.

**Why it holds.** Each model step has some error rate, and chaining steps compounds it: five steps that are each right 95 percent of the time are all right about 77 percent of the time [I]. A workflow fixes the number and order of steps, so cost, latency and failure paths are known and testable. An agent decides its own number of steps, so a confused agent can loop, spend without limit, or take actions nobody anticipated. Frameworks that hide the prompts and responses behind abstractions make these failures harder to see.

**When it does not apply.** Open-ended tasks whose steps cannot be listed in advance (exploring an unfamiliar codebase, multi-step research) justify an agent loop, with limits. A workflow engine can host both: a workflow of bounded steps, one of which runs an agent loop with its own caps [I].

**Sources.**
- [V] Anthropic, "Building effective agents": "We recommend finding the simplest solution possible, and only increasing complexity when needed." "Workflows are systems where LLMs and tools are orchestrated through predefined code paths. Agents, on the other hand, are systems where LLMs dynamically direct their own processes and tool usage." "The autonomous nature of agents means higher costs, and the potential for compounding errors." It recommends "extensive testing in sandboxed environments, along with the appropriate guardrails", stopping conditions such as a maximum number of iterations, and warns that frameworks "often create extra layers of abstraction that can obscure the underlying prompts and responses". https://www.anthropic.com/engineering/building-effective-agents (fetched 2026-10-07; key sentences re-checked 2026-10-08)

**Reviewer checks.**
- Is each model step a bounded call inside a fixed workflow? Where an agent loop exists, what caps its iterations, tokens, cost and time?
- Could any agent be replaced by a fixed sequence of calls?
- Can every prompt and response be inspected in logs or traces?

## Evaluations are the regression tests

**Claim.** Keep a suite of evaluations (inputs plus grading logic) built from real tasks and real failures, and run it on every change to prompts, models, tools or retrieval. Track regression evals (which should stay near 100 percent) separately from capability evals (which measure stretch goals).

**Why it holds.** Prompt, model and tool changes shift behaviour in ways no type checker or unit test sees. A prompt edit that fixes one complaint can break three cases nobody re-checked; a provider's model update can change output formats. A fixed suite run before release is the only way to tell an improvement from a regression before users do. Reading transcripts, not only scores, distinguishes a model failure from a grader failure.

**When it does not apply.** Model-graded evals can share the blind spots of the model under test; calibrate them against human labels. A suite built only from synthetic cases drifts from real use. For a call whose output is checked deterministically downstream (it must parse and pass business rules), the deterministic check covers part of what an eval would [I].

**Sources.**
- [V] Anthropic, "Demystifying evals for AI agents": an eval is "a test for an AI system: give an AI an input, then apply grading logic to its output to measure success"; regression evals keep a near-100 percent pass rate while capability evals start low; graders are code-based, model-based or human; read transcripts; start with "20-50 tasks derived from real production failures". https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents (fetched 2026-10-07)

**Reviewer checks.**
- Is there an eval suite built from real tasks and failures, run on every prompt, model or tool change, with a recorded pass rate?
- Are model-based graders checked against human judgement?
- Does each production failure become a new eval case?

## Treat the model provider as a failing remote service

**Claim.** Every model call needs a timeout, a capped retry with backoff for retryable errors (rate limits, overload, server errors), no retry for non-retryable ones (invalid request, spend cap), handling for errors that arrive mid-stream, and a logged request ID. Plan explicitly for the provider being down or overloaded: queue the work, fail visibly with the work saved, or fall back to a path that is itself covered by evals.

**Why it holds.** A hosted model is a remote service with variable latency, rate limits and capacity incidents; a self-hosted one is a service you run, with the same properties. Overload and rate-limit errors are routine, not exceptional, and a streaming response can fail after the HTTP 200 has already arrived. Tokens are a billed resource, so an unbounded retry loop is also an unbounded bill. A fallback to a different model is a different behaviour: if it has never been evaluated, it is an untested code path that runs only during incidents (see fallback in [failure.md](failure.md)).

**When it does not apply.** Silently falling back to a weaker model can corrupt output users trust; for some steps, failing visibly and retrying later is better [I]. Batch workloads with no user waiting can simply queue until the provider recovers.

**Sources.**
- [V] Anthropic API, "Errors": 429 rate limit; 500 internal error; 504 timeout ("Consider using the streaming Messages API for long-running requests"); 529 "The API is temporarily overloaded"; "an error can occur after the API returns a 200 response" when streaming; every response has a `request-id` to log; a spend-cap 429 "has no `retry-after` header and keeps failing until access resumes"; the SDK retries "twice by default, honoring the `retry-after` header when present". https://platform.claude.com/docs/en/api/errors (fetched 2026-10-07)

**Reviewer checks.**
- Does each model call have a timeout, a retry cap with backoff, a list of non-retryable errors, and handling for mid-stream failure?
- Is the provider's request ID logged with each call?
- What happens to user work when the provider is down for an hour, and is any fallback path covered by evals?
- Is spend capped per user, project and time window?

## Constrain output to a schema, then validate the meaning

**Claim.** Where the provider supports it, use structured outputs or strict tool use so responses conform to a JSON schema. Then validate the parsed result against business rules before it changes any state, and handle the cases where the schema is not met (refusal, truncation).

**Why it holds.** Constrained decoding makes malformed JSON impossible by restricting which tokens the model can produce; it does not make the content correct. A schema-valid response can reference an object that does not exist, set a price to a negative number or contradict an earlier step. Syntax is guaranteed; semantics are not [I]. Even syntax has exceptions: a refusal takes precedence over the schema, and output cut off at the token limit is incomplete.

**When it does not apply.** Free-text output for humans needs no schema. Self-hosted models need their own constrained-decoding support or a parse-validate-retry loop with a cap. Schema features vary by provider (recursive schemas and numeric or length constraints may be unsupported), so the schema the model sees can be looser than the one the application enforces.

**Sources.**
- [V] Claude documentation, "Structured outputs": "Structured outputs guarantee schema-compliant responses through constrained decoding"; output may not match when `stop_reason` is "refusal" ("the refusal message takes precedence over schema constraints") or "max_tokens"; some schema features, including recursive schemas and numeric and string-length constraints, are unsupported; strict tool use validates tool names and inputs. https://platform.claude.com/docs/en/docs/build-with-claude/structured-outputs (fetched 2026-10-07)

**Reviewer checks.**
- Is every model output that drives an action parsed against a schema and then validated against business rules?
- What happens on refusal and on truncation?
- Is the schema the model sees generated from the same source as the type the consumer uses, so the two cannot drift?

## Model output is untrusted input

**Claim.** Treat anything a model produces (text, code, commands, tool arguments, file paths, URLs) as untrusted input from an external party: validate it, run generated code in an isolated sandbox with no access to secrets, and limit which tools and data a model-driven step can reach.

**Why it holds.** A model's output is shaped by its input, which can include text from users, web pages or documents written by an attacker. An instruction hidden in a retrieved document can lead the model to call a tool with arguments the user never intended. If the tool can read secrets or write to production, the model has become a path from the attacker's text to those capabilities. Least privilege (see [security.md](security.md)) applied to model-driven steps limits what such a path can reach.

**When it does not apply.** Output that is only displayed to the same user who wrote the input, with no tools and no rendering of active content, carries little risk [I]. The cost of sandboxing is real; scale it to what the generated output can do.

**Sources.**
- [V] Anthropic, "Building effective agents": agents call for "extensive testing in sandboxed environments, along with the appropriate guardrails". https://www.anthropic.com/engineering/building-effective-agents (fetched 2026-10-07)
- [I] The prompt-injection mechanism described above is general knowledge in the field; no primary source was opened for it on the fetch dates.

**Reviewer checks.**
- Which tools and data can each model-driven step reach, and is that the minimum it needs?
- Is generated code or content run in an isolated environment without credentials?
- Can text from users or retrieved documents influence a tool call that has side effects?
