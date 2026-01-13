// Run with: node -r dotenv/config scripts/remove_whatsapp_lead.js "+447404938935"
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = process.argv[2];
  if (!phone) {
    console.error('Usage: node -r dotenv/config scripts/remove_whatsapp_lead.js "+447404938935"');
    process.exit(1);
  }

  console.log('Attempting to remove WhatsApp lead for', phone);
  try {
    const found = await prisma.whatsAppLead.findMany({ where: { phoneNumber: phone } });
    console.log('Found', found.length, 'matching records');
    if (found.length === 0) {
      console.log('No records to delete.');
      return;
    }

    const ids = found.map(f => f.id);
    const del = await prisma.whatsAppLead.deleteMany({ where: { id: { in: ids } } });
    console.log('Deleted', del.count, 'records');
  } catch (err) {
    console.error('Error while deleting:', err);
    process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main();
