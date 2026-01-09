// WhatsApp Business API Integration Service
// Using Meta's Cloud API

import prisma from '../utils/prisma.js';
const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0';
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || 'reengage_prompt';
const WHATSAPP_TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';

// Format phone number to international format (remove spaces, dashes, ensure +)
const formatPhoneNumber = (phoneNumber) => {
  // Remove spaces, dashes, parentheses
  let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // Add + if not present
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
};

export const sendWhatsAppMessage = async ({ phoneNumber, message, tenantId }) => {
  try {
    // Localize message amounts if tenantId provided
    let localizedMessage = message;
    if (tenantId) {
      try {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { homeCurrency: true } });
        const homeCurrency = (tenant && tenant.homeCurrency) || 'NGN';
        // Replace {amount} or ₦{amount} placeholders with formatted currency
        if (localizedMessage.includes('{amount}') || localizedMessage.includes('₦{amount}')) {
          // For safety do not assume amount value here; caller may have included numeric amount separately.
          // We'll leave placeholder replacement to controllers when they have amount value.
        }
        // Replace raw '₦123,456' occurrences with tenant-formatted amounts
        localizedMessage = localizedMessage.replace(/₦\s*([\d,]+(?:\.\d+)?)/g, (m, p1) => {
          const num = Number(p1.replace(/,/g, ''));
          try {
            return new Intl.NumberFormat('en-GB', { style: 'currency', currency: homeCurrency, minimumFractionDigits: 0 }).format(num);
          } catch (e) {
            return `${homeCurrency} ${num}`;
          }
        });
      } catch (e) {
        console.warn('Failed to localize message amounts for tenant', tenantId, e);
      }
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    console.log('📱 Sending WhatsApp Message:');
    console.log(`To: ${formattedPhone}`);
    console.log(`Tenant: ${tenantId}`);
    console.log(`Message: ${localizedMessage.substring(0, 100)}...`);
    console.log('WhatsApp API Token configured:', !!WHATSAPP_API_TOKEN);
    console.log('WhatsApp Phone Number ID configured:', !!WHATSAPP_PHONE_NUMBER_ID);

    // Check if credentials are configured
    if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn('⚠️  WhatsApp credentials not configured. Message logged only.');
      return {
        success: false,
        messageId: `mock_${Date.now()}`,
        status: 'not_configured',
        error: 'WhatsApp API credentials not configured'
      };
    }

    console.log('📱 Making API request to WhatsApp...');

    // Send message via WhatsApp Business API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(
        `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: formattedPhone,
            type: 'text',
            text: {
              body: localizedMessage
            }
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      console.log('📱 WhatsApp API response status:', response.status);

      const data = await response.json();
      console.log('📱 WhatsApp API response data:', JSON.stringify(data, null, 2));

      if (!response.ok) {
        console.error('❌ WhatsApp API Error:', data);
        return {
          success: false,
          error: data.error?.message || 'Failed to send message',
          status: 'failed'
        };
      }

      console.log('✅ WhatsApp message sent successfully:', data.messages?.[0]?.id);

      return {
        success: true,
        messageId: data.messages?.[0]?.id,
        status: 'sent',
        whatsappResponse: data
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('⏰ WhatsApp API request timed out');
        return {
          success: false,
          error: 'Request timed out',
          status: 'timeout'
        };
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('❌ WhatsApp send error:', error);
    return {
      success: false,
      error: error.message,
      status: 'error'
    };
  }
};

export const sendWelcomeMessage = async ({ phoneNumber, firstName, businessName, welcomePoints }) => {
  const bodyText = `*${businessName}*\n\nHi ${firstName}, thank you for joining our loyalty program!\n\n🎁 You've been awarded ${welcomePoints} welcome points to get you started.\n\nStart earning more points with every purchase. Your points never expire!`;

  // Try sending interactive buttons (Menu) first, fall back to text message
  const buttons = [
    { title: 'Menu' },
    { title: 'Help' }
  ];

  const interactiveResult = await sendInteractiveButtons({
    phoneNumber,
    headerText: businessName,
    bodyText,
    buttons
  });

  if (interactiveResult && interactiveResult.success) return interactiveResult;

  // Fallback to plain text
  const message = `${bodyText}\n\nReply HELP for more information.`;
  return sendWhatsAppMessage({ phoneNumber, message, tenantId: null });
};

export const sendPurchaseConfirmation = async ({ phoneNumber, firstName, amountNgn, pointsEarned, currentBalance }) => {
  const bodyText = `✅ Purchase Confirmed!\n\nHi ${firstName},\n\nYou just earned ${pointsEarned} points from your ${amountNgn} purchase!\n\n💎 Current Balance: ${currentBalance} points\n\nKeep earning more with every purchase!`;

  const buttons = [
    { title: 'Menu' }
  ];

  const interactiveResult = await sendInteractiveButtons({
    phoneNumber,
    headerText: 'Purchase Confirmed',
    bodyText,
    buttons
  });

  if (interactiveResult && interactiveResult.success) return interactiveResult;

  return sendWhatsAppMessage({ phoneNumber, message: bodyText, tenantId: null });
};

