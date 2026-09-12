// NOTE: the module-level busy flag serializes all questionnaires rendered on
// the shared TUI (tool asks and the demo command). Concurrent asks queue up in
// FIFO order and wait until the previous questionnaire is answered or
// cancelled, instead of being rejected.
let busy = false
const waiters: Array<() => void> = []

export async function beginBusy(): Promise<void> {
  if (busy) {
    await new Promise<void>((resolve) => {
      waiters.push(resolve)
    })
  }
  busy = true
}

export function endBusy(): void {
  const next = waiters.shift()
  if (next) {
    next()
  } else {
    busy = false
  }
}
