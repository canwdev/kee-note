/**
 * 强随机密码生成工具。
 *
 * 使用 `crypto.getRandomValues`（而非 Math.random）保证随机性；
 * 生成结果按字符集等概率取值，并保证大写/小写/数字/符号各至少出现一次。
 */

const LOWER = 'abcdefghijkmnopqrstuvwxyz' // 去掉 l，避免与 1/I 混淆
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // 去掉 I/O，避免与 1/0 混淆
const DIGITS = '23456789' // 去掉 0/1，避免与 O/l 混淆
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?'

const ALL_CHARS = LOWER + UPPER + DIGITS + SYMBOLS

/** 返回 [0, max) 范围内的密码学安全随机整数（拒绝采样，避免取模偏差） */
const randomInt = (max: number) => {
  const limit = Math.floor(0xffffffff / max) * max
  const buffer = new Uint32Array(1)
  let value = 0
  do {
    crypto.getRandomValues(buffer)
    value = buffer[0]
  } while (value >= limit)
  return value % max
}

const randomChar = (chars: string) => chars[randomInt(chars.length)]

/**
 * 生成强随机密码
 * @param length 密码长度（默认 20，最小 4）
 */
export function generatePassword(length = 20): string {
  const size = Math.max(4, Math.floor(length))

  // 先保证每一类字符至少一个
  const chars = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SYMBOLS)]
  while (chars.length < size) {
    chars.push(randomChar(ALL_CHARS))
  }

  // Fisher-Yates 洗牌，避免前四位固定为 小写/大写/数字/符号
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    const tmp = chars[i]
    chars[i] = chars[j]
    chars[j] = tmp
  }

  return chars.join('')
}