export const sendInteractiveButtons = async ({ phoneNumber, headerText, bodyText, buttons, tenantId }) => {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);

    console.log('🔘 Sending WhatsApp Interactive Buttons:');
    console.log(`To: ${formattedPhone}`);
    console.log(`Buttons: ${buttons.length}`);

    // Localize amounts in bodyText/headerText if tenantId provided
    let localizedHeader = headerText;
    let localizedBody = bodyText;
    if (tenantId) {
      try {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { homeCurrency: true } });
        const homeCurrency = (tenant && tenant.homeCurrency) || 'NGN';
        if (typeof localizedHeader === 'string') {
          localizedHeader = localizedHeader.replace(/₦\s*([\d,]+(?:\.\d+)?)/g, (m, p1) => {
          const num = Number(p1.replace(/,/g, ''));
          try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: homeCurrency, minimumFractionDigits: 0 }).format(num); } catch (e) { return `${homeCurrency} ${num}`; }
          });
        }
        if (typeof localizedBody === 'string') {
          localizedBody = localizedBody.replace(/₦\s*([\d,]+(?:\.\d+)?)/g, (m, p1) => {
          const num = Number(p1.replace(/,/g, ''));
          try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: homeCurrency, minimumFractionDigits: 0 }).format(num); } catch (e) { return `${homeCurrency} ${num}`; }
          });
        }
      } catch (e) {
        console.warn('Failed to localize interactive message for tenant', tenantId, e);
      }
    }

    if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn('⚠️  WhatsApp credentials not configured. Buttons logged only.');
      return { success: false, status: 'not_configured' };
    }

    // WhatsApp supports max 3 buttons
    const buttonList = buttons.slice(0, 3).map((btn, index) => ({
      type: 'reply',
      reply: {
        id: (btn && btn.id) ? String(btn.id).substring(0, 256) : `btn_${index}_${Date.now()}`,
        title: (btn && btn.title) ? String(btn.title).substring(0, 20) : `Option ${index + 1}` // Max 20 chars
      }
    }));

    // Build interactive payload (supports text or image header via optional headerText object)
    const response = await fetch(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'interactive',
          interactive: {
            type: 'button',
            header: localizedHeader && typeof localizedHeader === 'object' && localizedHeader.type === 'image' ?
              { type: 'image', image: { link: localizedHeader.imageUrl } } :
              (localizedHeader ? { type: 'text', text: localizedHeader } : undefined),
            body: {
              text: localizedBody
            },
            action: {
              buttons: buttonList
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ WhatsApp Button API Error:', data);
      try {
        const fallbackMessage = `${localizedHeader && typeof localizedHeader === 'string' ? localizedHeader + '\n\n' : ''}${localizedBody || ''}\n\nReply with the option you want, or type MENU for more options.`;
        await sendWhatsAppMessage({ phoneNumber: formattedPhone, message: fallbackMessage, tenantId });
      } catch (e) {
        console.warn('⚠️ Failed to send plaintext fallback after button send failure', e?.message || e);
      }
      return { success: false, error: data.error?.message, whatsappResponse: data };
    }

    console.log('✅ Interactive buttons sent:', data.messages?.[0]?.id);
    return { success: true, messageId: data.messages?.[0]?.id, whatsappResponse: data };
  } catch (error) {
    console.error('❌ Error sending buttons:', error);
    try {
      const fallbackMessage = `${headerText && typeof headerText === 'string' ? headerText + '\n\n' : ''}${bodyText || ''}\n\n(Automatic fallback: interactive content could not be delivered.)`;
      await sendWhatsAppMessage({ phoneNumber, message: fallbackMessage, tenantId });
    } catch (e) {
      console.warn('⚠️ Failed to send plaintext fallback after exception in button send', e?.message || e);
    }
    return { success: false, error: error.message };
  }
};

