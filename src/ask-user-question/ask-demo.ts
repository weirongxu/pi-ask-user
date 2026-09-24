import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

import { isTuiOwnerSession } from './owner.js'
import type { QuestionParamsSchema } from './schema.js'
import { runQuestionnaire } from './ui/index.js'

export const DEMO_PARAMS: QuestionParamsSchema = {
  questions: [
    {
      question: 'What feature do you want to test next?',
      tabName: 'Feature',
      multiSelect: false,
      options: [
        {
          label: 'Questionnaire UI',
          preview: `# Interactive TUI Component

## Core Features

**Multi-tab question support** for organizing related questions.

### Selection Modes

- Single/multi-select options
- Custom text input via "Other:" option
- *Keyboard navigation* (↑↓, Space, Enter, Esc, Tab)

> Designed for seamless terminal interactions.
`,
        },
        {
          label: 'File commands',
          preview: `## File System Operations

| Command | Description |
|---------|-------------|
| \`read\` | View file contents |
| \`write\` | Create or overwrite files |
| \`edit\` | Targeted text replacement |
| \`find\` | Fuzzy path search |
| \`grep\` | Pattern-based content search |

---

See [documentation](https://example.com/docs) for details.
`,
        },
        {
          label: 'MCP tool integration',
          preview: `# MCP Tool Integration

Connect to external Model Context Protocol servers.

\`\`\`typescript
const tools = await mcp.listTools({
  server: 'my-server'
})
\`\`\`

## Supported Operations

1. **Discovery**: Search and describe available tools
2. **Execution**: Call tools with structured arguments
3. **Auth**: OAuth flow for secured services

*~~Deprecated~~ direct tool calls - use mcpScript instead.*
`,
        },
        {
          label: 'Network tools',
          preview: `## Network Tools

### Search

Perform web searches using multiple providers:

- brave
- tavily
- serper
- ~~exa~~ (deprecated)

### Fetch

Retrieve URL content:

\`\`\`bash
curl -H "Accept: text/html" https://example.com
\`\`\`

> Note: Requests outside China use proxy configuration.
`,
        },
      ],
    },
    {
      question: 'Which localization features do you need?',
      tabName: 'internationalization-and-localization-config',
      multiSelect: true,
      options: [
        {
          label:
            'i18n 消息目录管理\ni18n message catalogs\n支持 JSON/YAML 双格式加载\n构建期合并与运行时懒加载\n含 fallback 链与区域回退策略\n可导出翻译覆盖率报告',
          preview: `# Message Catalogs

## Overview

Load per-locale **JSON/YAML** catalogs at build time.

### Loading Strategies

1. Eager: bundle all locales up front
2. Lazy: fetch locale chunks on first use
3. Hybrid: eager default + lazy fallback

    const messages = await loadLocale('ja-JP')   // indented code block

> Fallback chain: region → language → default.

---

*Bundle-size impact:* each locale adds ~12KB gzipped.
`,
        },
        {
          label:
            'RTL 布局全面支持\nRTL layout support for Arabic & Hebrew\n逻辑属性自动镜像图标与间距\n轮播/步进器方向自动翻转\n数字与 LTR 片段保持嵌入方向\n兼容 dir 属性切换的动态重排',
          preview: `# RTL Layout

Right-to-left rendering for Arabic/Hebrew locales.

## Checklist

- Mirror icons and padding via logical properties
- Flip carousel/stepper direction
- Keep numbers/LTR snippets embedded

    dir: 'rtl';
   // indented code block
`,
        },
        {
          label:
            '复数规则与性别变体\nPlural rules & gender forms\nCLDR 复数类别完整覆盖\nselect/orientation 子句支持\nICU MessageFormat 兼容解析\n含运行时缓存与降级策略',
        },
      ],
    },
    {
      question: 'How should we handle timezone-aware formatting?',
      tabName: 'datetime-formatting-and-timezone-rendering-pipeline',
      multiSelect: false,
      options: [
        {
          label: 'Intl.DateTimeFormat wrappers',
          preview: `# Timezone Formatting

Use the platform: \`Intl.DateTimeFormat\` with \`timeZone\`.

## Gotchas

- \`en-US\` 12h vs \`fr-FR\` 24h default hour cycle
- \`timeZoneName: 'short'\` varies by locale
- DST transitions need \`offset\`-aware parsing

    new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' })

> Test around DST boundaries every release.
`,
        },
        { label: 'Library (date-fns-tz)' },
        { label: 'Store UTC only, format client-side' },
      ],
    },
    {
      question: 'Which keyboard shortcuts need documentation?',
      tabName: 'keyboard-shortcuts-reference-and-migration-notes-for-v2',
      multiSelect: true,
      options: [
        { label: 'Navigation keys' },
        {
          label: 'Scrolling (d/u half-page)',
          preview: `# Scrolling Shortcuts

## v2 Behavior

- \`d\` scrolls preview **down** half a page
- \`u\` scrolls preview **up** half a page
- Offset clamps at both ends: no dead presses

### Step Size

    step = max(1, floor(visibleLines / 2))

> Step adapts to the left pane height on resize.

---

*Migration:* replaces v1's 1-line-at-a-time j/k preview scroll.
`,
        },
        { label: 'Note editing keys' },
      ],
    },
    {
      question: 'Which interaction modes do you want to test?',
      tabName: 'Mode',
      multiSelect: true,
      options: [
        { label: 'Single select' },
        { label: 'Multi toggle' },
        { label: 'Custom input' },
        { label: 'Tab switching' },
      ],
    },
    {
      question: 'What is the test environment?',
      tabName: 'Env',
      multiSelect: true,
      options: [
        { label: 'Local dev' },
        { label: 'CI runner' },
        { label: 'Staging' },
        { label: 'Production' },
      ],
    },
    {
      question: 'Should we merge immediately?',
      tabName: 'Merge',
      multiSelect: false,
      options: [
        {
          label: 'Yes, merge now',
          preview: `# Immediate Merge

Proceed directly with merging the changes.

### Prerequisites

- All tests passing
- Code review approved
- ~~Breaking changes~~ documented

> Use when you are **confident** in the review.

---

This action is *irreversible*.
`,
        },
        {
          label: 'Review first',
          preview: `## Review Workflow

Examine the changes before merging.

### Checklist

1. Check diff for correctness
2. Verify test coverage
3. Test integration points
4. Update documentation

### Tools

\`git diff\` to review changes locally.

See [review guide](https://example.com/review) for best practices.
`,
        },
        {
          label: 'Iterate one more',
          preview: `# Iteration Cycle

Refine before finalizing.

## Common Reasons

- Edge cases discovered
- Performance concerns
- ~~API~~ changes needed
- Documentation gaps

> "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away."

### Next Steps

Return to development phase.
`,
        },
        {
          label: 'Hold off',
          preview: `## Hold Operation

Pause the merge process.

### Scenarios

- Waiting for dependencies
- Blocked by external factors
- Need team discussion
- ~~Incomplete~~ testing

---

Changes remain in the current branch for later consideration.

*No action taken immediately.*
`,
        },
      ],
    },
  ],
}

async function runAskUserDemo(
  ctx: ExtensionCommandContext,
  events: ExtensionAPI['events'],
  subagent: boolean,
): Promise<void> {
  const result = await runQuestionnaire({
    ctx,
    events,
    id: 'ask-user-demo',
    params: DEMO_PARAMS,
    subagent,
  })

  if (result) {
    ctx.ui.notify(`用户选择了: ${JSON.stringify(result)}`, 'info')
  } else {
    ctx.ui.notify('用户取消了操作', 'warning')
  }
}

export function registerAskDemoCommand(pi: ExtensionAPI): void {
  pi.registerCommand('ask-user-demo', {
    description:
      "Test ask_user_question tool UI component ('subagent' previews a subagent ask)",
    handler: async (args, ctx) => {
      if (!isTuiOwnerSession(ctx)) {
        ctx.ui.notify('ask-user-demo requires a TUI session', 'warning')
        return
      }
      await runAskUserDemo(
        ctx,
        pi.events,
        args.trim().toLowerCase() === 'subagent',
      )
    },
  })
}
