# software-architecture

**A sourced software architecture reference for Claude Code, with a review command.**

This plugin gives an agent, and the person working with it, a reference of
established architecture and resilience practice: how to make and record
decisions, where to draw boundaries, how systems fail under load, how to change
data and contracts safely, how to operate and secure what you build, and how to
design around language models. Every principle says why it holds, when it does
not apply, where it comes from, and what a reviewer should ask.

The same reference drives a review command that reads a repository's design
documents and decision ledger and writes a dated review with concrete failure
scenarios.

## Install

From Claude Code:

```sh
/plugin marketplace add NovusEdge/software-architecture
/plugin install software-architecture@software-architecture
```

Or from a local checkout:

```sh
/plugin marketplace add /path/to/software-architecture
/plugin install software-architecture@software-architecture
```

Restart Claude Code after installing.

### Codex

From the Nimble Fox team marketplace:

```sh
codex plugin marketplace add nimble-fox-ai/agent-plugins
codex plugin add software-architecture@nimble-fox
```

Codex reads the root `plugin.json`; Claude Code reads `.claude-plugin/plugin.json`.
Both load the same `skills/` directory, so there is one copy of every file.

What carries over:

- The `architecture` skill, with all its references.
- The `review` skill. `skills/review/agents/openai.yaml` sets
  `allow_implicit_invocation: false`, Codex's counterpart of
  `disable-model-invocation`, so it runs only when you name it. Codex names the
  skill `software-architecture:review`.

What does not:

- The `architecture-reviewer` agent. Codex plugins cannot ship agents, and the
  agent's `model`, `effort` and `tools` settings have no Codex equivalent. The
  review skill tells Codex to spawn a subagent with the body of
  `agents/architecture-reviewer.md` as its prompt, or to follow that file
  itself, so the review still runs, on whatever model the session uses.
- Nothing else is lost: the plugin has no hooks, commands or MCP servers.

## Use the reference while designing

The `architecture` skill loads when an agent designs or changes how a system is
structured, writes a decision record or design document, or reviews a design.
It does not load for ordinary coding. It opens with the ideas that most often
decide whether a design survives production, then maps each topic to a reference
file so the agent reads only what the task needs.

The topics are decisions and documentation, starting simple, boundaries and
contracts, domain-driven design, failure handling, overload and isolation,
queueing and capacity, data and events, durable workflows, consistency, schema
evolution, API versioning, caching, observability, testing, operations,
security, and LLM systems.

You can also read the references directly. They are written to teach: each
"Why it holds" explains the mechanism with a small example, and each "When it
does not apply" names real conditions where the principle is wrong.

## Review a repository's architecture

```sh
/software-architecture:review
/software-architecture:review docs/design.md proposals/
```

With no arguments, the command gathers the repository's design material: the
README, `CLAUDE.md` and `AGENTS.md`, `docs/`, decision record folders,
`proposals/`, `design/` and `specs/`. If the repository keeps a
[docket](https://github.com/NovusEdge/docket) ledger, the review also covers
current decisions, claims and open questions, and reads superseded decisions as
history. It does not review source code.

A reviewer agent then writes one file, `reviews/YYYY-MM-DD-architecture-review.md`,
and changes nothing else. The review covers:

- what is strong in the current architecture
- what must change before building, and what should change
- decisions the design needs and has not made
- open questions that can be closed or merged
- the five principles the architecture most needs, explained with examples from
  that system

Every finding names the files or records it touches, a concrete failure
scenario, a fix, and the principle it rests on. A concern without a failure
scenario is reported as a question, not a finding.

The reviewer runs on Fable at extra-high effort. A review of a large design
corpus is a long, expensive run; point the command at specific paths to review
part of a design.

## How sources work

Each source line carries a marker:

| Marker | Meaning |
|---|---|
| **[V]** | Verified on the cited page, with the URL and the date it was fetched |
| **[U]** | Not verified on a primary page: a book that was not opened, or a claim seen only through a secondary source |
| **[I]** | Inference by the reference's author, not a claim any source makes |

Quotes marked "(extraction)" passed through a summarising fetch tool. The skill
tells agents to state [U] and [I] items as such, and to re-open a URL before
quoting it in a decision record. Where a primary page could only be read through
the Wayback Machine, the source line gives the capture URL.

## Add a principle

Add a `##` section to the reference file for its topic, or a new file under
`skills/architecture/references/` with a row in the skill's reference map. Every
principle has five bold-labelled fields, in this order:

1. **Claim.** What the principle says, in a sentence or two.
2. **Why it holds.** The mechanism, with a small concrete example.
3. **When it does not apply.** Real conditions, not a token caveat.
4. **Sources.** One list item per source, each starting with `[V]`, `[U]` or
   `[I]`. A `[V]` item includes the URL and `fetched YYYY-MM-DD`.
5. **Reviewer checks.** Concrete questions a reviewer can answer from design
   documents.

Then run the checks:

```sh
node tests/run.js
```

They confirm every principle has all five fields, every source is marked, every
verified source has a URL and fetch date, relative links resolve, skill and agent
frontmatter parse, and the plugin and marketplace manifests agree.

software-architecture is licensed under the [MIT License](LICENSE).
