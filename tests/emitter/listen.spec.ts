/*
 * @adonisjs/events
 *
 * (c) AdonisJS
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { join } from 'node:path'
import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import { remove, outputFile } from 'fs-extra'
import { Application } from '@adonisjs/application'

import { Emitter } from '../../src/emitter.js'

const BASE_URL = new URL('../app/', import.meta.url)
const BASE_PATH = fileURLToPath(BASE_URL)

type NewUserEvent = { id: number }

test.group('Emitter | listen', () => {
  test('listen for an event', async ({ assert }) => {
    const stack: any[] = []

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter(app)

    emitter.on('new:user', (data) => {
      stack.push(data)
    })

    await emitter.emit('new:user', { id: 1 })
    assert.deepEqual(stack, [{ id: 1 }])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 1)
  })

  test('do not register multiple listeners when callback is the same', async ({ assert }) => {
    const stack: any[] = []

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter(app)

    function listener(data: any) {
      stack.push(data)
    }

    emitter.on('new:user', listener)
    emitter.on('new:user', listener)

    await emitter.emit('new:user', { id: 1 })
    assert.deepEqual(stack, [{ id: 1 }])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 1)
  })

  test('listen for any event', async ({ assert }) => {
    const stack: any[] = []

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter(app)
    emitter.onAny((event, data) => {
      stack.push({ event, data })
    })

    await emitter.emit('new:user', { id: 1 })
    assert.deepEqual(stack, [{ event: 'new:user', data: { id: 1 } }])
  })

  test('infer event data type in listener callback', async ({ assert, expectTypeOf }) => {
    const stack: NewUserEvent[] = []

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter<{ 'new:user': NewUserEvent }>(app)

    emitter.on('new:user', (data) => {
      expectTypeOf(data).toEqualTypeOf<NewUserEvent>()
      stack.push(data)
    })

    await emitter.emit('new:user', { id: 1 })
    assert.deepEqual(stack, [{ id: 1 }])
  })

  test('unsubscribe from event', async ({ assert }) => {
    const stack: any[] = []

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter(app)

    const unsubscribe = emitter.on('new:user', (data) => {
      stack.push(data)
    })

    await emitter.emit('new:user', { id: 1 })
    assert.deepEqual(stack, [{ id: 1 }])

    /**
     * Unsubscribe and emit
     */
    unsubscribe()
    await emitter.emit('new:user', { id: 1 })
    await emitter.emit('new:user', { id: 1 })

    assert.deepEqual(stack, [{ id: 1 }])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 0)
  })

  test('listen for a class based event', async ({ assert, expectTypeOf }) => {
    const stack: any[] = []

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter<{ 'new:user': { id: number } }>(app)

    class UserRegistered {
      constructor(public email: string) {}
    }

    emitter.on(UserRegistered, (event) => {
      assert.instanceOf(event, UserRegistered)
      expectTypeOf(event).toEqualTypeOf<UserRegistered>()
      stack.push(event)
    })

    await emitter.emit(UserRegistered, new UserRegistered('foo@bar.com'))
    assert.deepEqual(stack, [new UserRegistered('foo@bar.com')])
    assert.equal(emitter.eventsListeners.get(UserRegistered)?.size, 1)
  })

  test('define multiple listeners for a class based event', async ({ assert, expectTypeOf }) => {
    const stack: any[] = []

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter<{ 'new:user': { id: number } }>(app)

    class UserRegistered {
      constructor(public email: string) {}
    }

    emitter.on(UserRegistered, (event) => {
      assert.instanceOf(event, UserRegistered)
      expectTypeOf(event).toEqualTypeOf<UserRegistered>()
      stack.push(event)
    })

    emitter.on(UserRegistered, (event) => {
      assert.instanceOf(event, UserRegistered)
      expectTypeOf(event).toEqualTypeOf<UserRegistered>()
      stack.push(event)
    })

    await emitter.emit(UserRegistered, new UserRegistered('foo@bar.com'))
    assert.deepEqual(stack, [new UserRegistered('foo@bar.com'), new UserRegistered('foo@bar.com')])
    assert.equal(emitter.eventsListeners.get(UserRegistered)?.size, 2)
  })
})

