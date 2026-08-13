import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const sampleRate = 44100
const durationSeconds = 1.15
const sampleCount = Math.floor(sampleRate * durationSeconds)
const dataSize = sampleCount * 2
const buffer = Buffer.alloc(44 + dataSize)

buffer.write('RIFF', 0)
buffer.writeUInt32LE(36 + dataSize, 4)
buffer.write('WAVE', 8)
buffer.write('fmt ', 12)
buffer.writeUInt32LE(16, 16)
buffer.writeUInt16LE(1, 20)
buffer.writeUInt16LE(1, 22)
buffer.writeUInt32LE(sampleRate, 24)
buffer.writeUInt32LE(sampleRate * 2, 28)
buffer.writeUInt16LE(2, 32)
buffer.writeUInt16LE(16, 34)
buffer.write('data', 36)
buffer.writeUInt32LE(dataSize, 40)

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate
  const firstTone = Math.sin(2 * Math.PI * 880 * time) * Math.exp(-4.8 * time)
  const secondTime = Math.max(0, time - 0.16)
  const secondTone = Math.sin(2 * Math.PI * 1174.66 * secondTime) * Math.exp(-5.4 * secondTime)
  const sample = Math.max(-1, Math.min(1, (firstTone * 0.22) + (secondTone * 0.16)))
  buffer.writeInt16LE(Math.round(sample * 32767), 44 + (index * 2))
}

const outputPath = resolve('public', 'sounds', 'chime.wav')
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, buffer)
console.log(`Generated ${outputPath}`)
