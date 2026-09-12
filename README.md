# @raidou/pi-ask-user

An [pi](https://github.com/badlogic/pi-mono) extension that provides the
`ask_user_question` tool: it lets the coding agent present one or more
multiple-choice questions to the user and collect structured answers, with a
rich TUI (options list, preview pane, scrolling and tabs).

## Install

```sh
pi install npm:@raidou/pi-ask-user
```

Or from a local checkout:

```sh
cd path/to/pi-ask-user
pi install .
```

## Subagent support

Subagent sessions can use `ask_user_question` too. Main and subagent sessions share one extension module instance, and only the real TUI session (`ctx.mode === 'tui' && ctx.hasUI`) registers as the owner; non-TUI sessions (rpc/print) never steal ownership. When a subagent asks, the tool call blocks while the question UI is rendered in the main TUI session, and the answer is returned to the subagent as the tool result (a "cancelled" result if the user cancels). Asks originating from a subagent are labelled with a `subagent` badge in the questionnaire UI.

## Development

When started with `PI_DEMO=1`, the extension also registers an `/ask-user-demo` command that walks through the question UI (`/ask-user-demo subagent` previews a subagent ask).

```sh
pnpm install
pnpm test   # types + lint + unit tests
```
