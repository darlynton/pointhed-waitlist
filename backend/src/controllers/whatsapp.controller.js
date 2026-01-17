import { sendWhatsAppMessage, sendInteractiveButtons, sendTemplateMessage } from '../services/whatsapp.service.js';
import { notifySubscribers } from '../jobs/notifySubscribers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST /api/v1/whatsapp/instant
export const sendInstant = async (req, res, next) => {
  try {
    const { phoneNumber, tenantId } = req.body || {};
    
    console.log('📱 Instant request received:', { phoneNumber, tenantId });
    
    if (!phoneNumber) {
      console.log('❌ No phone number provided');
      return res.status(400).json({ success: false, error: 'phoneNumber is required' });
    }

    // Parse phone number to extract country code and raw number
    // Match patterns like +447404938935 or +1234567890
    const phoneMatch = phoneNumber.match(/^(\+\d{1,3})(\d{4,})$/);
    const countryCode = phoneMatch ? phoneMatch[1] : '+44';
    const rawNumber = phoneMatch ? phoneMatch[2] : phoneNumber.replace(/^\+|[^\d]/g, '');

    // Check if this phone number already requested instant demo
    const existingLead = await prisma.whatsAppLead.findFirst({
      where: { phoneNumber }
    });

    if (existingLead) {
      console.log('📱 Phone already requested instant demo:', existingLead.createdAt);
      return res.status(200).json({ 
        success: true,
        alreadyRequested: true,
        message: 'Demo already sent to this number',
        firstRequestedAt: existingLead.createdAt
      });
    }

    // Get current waitlist position (before adding this lead)
    const currentPosition = await prisma.whatsAppLead.count() + 1;

    console.log('📱 Sending instant template message to:', phoneNumber);
    console.log('📊 Waitlist position:', currentPosition);

    // Use WhatsApp template message with position parameter
    // Buttons are pre-configured in the template definition in WhatsApp Business Manager
    const result = await sendTemplateMessage({
      phoneNumber,
      templateName: 'waitlist_demo_welcome',
      language: 'en',
      components: [
        {
          type: 'body',
          parameters: [
            {
              type: 'text',
              text: currentPosition.toString()
            }
          ]
        }
      ]
    });

    console.log('📱 Send result:', result);

    if (result?.success) {
      // Save to database and get position
      const lead = await prisma.whatsAppLead.create({
        data: {
          phoneNumber,
          countryCode,
          rawNumber,
          source: 'landing_page',
          status: 'sent',
          messageId: result.messageId || null,
          metadata: { 
            tenantId,
            sentAt: new Date().toISOString() 
          }
        }
      }).catch(err => {
        console.error('⚠️  Failed to save WhatsApp lead:', err);
        return null;
      });

      // Get position in waitlist
      let position = null;
      if (lead) {
        position = await prisma.whatsAppLead.count({
          where: {
            createdAt: {
              lte: lead.createdAt
            }
          }
        }).catch(err => {
          console.error('⚠️  Failed to count position:', err);
          return null;
        });
        console.log('📊 WhatsApp waitlist position:', position);
      }

      return res.status(200).json({ 
        success: true, 
        result,
        messageId: result.messageId,
        alreadyRequested: !!existingLead,
        position
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: result?.error || 'Failed to send message',
        status: result?.status || 'error',
        result 
      });
    }
  } catch (err) {
    console.error('📱 Error in sendInstant:', err);
    return res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};

// GET /api/v1/whatsapp/webhook - Verification endpoint
export const verifyWebhook = async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'pointhed_webhook_token';

  console.log('🔍 Webhook verification request:');
  console.log('  Mode:', mode);
  console.log('  Token received:', token);
  console.log('  Expected token:', VERIFY_TOKEN);
  console.log('  Challenge:', challenge);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    return res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed - token mismatch');
    return res.sendStatus(403);
  }
};