export const sendInteractiveList = async ({ phoneNumber, headerText, bodyText, buttonText, sections, tenantId }) => {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    console.log('📋 Sending WhatsApp Interactive List:');
    console.log(`To: ${formattedPhone}`);

    if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn('⚠️  WhatsApp credentials not configured. List logged only.');
      return { success: false, status: 'not_configured' };
    }

    // Localize body/header if tenantId provided
    let localizedHeader = headerText;
    let localizedBody = bodyText;
    if (tenantId) {
      try {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { homeCurrency: true } });
        const homeCurrency = (tenant && tenant.homeCurrency) || 'NGN';
        if (typeof localizedHeader === 'string') {
          localizedHeader = localizedHeader.replace(/₦\s*([\d,]+(?:\.\d+)?)/g, (m, p1) => {
          const num = Number(p1.replace(/,/g, ''));
          try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: homeCurrency, minimumFractionDigits: 0 }).format(num); } catch (e) { return `${homeCurrency} ${num}`; }
          });
        }
        if (typeof localizedBody === 'string') {
          localizedBody = localizedBody.replace(/₦\s*([\d,]+(?:\.\d+)?)/g, (m, p1) => {
          const num = Number(p1.replace(/,/g, ''));
          try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: homeCurrency, minimumFractionDigits: 0 }).format(num); } catch (e) { return `${homeCurrency} ${num}`; }
          });
        }
      } catch (e) {
        console.warn('Failed to localize list message for tenant', tenantId, e);
      }
    }

    const response = await fetch(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'interactive',
          interactive: {
            type: 'list',
            header: localizedHeader ? {
              type: 'text',
              text: localizedHeader
            } : undefined,
            body: {
              text: localizedBody
            },
            action: {
              button: buttonText || 'View Options',
              sections: sections
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ WhatsApp List API Error:', data);
      try {
        // Build a plaintext fallback listing section rows
        let fallback = '';
        if (localizedHeader && typeof localizedHeader === 'string') fallback += localizedHeader + '\n\n';
        if (localizedBody) fallback += localizedBody + '\n\n';
        if (Array.isArray(sections)) {
          for (const s of sections) {
            if (s.title) fallback += `${s.title}\n`;
            if (Array.isArray(s.rows)) {
              for (const r of s.rows) {
                fallback += `- ${r.title || ''}`;
                if (r.description) fallback += ` — ${r.description}`;
                fallback += '\n';
              }
            }
            fallback += '\n';
          }
        }
        fallback += '\nReply with the item name to view details, or type MENU.';
        await sendWhatsAppMessage({ phoneNumber: formattedPhone, message: fallback, tenantId });
      } catch (e) {
        console.warn('⚠️ Failed to send plaintext fallback after list send failure', e?.message || e);
      }
      return { success: false, error: data.error?.message, whatsappResponse: data };
    }

    console.log('✅ Interactive list sent:', data.messages?.[0]?.id);
    return { success: true, messageId: data.messages?.[0]?.id, whatsappResponse: data };
  } catch (error) {
    console.error('❌ Error sending list:', error);
    try {
      const fallback = `${headerText && typeof headerText === 'string' ? headerText + '\n\n' : ''}${bodyText || ''}\n\n(Automatic fallback: interactive list could not be delivered.)`;
      await sendWhatsAppMessage({ phoneNumber, message: fallback, tenantId });
    } catch (e) {
      console.warn('⚠️ Failed to send plaintext fallback after exception in list send', e?.message || e);
    }
    return { success: false, error: error.message };
  }
};

// Send a carousel-like series of interactive card messages for rewards.
// WhatsApp Cloud API does not provide a direct 'carousel' without catalog setup,
// so we emulate a card per reward by sending an interactive button message with an image header for each reward.
export const sendRewardCarousel = async ({ phoneNumber, tenantId, rewards = [], headerText }) => {
  try {
    if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn('⚠️  WhatsApp credentials not configured. Carousel logged only.');
      return { success: false, status: 'not_configured' };
    }

    // Limit to first 6 rewards to avoid spamming
    const items = rewards.slice(0, 6);
    for (const r of items) {
      const currency = (r.tenant && r.tenant.homeCurrency) || (tenantId ? (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { homeCurrency: true } })).homeCurrency : 'NGN');
      const minor = currency === 'JPY' ? 1 : 100;
      const valueMajor = (r.monetaryValueNgn ?? r.monetary_value_ngn) ? Math.round((r.monetaryValueNgn ?? r.monetary_value_ngn) / minor) : null;
      const points = r.pointsRequired ?? r.points_required ?? 0;
      const body = `${r.name}\n\n${r.description || ''}\n\nPoints: ${points} pts${valueMajor ? ` • ${valueMajor} ${currency}` : ''}`;

      // If reward is linked to a catalog product (product_retailer_id), send a product message which renders as a product card/carousel in WhatsApp clients that support it.
      const productRetailerId = r.productRetailerId ?? r.product_retailer_id ?? r.raw?.product_retailer_id ?? null;
      if (productRetailerId) {
        // send a product message referencing the catalog item
        try {
          await sendProductMessage({ phoneNumber, tenantId, productRetailerId, bodyText: body });
          // small delay between product messages
          await new Promise(res => setTimeout(res, 200));
          continue;
        } catch (e) {
          console.warn('⚠️ Failed to send product message, falling back to image-card', e.message || e);
        }
      }

      // Fallback to interactive image-card per reward
      const header = r.imageUrl ? { type: 'image', imageUrl: r.imageUrl } : headerText || null;

      await sendInteractiveButtons({
        phoneNumber,
        headerText: header, // sendInteractiveButtons will detect object and use image header
        bodyText: body,
        tenantId,
        buttons: [ { id: `redeem_${r.id}`, title: 'Redeem' }, { title: 'Menu' } ]
      });

      // small delay to avoid rate limits
      await new Promise(res => setTimeout(res, 200));
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Error sending reward carousel:', error);
    return { success: false, error: error.message };
  }
};

