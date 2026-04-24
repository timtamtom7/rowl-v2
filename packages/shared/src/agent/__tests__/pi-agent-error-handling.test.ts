import { describe, expect, it } from 'bun:test'
import { PiAgent } from '../pi-agent.ts'
import type { BackendConfig } from '../backend/types.ts'

function createConfig(): BackendConfig {
  return {
    provider: 'pi',
    workspace: {
      id: 'ws-test',
      name: 'Test Workspace',
      rootPath: '/tmp/craft-agent-test',
    } as any,
    session: {
      id: 'session-test',
      workspaceRootPath: '/tmp/craft-agent-test',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    } as any,
    isHeadless: true,
  }
}

describe('PiAgent subprocess error handling', () => {
  it('maps raw HTML subprocess errors to typed proxy_error events', () => {
    const agent = new PiAgent(createConfig())

    const enqueued: any[] = []
    ;(agent as any).eventQueue.enqueue = (event: any) => {
      enqueued.push(event)
    }

    ;(agent as any).handleLine(JSON.stringify({
      type: 'error',
      message: '<html><head><title>400 Bad Request</title></head><body><center><h1>400 Bad Request</h1></center><hr><center>cloudflare</center></body></html>',
    }))

    expect(enqueued).toHaveLength(1)
    expect(enqueued[0].type).toBe('typed_error')
    expect(enqueued[0].error.code).toBe('proxy_error')
    expect(enqueued[0].error.message.toLowerCase()).not.toContain('<html')

    agent.destroy()
  })

  it('does not enqueue chat errors for mini_completion_error messages', () => {
    const agent = new PiAgent(createConfig())

    const enqueued: any[] = []
    ;(agent as any).eventQueue.enqueue = (event: any) => {
      enqueued.push(event)
    }

    let rejectedMessage = ''
    ;(agent as any).pendingMiniCompletions.set('mini-1', {
      resolve: () => {},
      reject: (error: Error) => {
        rejectedMessage = error.message
      },
    })

    ;(agent as any).handleLine(JSON.stringify({
      type: 'error',
      code: 'mini_completion_error',
      message: '<html><head><title>400 Bad Request</title></head><body><center><h1>400 Bad Request</h1></center><hr><center>cloudflare</center></body></html>',
    }))

    expect(enqueued).toHaveLength(0)
    expect((agent as any).pendingMiniCompletions.size).toBe(0)
    expect(rejectedMessage).toContain('400 Bad Request')

    agent.destroy()
  })

  it('suppresses only identical consecutive subprocess errors', () => {
    const agent = new PiAgent(createConfig())

    const enqueued: any[] = []
    ;(agent as any).eventQueue.enqueue = (event: any) => {
      enqueued.push(event)
    }

    for (let i = 0; i < 4; i++) {
      ;(agent as any).handleLine(JSON.stringify({
        type: 'error',
        message: 'EFAULT: broken pipe',
      }))
    }

    expect(enqueued).toHaveLength(3)
    expect(enqueued.every((event) => event.type === 'error' || event.type === 'typed_error')).toBe(true)

    agent.destroy()
  })

  it('resets repeated subprocess error suppression after non-error traffic', () => {
    const agent = new PiAgent(createConfig())

    const enqueued: any[] = []
    ;(agent as any).eventQueue.enqueue = (event: any) => {
      enqueued.push(event)
    }

    for (let i = 0; i < 3; i++) {
      ;(agent as any).handleLine(JSON.stringify({
        type: 'error',
        message: 'EFAULT: broken pipe',
      }))
    }

    ;(agent as any).handleLine(JSON.stringify({
      type: 'event',
      event: { type: 'agent_message_delta', delta: 'ok' },
    }))

    ;(agent as any).handleLine(JSON.stringify({
      type: 'error',
      message: 'EFAULT: broken pipe',
    }))

    expect(enqueued.filter((event) => event.type === 'error' || event.type === 'typed_error')).toHaveLength(4)

    agent.destroy()
  })

  it('emits typed_error with subprocess_dead code when subprocess exits during processing', () => {
    const agent = new PiAgent(createConfig())

    const enqueued: any[] = []
    ;(agent as any).eventQueue.enqueue = (event: any) => {
      enqueued.push(event)
    }
    ;(agent as any).eventQueue.complete = () => {
      enqueued.push({ type: 'complete' })
    }

    // Simulate active processing
    ;(agent as any)._isProcessing = true

    // Simulate subprocess exit with SIGTERM
    ;(agent as any).handleSubprocessExit(null, 'SIGTERM')

    expect(enqueued).toHaveLength(2)
    expect(enqueued[0].type).toBe('typed_error')
    expect(enqueued[0].error.code).toBe('subprocess_dead')
    expect(enqueued[0].error.canRetry).toBe(true)
    expect(enqueued[0].error.title).toBe('Reconnecting…')
    expect(enqueued[1].type).toBe('complete')

    agent.destroy()
  })

  it('does not emit error when subprocess exits while idle', () => {
    const agent = new PiAgent(createConfig())

    const enqueued: any[] = []
    ;(agent as any).eventQueue.enqueue = (event: any) => {
      enqueued.push(event)
    }

    // _isProcessing is false by default
    ;(agent as any).handleSubprocessExit(0, null)

    expect(enqueued).toHaveLength(0)

    agent.destroy()
  })

  it('rejects pending mini completions on subprocess exit', () => {
    const agent = new PiAgent(createConfig())

    let rejectedMessage = ''
    ;(agent as any).pendingMiniCompletions.set('mini-1', {
      resolve: () => {},
      reject: (error: Error) => {
        rejectedMessage = error.message
      },
    })

    ;(agent as any).handleSubprocessExit(null, 'SIGTERM')

    expect(rejectedMessage).toContain('Pi subprocess exited unexpectedly')
    expect((agent as any).pendingMiniCompletions.size).toBe(0)

    agent.destroy()
  })

  it('uses dev lockfile path based on session id', () => {
    const agent = new PiAgent(createConfig())
    const lockfilePath = (agent as any).getDevLockfilePath()

    expect(lockfilePath).toContain('craft-pi-agent-')
    expect(lockfilePath).toContain('session-test')

    agent.destroy()
  })

  it('includes image attachments in the prompt message sent to subprocess', async () => {
    const agent = new PiAgent(createConfig())

    const sentMessages: any[] = []
    ;(agent as any).send = (msg: any) => {
      sentMessages.push(msg)
    }
    ;(agent as any).ensureSubprocess = async () => {}
    ;(agent as any).subprocessReady = Promise.resolve()
    ;(agent as any).eventQueue.drain = async function* () {
      yield { type: 'complete' } as any
    }

    const attachments = [
      {
        name: 'apple.png',
        mimeType: 'image/png',
        base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        storedPath: undefined,
      },
    ]

    const generator = (agent as any).chatImpl('What is this?', attachments)
    // Consume all events from generator
    for await (const _ of generator) { /* drain */ }

    const promptMsg = sentMessages.find((m: any) => m.type === 'prompt')
    expect(promptMsg).toBeTruthy()
    expect(promptMsg.images).toHaveLength(1)
    expect(promptMsg.images[0].type).toBe('image')
    expect(promptMsg.images[0].mimeType).toBe('image/png')
    expect(promptMsg.images[0].data).toBe(attachments[0]!.base64)

    agent.destroy()
  })

  it('skips non-image attachments in the images array', async () => {
    const agent = new PiAgent(createConfig())

    const sentMessages: any[] = []
    ;(agent as any).send = (msg: any) => {
      sentMessages.push(msg)
    }
    ;(agent as any).ensureSubprocess = async () => {}
    ;(agent as any).subprocessReady = Promise.resolve()
    ;(agent as any).eventQueue.drain = async function* () {
      yield { type: 'complete' } as any
    }

    const attachments = [
      {
        name: 'doc.pdf',
        mimeType: 'application/pdf',
        storedPath: '/tmp/doc.pdf',
      },
      {
        name: 'photo.jpg',
        mimeType: 'image/jpeg',
        base64: '/9j/4AAQSkZJRgABAQEASABIAAD',
      },
    ]

    const generator = (agent as any).chatImpl('Read the doc', attachments)
    for await (const _ of generator) { /* drain */ }

    const promptMsg = sentMessages.find((m: any) => m.type === 'prompt')
    expect(promptMsg.images).toHaveLength(1)
    expect(promptMsg.images[0].mimeType).toBe('image/jpeg')
    expect(promptMsg.message).toContain('[Attached PDF: doc.pdf]')

    agent.destroy()
  })
})
