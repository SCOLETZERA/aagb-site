/**
 * Cria (ou redefine a senha de) uma conta do painel. Uso:
 *   npm run user:create -w apps/api -- --email pessoa@exemplo.org --name "Nome"
 * A senha é pedida no terminal e não aparece na tela nem no histórico.
 */
import 'dotenv/config'
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { loadConfig } from '../src/config.js'
import { passwordSchema } from '../src/routes/admin/users.js'

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
})
const args = z
  .object({ email: z.email().trim().toLowerCase(), name: z.string().trim().min(3) })
  .parse(values)

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const output = rl as unknown as { _writeToOutput: (s: string) => void }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
    output._writeToOutput = (s: string) => {
      if (s.startsWith(question)) process.stdout.write(question)
    }
  })
}

const password = passwordSchema.parse(await askHidden('Senha (mín. 12 caracteres): '))
if ((await askHidden('Repita a senha: ')) !== password) throw new Error('As senhas não conferem.')

const config = loadConfig()
const prisma = new PrismaClient({ datasourceUrl: config.DATABASE_URL })
const passwordHash = await bcrypt.hash(password, config.BCRYPT_COST)
const user = await prisma.user.upsert({
  where: { email: args.email },
  create: { ...args, role: 'admin', passwordHash },
  update: { name: args.name, role: 'admin', passwordHash, active: true, failedLogins: 0, lockedUntil: null },
})
// Senha nova encerra as sessões abertas.
await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
await prisma.auditLog.create({ data: { userId: null, action: 'users.cli-upsert', target: `user:${user.id}` } })
await prisma.$disconnect()
console.log(`Conta pronta: ${user.email}.`)