export const sendWhatsAppFlow = async ({ phoneNumber, flowId, businessName, vendorCode, flowActionPayload = {} }) => {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    console.log('📋 Sending WhatsApp Flow:');
    console.log(`To: ${formattedPhone}`);
    console.log(`Flow ID: ${flowId}`);
    console.log(`Business: ${businessName}`);

    // Check if credentials are configured
    if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn('⚠️  WhatsApp credentials not configured. Flow message logged only.');
      return {
        success: false,
        messageId: `mock_${Date.now()}`,
        status: 'not_configured',
        error: 'WhatsApp API credentials not configured'
      };
    }

    // Prepare action payload with only allowed fields
    const actionPayload = {
      screen: 'CLAIM_FORM',
      data: {
        channel_options: [
          { id: 'physical_store', title: 'In-Store' },
          { id: 'instagram', title: 'Instagram' },
          { id: 'whatsapp_order', title: 'WhatsApp Order' },
          { id: 'online_store', title: 'Online Store' }
        ]
      }
    };

    // Send interactive Flow message via WhatsApp Business API
    const response = await fetch(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedPhone,
          type: 'interactive',
          interactive: {
            type: 'flow',
            header: {
              type: 'text',
              text: `🎁 ${businessName}`
            },
            body: {
              text: 'Click below to submit your purchase and earn loyalty points!\n\n⏰ Claims must be submitted within 7 days of purchase.'
            },
            footer: {
              text: 'Powered by LoyalQ'
            },
            action: {
              name: 'flow',
              parameters: {
                flow_message_version: '3',
                flow_token: `${vendorCode}`,
                flow_id: flowId,
                flow_cta: 'Submit Claim',
                flow_action: 'navigate',
                flow_action_payload: actionPayload
              }
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ WhatsApp Flow API Error:', data);
      return {
        success: false,
        error: data.error?.message || 'Failed to send Flow message',
        status: 'failed'
      };
    }

    console.log('✅ WhatsApp Flow message sent:', data.messages?.[0]?.id);
    
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      status: 'sent',
      whatsappResponse: data
    };
  } catch (error) {
    console.error('❌ WhatsApp Flow send error:', error);
    return {
      success: false,
      error: error.message,
      status: 'error'
    };
  }
};

// Send a product/catalog message referencing an item in the WhatsApp catalog.
// This requires the business to have a catalog and the product's `product_retailer_id`.
export const sendProductMessage = async ({ phoneNumber, tenantId, productRetailerId, bodyText = '' }) => {
  try {
    if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn('⚠️  WhatsApp credentials not configured. Product message logged only.');
      return { success: false, status: 'not_configured' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'product',
      product: {
        product_retailer_id: productRetailerId,
        body: bodyText
      }
    };

    const response = await fetch(`${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ WhatsApp Product API Error:', data);
      return { success: false, error: data.error?.message };
    }

    console.log('✅ Product message sent:', data.messages?.[0]?.id);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    console.error('❌ Error sending product message:', error);
    return { success: false, error: error.message };
  }
};

// Send a pre-approved template (HSM) message for re-engagement or system notices
export const sendTemplateMessage = async ({ phoneNumber, templateName = WHATSAPP_TEMPLATE_NAME, language = WHATSAPP_TEMPLATE_LANG, components = [] }) => {
  try {
    if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.warn('⚠️  WhatsApp credentials not configured. Template message logged only.');
      return { success: false, status: 'not_configured' };
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);

    const payload = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components: components
      }
    };

    console.log('📨 Sending WhatsApp Template:');
    console.log(`To: ${formattedPhone} Template: ${templateName} lang:${language}`);

    const response = await fetch(`${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('❌ WhatsApp Template API Error:', data);
      return { success: false, error: data.error?.message || 'Template send failed', whatsappResponse: data };
    }

    console.log('✅ Template message sent:', data.messages?.[0]?.id);
    return { success: true, messageId: data.messages?.[0]?.id, whatsappResponse: data };
  } catch (error) {
    console.error('❌ Error sending template message:', error);
    return { success: false, error: error.message };
  }
};
