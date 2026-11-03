/** `npm run db:seed`: popula o banco com os dados de exemplo. */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { seedSampleData } from './seed-data.js'

const prisma = new PrismaClient()
await seedSampleData(prisma)
await prisma.$disconnect()
console.log('Banco populado com os dados de exemplo (não são dados reais da associação).')
