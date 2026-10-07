# Observability

What to measure, how to alert, and how to follow one request across services: the four golden signals, the RED and USE methods, latency distributions, label cardinality and distributed tracing. SLOs and error budgets are in [operations.md](operations.md).

Markers: [V] verified on the fetched page, with URL and fetch date; [U] not verified on a primary page; [I] inference by the author of this file. "(extraction)" means the quote came through a summarising fetch tool; re-open the page before quoting it in a decision.

## Alert on symptoms users feel, using the golden signals

**Claim.** For each user-facing service, measure latency, traffic, errors and saturation, and page a human only for symptoms that affect users and need action now. Causes (high CPU, a full disk) are for dashboards and tickets, not pages, unless they predict imminent user impact.

**Why it holds.** Users feel symptoms (slow pages, failed checkouts), not causes. An alert on CPU above 80 percent fires during a harmless batch job and stays silent when a bad config makes every request fail fast at 10 percent CPU. An alert on "checkout error rate above 1 percent for 5 minutes" fires in the second case and not the first. Pages that are not actionable train people to ignore pages. Saturation is the one cause-like signal worth watching closely, because it predicts the symptom before it arrives.

**When it does not apply.** Batch and pipeline systems have no request latency; their symptoms are freshness (how old is the newest output) and completeness. Some causes are worth paging on because the symptom, when it comes, is unrecoverable (a disk that will fill in an hour and corrupt the database) [I].

**Sources.**
- [V] Google SRE book, "Monitoring Distributed Systems": the four golden signals are latency ("The time it takes to service a request"), traffic, errors ("The rate of requests that fail, either explicitly (e.g., HTTP 500s), implicitly, or by policy") and saturation ("How 'full' your service is"); alert on symptoms rather than causes; "Every page should be actionable" (extraction). https://sre.google/sre-book/monitoring-distributed-systems/ (fetched 2026-10-08)

**Reviewer checks.**
- For each user-facing service, are latency, traffic, errors and saturation measured?
- Does every page correspond to user impact or imminent, unrecoverable harm, and does it say what to do?
- Are failed requests counted as errors even when they return quickly (or with HTTP 200 and an error body)?

## RED for services, USE for resources

**Claim.** For every service, track Rate (requests per second), Errors (failing requests per second) and Duration (latency distribution). For every resource (CPU, memory, disk, network, connection pools, queues), check Utilisation, Saturation and Errors.

**Why it holds.** The two checklists answer different questions in an incident. RED tells you which service is unhappy and how its users are affected; USE tells you which resource inside it is the bottleneck. Starting from whatever metrics happen to exist leads to staring at the ones that are easy to collect. A checklist says what must exist: a connection pool with no saturation metric (waiters) is the bottleneck nobody can see.

**When it does not apply.** Both are starting points, not complete instrumentation. Business-level signals (orders per minute, jobs completed) often detect problems neither method sees, such as a bug that makes requests succeed with wrong results [I].

**Sources.**
- [V] Brendan Gregg, "The USE Method": "For every resource, check utilization, saturation, and errors." Utilisation is "the average time that the resource was busy servicing work"; saturation "the degree to which the resource has extra work which it can't service, often queued"; errors "the count of error events" (extraction). https://www.brendangregg.com/usemethod.html (fetched 2026-10-08)
- [V] Tom Wilkie, Grafana Labs blog, "The RED Method: How to instrument your services" (2018-08): "For every resource, monitor: Rate (the number of requests per second), Errors (the number of those requests that are failing), Duration (the amount of time those requests take)"; RED is for services, USE for machines (extraction). https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/ (fetched 2026-10-08)

**Reviewer checks.**
- Does every service emit rate, errors and a latency histogram?
- Does every bounded resource (pool, queue, semaphore) expose how many are waiting, not only how many are in use?
- Is there at least one business-outcome metric per critical journey?

## Measure latency as a distribution

**Claim.** Record latency as a histogram and report percentiles (median, 99th, 99.9th), not the mean. Report successful and failed requests separately.

**Why it holds.** Means hide the tail. If 99 requests take 10 ms and one takes 5 seconds, the mean is about 60 ms, which describes no actual request, while the user who waited 5 seconds is invisible. A page that makes 100 backend calls is slowed by the slowest of them, so the backend's 99th percentile is close to the page's typical experience [I]. Fast failures pull the average down: a service rejecting 60 percent of requests in 1 ms can show a superb median while every successful request is slow.

