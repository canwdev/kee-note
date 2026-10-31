import { argon2d, argon2id } from 'hash-wasm'

export type Argon2WorkerRequest = {
  id: number
  password: ArrayBuffer
  salt: ArrayBuffer
  memory: number
  iterations: number
  length: number
  parallelism: number
  type: number
  version: number
}

export type Argon2WorkerResponse =
  | { id: number; hash: ArrayBuffer }
  | { id: number; error: string }

const postMessage = (message: Argon2WorkerResponse, transfer?: Transferable[]) => {
  ;(globalThis as any).postMessage(message, transfer)
}

globalThis.onmessage = async (event: MessageEvent<Argon2WorkerRequest>) => {
  const request = event.data

  try {
    if (request.version !== 0x13) {
      throw new Error(`Unsupported Argon2 version: ${request.version}`)
    }
    if (request.type !== 0 && request.type !== 2) {
      throw new Error(`Unsupported Argon2 type: ${request.type}`)
    }

    const hashFn = request.type === 2 ? argon2id : argon2d
    const hash = await hashFn({
      password: new Uint8Array(request.password),
      salt: new Uint8Array(request.salt),
      memorySize: request.memory,
      iterations: request.iterations,
      parallelism: request.parallelism,
      hashLength: request.length,
      outputType: 'binary',
    })

    const hashBuffer = hash.buffer.slice(
      hash.byteOffset,
      hash.byteOffset + hash.byteLength,
    ) as ArrayBuffer

    postMessage({ id: request.id, hash: hashBuffer }, [hashBuffer])
  } catch (error) {
    postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
