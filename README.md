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

## Development

When started with `PI_DEMO=1 pi`

the extension also registers an `/ask-user-demo` command that walks through the question UI.

```sh
pnpm install
pnpm test   # types + lint + unit tests
```
