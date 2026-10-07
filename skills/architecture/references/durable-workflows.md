# Durable workflows

Rules for code that runs on a durable-execution engine, where a workflow survives process crashes by replaying its recorded history. Temporal's documentation is the source here; the same constraints apply to any engine that recovers by replay [I].

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Workflow code must be deterministic

**Claim.** Given the same input and the same recorded results, workflow code must make the same calls in the same order every time it runs. All non-deterministic work (I/O, network calls, model calls, database queries, reading the clock, random numbers) goes into activities whose results are recorded.

**Why it holds.** A replay-based engine recovers a workflow by running its code again from the start and feeding it the recorded results of each step instead of re-executing them. That only reconstructs the same state if the code takes the same path. If the workflow branches on `datetime.now()` or iterates over an unordered set, the replay can take a different branch than the original run; the engine compares the commands the code issues with the recorded history, finds a mismatch, and raises a non-determinism error. The workflow is then stuck.

**When it does not apply.** Activities themselves are ordinary code and may be non-deterministic. Engines that checkpoint state rather than replay code (for example a step-function state machine defined as data) have different rules [I].

**Sources.**
- [V] Temporal documentation, Workflow Definition: determinism means "any time your Workflow code is executed it makes the same Workflow API calls in the same sequence, given the same input." On replay, generated commands are compared with the event history, and a mismatch raises a non-determinism error. Non-deterministic work goes in activities: "API calls, LLM/AI invocations, database queries, and other external interactions". https://docs.temporal.io/workflow-definition (fetched 2026-10-07)

**Reviewer checks.**
- Are workflow functions free of wall-clock time, randomness, direct I/O, threads and unordered iteration?
- Does every external interaction, including model calls, happen in an activity?
- Is there a lint or test that catches non-deterministic calls in workflow code?

## Changing workflow code needs explicit versioning

**Claim.** A code change that would make an in-flight workflow replay differently must be introduced through the engine's versioning mechanism (pinning runs to the code version that started them, or patching with a branch that old runs skip), and verified by replaying recorded histories in CI.

**Why it holds.** Workflows started last week are still running, and the next time their worker restarts they replay against the new code. Inserting a new activity call before an existing one changes the sequence of commands; every in-flight run that has already passed that point now fails replay. A patch marker records which branch a run took, so old runs replay the old path and new runs take the new one; the old branch is removed once no run that needs it remains. Replay tests run the new code against saved histories and fail before deploy if any would break.

**When it does not apply.** Workflows that always finish in seconds, before any deploy, need little versioning; draining runs before deploying may be enough. Workflows that last days or wait on humans make versioning a permanent operational duty, which is an argument for keeping long waits out of complex workflow logic [I].

**Sources.**
- [V] Temporal documentation, Python versioning: "If you make a change to your Workflow code that would cause non-deterministic behavior on Replay, you'll need to use one of our Versioning methods": Worker Versioning or patching with `workflow.patched("patch-name")`, then `workflow.deprecate_patch(...)`, then removal once old runs finish. "To determine whether your Workflow needs a patch ... you should incorporate Replay Testing." https://docs.temporal.io/develop/python/versioning (fetched 2026-10-07)

**Reviewer checks.**
- Is there a written procedure for changing a workflow with runs in flight?
- Is there a replay test in CI against recorded histories from production?
- What is the longest a workflow can run, and how many code versions can be live at once?

## Bound every activity

**Claim.** Give each activity explicit timeouts and a retry policy with a cap, and make it idempotent, because the engine may run it more than once.

**Why it holds.** The engine retries an activity whose worker crashed or timed out, so a "send invoice" activity that completed but whose completion was not recorded will run again. Without a start-to-close timeout, a hung activity holds a worker slot indefinitely; without a retry cap, a permanently failing activity retries forever and hides the failure. The defaults of any engine are chosen to be safe in general, not right for a specific call; a model call that normally takes 40 seconds and a database write that takes 5 ms need different timeouts.

**When it does not apply.** Purely local, deterministic computation can run in the workflow itself and needs no activity. Some activities should not be retried automatically at all (a payment with no idempotency support); set their retry policy to one attempt and handle failure in the workflow [I].

**Sources.**
- [V] Temporal documentation, Activity Definition: "Activities may be retried, these functions may be executed more than once"; "You need to specify at least one timeout, typically the start_to_close timeout"; "You should always make your business logic Activities idempotent in Temporal". https://docs.temporal.io/activity-definition (fetched 2026-10-07)

**Reviewer checks.**
- Does each activity have explicit timeouts and a retry policy chosen for that call, rather than the defaults?
- Is each activity idempotent, keyed on something stable across retries (workflow ID plus activity ID)?
- Are workflow inputs and activity results free of secrets, given that the engine persists them in its history?