// POST /api/v1/whatsapp/webhook - Handle incoming messages
export const handleWebhook = async (req, res) => {
  try {
    console.log('🔔 WEBHOOK ENDPOINT HIT - Raw request received');
    console.log('📨 Request method:', req.method);
    console.log('📨 Request URL:', req.url);
    console.log('📨 Request headers:', JSON.stringify(req.headers, null, 2));
    
    const body = req.body;
    
    console.log('📨 Full request body:', JSON.stringify(body, null, 2));

    // Respond quickly to avoid timeout
    res.sendStatus(200);

    if (!body) {
      console.log('❌ No body received');
      return;
    }

    if (body.object !== 'whatsapp_business_account') {
      console.log('❌ Not a WhatsApp Business webhook, object is:', body.object);
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    console.log('📨 Messages array:', messages);

    if (!messages || messages.length === 0) {
      console.log('No messages in webhook');
      return;
    }

    const message = messages[0];
    const from = message.from;
    const messageType = message.type;
    
    // Normalize phone number - add + if missing
    const normalizedPhone = from.startsWith('+') ? from : `+${from}`;

    console.log('📨 Incoming message from:', from, 'type:', messageType);
    console.log('📨 Normalized phone:', normalizedPhone);
    console.log('📨 Full message object:', JSON.stringify(message, null, 2));

    // Handle template quick reply button responses
    if (messageType === 'button') {
      const buttonPayload = message.button?.payload;
      const buttonText = message.button?.text;
      
      console.log('🔘 Template button received');
      console.log('🔘 Button payload:', buttonPayload, 'text:', buttonText);

      // Handle role payloads from template buttons
      if (buttonPayload === 'role_business' || buttonText?.toLowerCase().includes('business')) {
        await handleRoleSelection(normalizedPhone, 'role_business', 'Business');
      } else if (buttonPayload === 'role_customer' || buttonText?.toLowerCase().includes('customer') || buttonText?.toLowerCase().includes('shopper')) {
        await handleRoleSelection(normalizedPhone, 'role_customer', 'Customer / Shopper');
      } else if (buttonPayload === 'role_curious' || buttonText?.toLowerCase().includes('curious')) {
        await handleRoleSelection(normalizedPhone, 'role_curious', 'Just curious');
      } else if (buttonPayload === 'notify_yes' || buttonText?.toLowerCase().includes('notify')) {
        await handleRoleSelection(normalizedPhone, 'notify_yes', 'Notify me when ready');
      } else if (buttonPayload === 'notify_no' || buttonText?.toLowerCase().includes('maybe') || buttonText?.toLowerCase().includes('later')) {
        await handleRoleSelection(normalizedPhone, 'notify_no', 'Maybe later');
      } else {
        console.log('⚠️  Unknown button:', buttonPayload, buttonText);
        const fallback = `Sorry, I didn't understand your selection. Please reply with "Business", "Customer / Shopper", or "Just curious", or tap the buttons in the previous message.`;
        await sendWhatsAppMessage({ phoneNumber: normalizedPhone, message: fallback, tenantId: null });
      }
    }
    // Handle interactive button responses (from API-sent interactive messages)
    else if (messageType === 'interactive') {
      const interactive = message.interactive || {};
      const buttonReply = interactive.button_reply;
      
      console.log('🔘 Interactive message received');
      console.log('🔘 Button reply:', JSON.stringify(buttonReply, null, 2));

      if (buttonReply) {
        const payload = buttonReply.id;  // Fix: use id instead of payload
        const text = buttonReply.title;

        console.log('🔘 Button payload:', payload, 'text:', text);

        // Handle role payloads
        if (payload === 'role_business') {
          await handleRoleSelection(normalizedPhone, 'role_business', 'Business');
        } else if (payload === 'role_customer') {
          await handleRoleSelection(normalizedPhone, 'role_customer', 'Customer / Shopper');
        } else if (payload === 'role_curious') {
          await handleRoleSelection(normalizedPhone, 'role_curious', 'Just curious');
        } else if (payload === 'notify_yes') {
          await handleRoleSelection(normalizedPhone, 'notify_yes', 'Notify me when ready');
        } else if (payload === 'notify_no') {
          await handleRoleSelection(normalizedPhone, 'notify_no', 'Maybe later');
        } else {
            console.log('⚠️  Unknown payload:', payload);
            const fallback = `Sorry, I didn't understand your selection. Please reply with "Business", "Customer / Shopper", or "Just curious", or tap the buttons in the previous message.`;
            await sendWhatsAppMessage({ phoneNumber: normalizedPhone, message: fallback, tenantId: null });
        }
      }
    }
    // Handle text messages
    else if (messageType === 'text') {
      const text = message.text?.body?.toLowerCase().trim();
      console.log('💬 Text message:', text);

      // Check for STOP to opt out
      if (text === 'stop') {
        await handleOptOut(normalizedPhone);
        return;
      }

      // Check for START to opt back in
      if (text === 'start') {
        await handleOptIn(normalizedPhone);
        return;
      }

      // Map common text responses to role IDs
      if (text.includes('business')) {
        await handleRoleSelection(normalizedPhone, 'role_business', 'Business');
      } else if (text.includes('customer') || text.includes('shopper')) {
        await handleRoleSelection(normalizedPhone, 'role_customer', 'Customer / Shopper');
      } else if (text.includes('curious')) {
        await handleRoleSelection(normalizedPhone, 'role_curious', 'Just curious');
      } else if (text.includes('notify') || text.includes('yes')) {
        await handleRoleSelection(normalizedPhone, 'notify_yes', 'Notify me when ready');
      } else if (text.includes('maybe') || text.includes('later') || text.includes('no')) {
        await handleRoleSelection(normalizedPhone, 'notify_no', 'Maybe later');
      } else {
        console.log('⚠️  Text message does not match any keyword patterns');
        // Send friendly guidance back to the user
        const fallback = `Sorry, I didn't follow that. Reply with "Business", "Customer / Shopper", or "Just curious" — or tap the buttons in the last message.`;
        await sendWhatsAppMessage({ phoneNumber: normalizedPhone, message: fallback, tenantId: null });
        // Log for debugging
        console.log('✅ Webhook processed text message from:', normalizedPhone, 'content:', text);
      }
    }
  } catch (error) {
    console.error('❌ Webhook error:', error);
  }
};

// DELETE /api/v1/whatsapp/lead/:phoneNumber - Remove a lead
export const removeLead = async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'phoneNumber is required' });
    }

    console.log('🗑️  Attempting to remove WhatsApp lead for:', phoneNumber);

    const deleted = await prisma.whatsAppLead.deleteMany({
      where: { phoneNumber: decodeURIComponent(phoneNumber) }
    });

    console.log('🗑️  Deleted', deleted.count, 'records');

    return res.status(200).json({
      success: true,
      message: `Deleted ${deleted.count} record(s)`,
      count: deleted.count
    });
  } catch (err) {
    console.error('❌ Error removing lead:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

async function handleOptOut(phoneNumber) {
  try {
    console.log('🚫 Opting out user:', phoneNumber);

    // Get existing lead
    const existingLead = await prisma.whatsAppLead.findFirst({
      where: { phoneNumber }
    });

    if (!existingLead) {
      console.log('⚠️  Lead not found for:', phoneNumber);
      return;
    }

    // Mark as opted out in metadata
    const updatedMetadata = {
      ...(existingLead.metadata || {}),
      optedOut: true,
      optedOutAt: new Date().toISOString()
    };

    await prisma.whatsAppLead.update({
      where: { id: existingLead.id },
      data: { metadata: updatedMetadata }
    }).catch(err => console.error('Failed to update lead opt-out status:', err));

    // Send confirmation
    const message = `You've been unsubscribed. We won't send you any more messages. Reply START if you'd like to receive updates again.`;
    await sendWhatsAppMessage({
      phoneNumber,
      message,
      tenantId: null
    });

    console.log('✅ User opted out:', phoneNumber);
  } catch (error) {
    console.error('Error handling opt-out:', error);
  }
}

async function handleOptIn(phoneNumber) {
  try {
    console.log('✅ Opting in user:', phoneNumber);

    // Get existing lead
    const existingLead = await prisma.whatsAppLead.findFirst({
      where: { phoneNumber }
    });

    if (!existingLead) {
      console.log('⚠️  Lead not found for:', phoneNumber);
      return;
    }

    // Remove opted out flag from metadata
    const updatedMetadata = {
      ...(existingLead.metadata || {}),
      optedOut: false,
      optedInAt: new Date().toISOString()
    };

    await prisma.whatsAppLead.update({
      where: { id: existingLead.id },
      data: { metadata: updatedMetadata }
    }).catch(err => console.error('Failed to update lead opt-in status:', err));

    // Send confirmation
    const message = `Welcome back! You're now subscribed and will receive updates about Pointhed.`;
    await sendWhatsAppMessage({
      phoneNumber,
      message,
      tenantId: null
    });

    console.log('✅ User opted in:', phoneNumber);
  } catch (error) {
    console.error('Error handling opt-in:', error);
  }
}

async function handleRoleSelection(phoneNumber, roleId, roleTitle) {
  try {
    // Get existing lead to preserve metadata
    const existingLead = await prisma.whatsAppLead.findFirst({
      where: { phoneNumber }
    });

    if (!existingLead) {
      console.log('⚠️  Lead not found for:', phoneNumber);
      return;
    }

    // Update lead metadata with role selection, preserving existing data
    const updatedMetadata = {
      ...(existingLead.metadata || {}),
      role: roleId,
      roleTitle: roleTitle,
      respondedAt: new Date().toISOString()
    };

    await prisma.whatsAppLead.update({
      where: { id: existingLead.id },
      data: {
        metadata: updatedMetadata
      }
    }).catch(err => console.error('Failed to update lead metadata:', err));

    // Customer / Shopper
    if (roleId === 'role_customer') {
      const message = `Thanks for your interest!\n\nPointhed lets you earn, track, and redeem loyalty points directly through WhatsApp — no app needed.\n\nWe're preparing something great. You'll only hear from us when we're ready to launch.`;
      
      await sendWhatsAppMessage({
        phoneNumber,
        message,
        tenantId: null
      });
    }
    // Business
    else if (roleId === 'role_business') {
      const message = `Pointhed helps businesses build WhatsApp-first loyalty programs.\n\nWe're currently in pilot testing with select partners. Would you like to be notified when we're ready for more businesses?`;

      await sendInteractiveButtons({
        phoneNumber,
        headerText: null,
        bodyText: message,
        buttons: [
          { id: 'notify_yes', title: 'Notify me when ready' },
          { id: 'notify_no', title: 'Maybe later' }
        ],
        tenantId: null
      });
    }
    // Just curious
    else if (roleId === 'role_curious') {
      const message = `Pointhed is a WhatsApp-native loyalty platform.\n\nYou'll only hear from us when there's something real to try. Thanks for being curious.`;
      
      await sendWhatsAppMessage({
        phoneNumber,
        message,
        tenantId: null
      });
    }
    // Handle business follow-up responses
    else if (roleId === 'notify_yes') {
      const message = `Perfect. We'll reach out when we're ready.\n\nThanks for your interest.`;
      
      await sendWhatsAppMessage({
        phoneNumber,
        message,
        tenantId: null
      });
    }
    else if (roleId === 'notify_no') {
      const message = `No problem. Thanks for checking us out.`;
      
      await sendWhatsAppMessage({
        phoneNumber,
        message,
        tenantId: null
      });
    }
  } catch (error) {
    console.error('Error handling role selection:', error);
  }
}

// POST /api/v1/whatsapp/notify - Admin endpoint to notify business subscribers
export const notifySubscribersEndpoint = async (req, res) => {
  try {
    const { message, dryRun } = req.body || {};

    console.log('📢 Notify subscribers endpoint called', { dryRun });

    const result = await notifySubscribers({
      message: message || `🎉 Great news! Pointhed is now ready for business pilots. We'd love to work with you.\n\nReply to this message to get started.`,
      dryRun: dryRun === true
    });

    return res.status(200).json({
      success: true,
      result
    });
  } catch (err) {
    console.error('❌ Error in notifySubscribersEndpoint:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
