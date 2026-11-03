/**
 * `npm run db:seed`: popula o banco com os dados de exemplo.
 * Fora de produção, se SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD estiverem no .env, cria também
 * uma conta de administrador para testar o painel. Em produção, use `npm run user:create`.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { passwordSchema } from '../src/routes/admin/users.js'
import { seedSampleData } from './seed-data.js'

const prisma = new PrismaClient()
await seedSampleData(prisma)
console.log('Banco populado com os dados de exemplo (não são dados reais da associação).')

const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password, NODE_ENV } = process.env
if (email && password && NODE_ENV !== 'production') {
  const passwordHash = await bcrypt.hash(passwordSchema.parse(password), 12)
  const data = { name: 'Administração (teste)', role: 'admin', passwordHash, active: true, failedLogins: 0, lockedUntil: null }
  await prisma.user.upsert({ where: { email: email.toLowerCase() }, create: { email: email.toLowerCase(), ...data }, update: data })
  console.log(`Conta de teste do painel pronta: ${email.toLowerCase()} (senha em SEED_ADMIN_PASSWORD no .env).`)
}

await prisma.$disconnect()