**When it does not apply.** Percentiles cannot be averaged across hosts or time windows; aggregate the histograms, then compute the percentile. For very low-volume endpoints, high percentiles are noise; look at individual slow requests instead.

**Sources.**
- [V] Google SRE book, "Monitoring Distributed Systems": rather than mean latency, "collect request counts bucketed by latencies" so that tail latency is visible; distinguish latency of successful and failed requests (extraction). https://sre.google/sre-book/monitoring-distributed-systems/ (fetched 2026-10-08)
- [V] Amazon Builders' Library, "Using load shedding to avoid overload": "if a service is load shedding 60 percent of its traffic, the service's median latency might look pretty amazing even if its successful request latency is terrible". https://web.archive.org/web/20240107143427id_/https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/ (fetched 2026-10-08)

**Reviewer checks.**
- Is latency stored as histograms, and are SLOs and alerts defined on percentiles?
- Is the latency of successful requests reported separately from errors?
- Are percentiles computed from aggregated histograms rather than averaged?

## Keep metric label cardinality bounded

**Claim.** Do not use unbounded values (user IDs, email addresses, request IDs, raw URLs) as metric labels. Put high-cardinality detail in logs and traces, where it is indexed per event.

**Why it holds.** In a time-series database every unique combination of label values is a separate series, stored and indexed for its whole retention. A request counter labelled by `endpoint` (20 values) and `status` (5 values) is 100 series. Add `user_id` with a million users and it is 100 million series, which exhausts memory or the monitoring bill. Logs and traces are stored per event, so one more field on each event costs almost nothing.

**When it does not apply.** Observability tools built on event storage rather than pre-aggregated time series handle high-cardinality fields by design; the rule is specific to metric systems like Prometheus [I]. Low, fixed sets of tenants (ten enterprise customers) can be labels.

**Sources.**
- [V] Prometheus documentation, "Metric and label naming": "Remember that every unique combination of key-value label pairs represents a new time series, which can dramatically increase the amount of data stored. Do not use labels to store dimensions with high cardinality (many different label values), such as user IDs, email addresses, or other unbounded sets of values". https://prometheus.io/docs/practices/naming/ (fetched 2026-10-08)

**Reviewer checks.**
- Does any metric label take values from an unbounded set?
- Where per-user or per-request detail is needed, is it in logs or traces rather than metrics?

## Trace requests across process boundaries

**Claim.** Propagate a trace context (trace ID and parent span ID) on every call between processes, including through queues and workflow engines, and record a span for each unit of work, so that one request can be followed through every service it touches. Use the W3C Trace Context headers for interoperability.

**Why it holds.** With three services, a slow request can be found by reading three logs. With twenty services and asynchronous queues, it cannot: the log lines for one user action are scattered across processes, interleaved with thousands of others, and have no common key. A trace ID carried on every hop, with spans recording each step's start, end and parent, lets a tool assemble the whole request and show where the time went. A trace ID also gives every log line a key that joins it to the rest of the request.

**When it does not apply.** A single-process application gets most of the value from structured logs with a request ID. Context propagation through asynchronous boundaries (a message queue, a scheduled retry) must be done explicitly; most libraries handle HTTP and gRPC automatically but not message headers [I]. Tracing every request at high volume is expensive; sampling is normal, which means a specific slow request may not have been traced.

**Sources.**
- [V] OpenTelemetry documentation, "Traces": a trace is "the path of a request through your application"; a span is "a unit of work or operation"; context propagation is "the core concept that enables Distributed Tracing", allowing spans to be "correlated with each other and assembled into a trace, regardless of where Spans are generated" (extraction). https://opentelemetry.io/docs/concepts/signals/traces/ (fetched 2026-10-08)
- [V] W3C Recommendation, "Trace Context" (2021-11-23): "This specification defines standard HTTP headers and a value format to propagate context information that enables distributed tracing scenarios"; headers `traceparent` and `tracestate` (extraction). https://www.w3.org/TR/trace-context/ (fetched 2026-10-08)

**Reviewer checks.**
- Is a trace or correlation ID propagated across every process boundary, including queues, workflow engines and calls to external providers?
- Do log lines carry the trace ID?
- For an asynchronous job started by a user request, can the job's work be linked back to the request?
