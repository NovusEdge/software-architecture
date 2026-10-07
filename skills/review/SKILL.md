---
name: review
description: Review a repository's architecture from its design documents and decision ledger against the software-architecture reference, and write a dated review file under reviews/. Run as /software-architecture:review [paths]. Reviews design material, not code.
argument-hint: "[paths...]"
disable-model-invocation: true
---

# Architecture review

Gather the repository's design material, then dispatch the `software-architecture:architecture-reviewer` agent to review it against the reference. The agent writes one file, `reviews/YYYY-MM-DD-architecture-review.md`, and changes nothing else. Do not edit files yourself during this command.

## 1. Find the target

The target is the repository containing the current working directory (`git rev-parse --show-toplevel`; if that fails, the working directory). Record today's date and the short commit hash of `HEAD` if there is one.

## 2. Gather design material

If paths were given (`$ARGUMENTS`), use exactly those files and directories.

Otherwise collect, where they exist:

- `README*`, `CLAUDE.md`, `AGENTS.md` at the root
- `docs/`, `doc/`
- decision record folders: `doc/adr/`, `docs/adr/`, `adr/`, `docs/decisions/`, `decisions/`
- `proposals/`, `design/`, `specs/`, `spec/`, `rfcs/`

Keep prose and diagram sources (`.md`, `.mdx`, `.txt`, `.adoc`, `.rst`, `.mmd`, `.puml`). Skip source code, generated files, vendored directories and previous files in `reviews/`. List each file with its line count. If the list is empty, say so and stop: there is nothing to review.

## 3. Include the decision ledger

If `.docket/ledger.jsonl` exists, the repository keeps a docket ledger. Check that the `docket` command runs, then give the reviewer these commands to run itself (the output can be long, so do not paste it into the prompt):

```sh
docket list --kind decision --state adopted --json
docket list --kind claim --json
docket list --kind question --state open --oneline
docket list --kind decision --superseded --oneline
```

The first three are the current state and are reviewed. The last is history only: superseded decisions explain how the design got here and are not findings. If `docket` is not available, pass the ledger path instead and tell the reviewer that the file is append-only JSONL in which later records supersede earlier ones.

## 4. Dispatch the reviewer

The reference files are in `${CLAUDE_SKILL_DIR}/../architecture/references/`, where `${CLAUDE_SKILL_DIR}` is the directory containing this SKILL.md. Resolve it to an absolute path.

Choose the output path `reviews/<date>-architecture-review.md` in the target; if that file exists, add `-2`, `-3` and so on before `.md`.

Call the Agent tool with `subagent_type: software-architecture:architecture-reviewer` and a prompt that contains:

- the target repository's absolute path, the date and the commit
- the absolute output path
- the material list from step 2, with line counts
- the ledger commands from step 3, or a note that there is no ledger
- the absolute path of the references directory and of `${CLAUDE_SKILL_DIR}/../architecture/SKILL.md`, whose map says which reference to open for which topic
- any focus the user gave beyond paths

## 5. Report

When the agent finishes, confirm the review file exists. Tell the user its path, the number of findings in "Must change before building" and "Should change", and the title of each must-change finding. Do not restate the review.