test.group('Emitter | listen | magic string listener', (group) => {
  group.each.teardown(async () => {
    return () => remove(BASE_PATH)
  })

  test('lazy load listener using magic string', async ({ assert }) => {
    await outputFile(
      join(BASE_PATH, './listeners/new_user.ts'),
      `
      export default class NewUser {
        sendEmail(data) {
          data.push('invoked')
        }
      }
    `
    )

    const stack: string[] = []

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter<{ 'new:user': string[] }>(app)
    await app.init()

    emitter.on('new:user', '#listeners/new_user.sendEmail')
    await emitter.emit('new:user', stack)

    assert.deepEqual(stack, ['invoked'])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 1)
  })

  test('do not register multiple listeners when using magic strings', async ({ assert }) => {
    await outputFile(
      join(BASE_PATH, './listeners/new_user.ts'),
      `
      export default class NewUser {
        sendEmail(data) {
          data.push('invoked')
        }
      }
    `
    )

    const stack: string[] = []

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter<{ 'new:user': string[] }>(app)
    await app.init()

    emitter.on('new:user', '#listeners/new_user.sendEmail')
    emitter.on('new:user', '#listeners/new_user.sendEmail')
    await emitter.emit('new:user', stack)

    assert.deepEqual(stack, ['invoked'])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 1)
  })

  test('unsubscribe when using magic string', async ({ assert }) => {
    const stack: any[] = []

    await outputFile(
      join(BASE_PATH, './listeners/new_user.ts'),
      `
      export default class NewUser {
        sendEmail(data) {
          data.push('invoked')
        }
      }
    `
    )

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter(app)
    await app.init()

    const unsubscribe = emitter.on('new:user', '#listeners/new_user.sendEmail')

    await emitter.emit('new:user', stack)
    assert.deepEqual(stack, ['invoked'])

    /**
     * Unsubscribe and emit
     */
    unsubscribe()
    await emitter.emit('new:user', { id: 1 })
    await emitter.emit('new:user', { id: 1 })

    assert.deepEqual(stack, ['invoked'])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 0)
  })
})

test.group('Emitter | listen | lazily loaded listener', () => {
  test('lazy load listener', async ({ assert }) => {
    const stack: string[] = []
    const NewUserListener = async () => {
      return {
        default: class NewUser {
          sendEmail(data: string[]) {
            data.push('invoked')
          }
        },
      }
    }

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter<{ 'new:user': string[] }>(app)
    await app.init()

    emitter.on('new:user', [NewUserListener, 'sendEmail'])
    await emitter.emit('new:user', stack)

    assert.deepEqual(stack, ['invoked'])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 1)
  })

  test('do not register multiple listeners when using lazy load function', async ({ assert }) => {
    const stack: string[] = []
    const NewUserListener = async () => {
      return {
        default: class NewUser {
          handle(data: string[]) {
            data.push('invoked')
          }
        },
      }
    }
    const sendEmail: [typeof NewUserListener] = [NewUserListener]

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter<{ 'new:user': string[] }>(app)
    await app.init()

    emitter.on('new:user', sendEmail)
    emitter.on('new:user', sendEmail)
    emitter.on('new:user', sendEmail)
    await emitter.emit('new:user', stack)

    assert.deepEqual(stack, ['invoked'])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 1)
  })

  test('unsubscribe when using lazily loaded listener', async ({ assert }) => {
    const stack: any[] = []

    const NewUserListener = async () => {
      return {
        default: class NewUser {
          sendEmail(data: string[]) {
            data.push('invoked')
          }
        },
      }
    }

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter(app)
    await app.init()

    const unsubscribe = emitter.on('new:user', [NewUserListener, 'sendEmail'])

    await emitter.emit('new:user', stack)
    assert.deepEqual(stack, ['invoked'])

    /**
     * Unsubscribe and emit
     */
    unsubscribe()
    await emitter.emit('new:user', { id: 1 })
    await emitter.emit('new:user', { id: 1 })

    assert.deepEqual(stack, ['invoked'])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 0)
  })
})

test.group('Emitter | listen | listener by reference', () => {
  test('register listener by reference', async ({ assert }) => {
    const stack: string[] = []
    class NewUser {
      sendEmail(data: string[]) {
        data.push('invoked')
      }
    }

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter<{ 'new:user': string[] }>(app)
    await app.init()

    emitter.on('new:user', [NewUser, 'sendEmail'])
    await emitter.emit('new:user', stack)

    assert.deepEqual(stack, ['invoked'])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 1)
  })

  test('do not register multiple listeners when passing listener by reference', async ({
    assert,
  }) => {
    const stack: string[] = []
    class NewUser {
      sendEmail(data: string[]) {
        data.push('invoked')
      }
    }

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter<{ 'new:user': string[] }>(app)
    await app.init()

    const sendEmail: [typeof NewUser, 'sendEmail'] = [NewUser, 'sendEmail']

    emitter.on('new:user', sendEmail)
    emitter.on('new:user', sendEmail)
    emitter.on('new:user', sendEmail)
    await emitter.emit('new:user', stack)

    assert.deepEqual(stack, ['invoked'])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 1)
  })

  test('unsubscribe when passing listener by reference', async ({ assert }) => {
    const stack: any[] = []

    class NewUser {
      sendEmail(data: string[]) {
        data.push('invoked')
      }
    }

    const app = new Application(BASE_URL, { environment: 'web' })
    const emitter = new Emitter(app)
    await app.init()

    const unsubscribe = emitter.on('new:user', [NewUser, 'sendEmail'])

    await emitter.emit('new:user', stack)
    assert.deepEqual(stack, ['invoked'])

    /**
     * Unsubscribe and emit
     */
    unsubscribe()
    await emitter.emit('new:user', { id: 1 })
    await emitter.emit('new:user', { id: 1 })

    assert.deepEqual(stack, ['invoked'])
    assert.equal(emitter.eventsListeners.get('new:user')?.size, 0)
  })
})