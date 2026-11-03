import 'dotenv/config'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { anonymizeExpired, purgeOldSessions } from './services/retention.js'

const DAY_MS = 24 * 60 * 60 * 1000

const config = loadConfig()
const app = await buildApp(config)

async function runRetention() {
  try {
    const result = await anonymizeExpired(app.prisma, config.PERSONAL_DATA_RETENTION_DAYS)
    const sessions = await purgeOldSessions(app.prisma)
    app.log.info({ anonymized: result, sessionsRemoved: sessions }, 'retenção de dados pessoais aplicada')
  } catch (err) {
    app.log.error({ err }, 'falha ao aplicar a retenção de dados pessoais')
  }
}

await runRetention()
const retentionTimer = setInterval(runRetention, DAY_MS)
retentionTimer.unref()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    clearInterval(retentionTimer)
    await app.close()
    process.exit(0)
  })
}

await app.listen({ host: config.HOST, port: config.PORT })
