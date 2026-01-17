import { PrismaClient } from '@prisma/client';
import { sendWhatsAppMessage } from '../services/whatsapp.service.js';

const prisma = new PrismaClient();

/**
 * Send notifications to all business leads who opted in to be notified
 * when Pointhed is ready.
 */
export const notifySubscribers = async (options = {}) => {
  try {
    const {
      message = `🎉 Great news! Pointhed is now ready for business pilots. We'd love to work with you.\n\nReply to this message to get started.`,
      dryRun = false
    } = options;

    console.log('📢 Starting notification job...');
    if (dryRun) console.log('🔍 DRY RUN MODE - no messages will be sent');

    // Find all business leads who want notifications and haven't been notified yet
    const subscribers = await prisma.whatsAppLead.findMany({
      where: {
        metadata: {
          path: ['role'],
          equals: 'notify_yes'
        },
        AND: [
          {
            metadata: {
              not: {
                path: ['notifiedAt'],
                string_contains: '.'
              }
            }
          }
        ]
      }
    });

    // Alternative: filter in JS since Prisma JSON filtering can be tricky
    const filteredSubscribers = await prisma.whatsAppLead.findMany({
      where: {
        metadata: {
          path: ['role'],
          equals: 'notify_yes'
        }
      }
    }).then(leads =>
      leads.filter(lead => {
        const meta = lead.metadata || {};
        // Only send if not already notified and not opted out
        return !meta.notifiedAt && meta.optedOut !== true;
      })
    );

    console.log(`📊 Found ${filteredSubscribers.length} subscribers to notify`);

    if (filteredSubscribers.length === 0) {
      console.log('✅ No new subscribers to notify');
      return { sent: 0, failed: 0, skipped: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const lead of filteredSubscribers) {
      try {
        if (!dryRun) {
          console.log(`📱 Sending to ${lead.phoneNumber}...`);

          // Send the notification message
          const result = await sendWhatsAppMessage({
            phoneNumber: lead.phoneNumber,
            message,
            tenantId: null
          });

          if (result?.success) {
            // Update metadata with notification timestamp
            const updatedMetadata = {
              ...(lead.metadata || {}),
              notifiedAt: new Date().toISOString(),
              messageId: result.messageId || null
            };

            await prisma.whatsAppLead.update({
              where: { id: lead.id },
              data: { metadata: updatedMetadata }
            });

            console.log(`✅ Notified ${lead.phoneNumber}`);
            sent++;
          } else {
            console.error(`❌ Failed to send to ${lead.phoneNumber}:`, result?.error);
            failed++;
          }
        } else {
          console.log(`📋 [DRY RUN] Would send to ${lead.phoneNumber}`);
          sent++;
        }
      } catch (err) {
        console.error(`❌ Error notifying ${lead.phoneNumber}:`, err.message);
        failed++;
      }
    }

    console.log(`\n📊 Notification job complete: ${sent} sent, ${failed} failed`);

    return {
      sent,
      failed,
      skipped: filteredSubscribers.length - sent - failed,
      total: filteredSubscribers.length
    };
  } catch (error) {
    console.error('❌ Error in notifySubscribers:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
};

// CLI support: run directly with `node -r dotenv/config src/jobs/notifySubscribers.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry-run');
  notifySubscribers({ dryRun })
    .then(result => {
      console.log('\nResult:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
