import * as kdbxweb from 'kdbxweb'
import Argon2Worker from './argon2-worker?worker'
import type {
  Argon2WorkerRequest,
  Argon2WorkerResponse,
} from './argon2-worker'

type PendingRequest = {
  resolve: (hash: ArrayBuffer) => void
  reject: (error: Error) => void
}

let worker: Worker | null = null
let nextRequestId = 1
const pendingRequests = new Map<number, PendingRequest>()

const rejectAll = (error: Error) => {
  pendingRequests.forEach(({reject}) => reject(error))
  pendingRequests.clear()
}

const getWorker = () => {
  if (worker) {
    return worker
  }

  const nextWorker = new Argon2Worker()
  nextWorker.onmessage = (event: MessageEvent<Argon2WorkerResponse>) => {
    const response = event.data
    const pending = pendingRequests.get(response.id)
    if (!pending) {
      return
    }

    pendingRequests.delete(response.id)
    if ('error' in response) {
      pending.reject(new Error(response.error))
    } else {
      pending.resolve(response.hash)
    }
  }
  nextWorker.onerror = (event) => {
    rejectAll(new Error(event.message || 'Argon2 worker failed'))
    nextWorker.terminate()
    if (worker === nextWorker) {
      worker = null
    }
  }

  worker = nextWorker
  return nextWorker
}

const argon2 = (
  password: ArrayBuffer,
  salt: ArrayBuffer,
  memory: number,
  iterations: number,
  length: number,
  parallelism: number,
  type: number,
  version: number,
): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const worker = getWorker()
    const id = nextRequestId++

    pendingRequests.set(id, {resolve, reject})

    const request: Argon2WorkerRequest = {
      id,
      password: password.slice(0),
      salt: salt.slice(0),
      memory,
      iterations,
      length,
      parallelism,
      type,
      version,
    }

    worker.postMessage(request)
  })
}

kdbxweb.CryptoEngine.setArgon2Impl(argon2 as any)

export {argon2}
