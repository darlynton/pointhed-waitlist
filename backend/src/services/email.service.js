import nodemailer from 'nodemailer';
import { Resend } from 'resend';

// Lazy transporter - created on demand
let transporter = null;
let resendClient = null;

// Create transporter based on environment
const createTransporter = () => {
  console.log('📧 Creating email transporter...');
  console.log('📧 EMAIL_SERVICE:', process.env.EMAIL_SERVICE);
  console.log('📧 EMAIL_USER:', process.env.EMAIL_USER);
  console.log('📧 Has EMAIL_PASSWORD:', !!process.env.EMAIL_PASSWORD);
  console.log('📧 Has RESEND_API_KEY:', !!process.env.RESEND_API_KEY);
  
  // Option 1: Resend (recommended for production)
  if (process.env.EMAIL_SERVICE === 'resend') {
    if (!process.env.RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY is required for Resend service');
      return null;
    }
    console.log('📧 Configuring Resend client');
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return 'resend'; // Return marker for Resend
  }
  
  // Option 2: Gmail (for testing)
  if (process.env.EMAIL_SERVICE === 'gmail') {
    console.log('📧 Configuring Gmail transporter');
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD, // Use App Password, not regular password
      },
    });
  }

  // Option 2: SendGrid
  if (process.env.EMAIL_SERVICE === 'sendgrid') {
    console.log('📧 Configuring SendGrid transporter');
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  }

  // Option 3: Custom SMTP
  if (process.env.SMTP_HOST) {
    console.log('📧 Configuring custom SMTP transporter');
    return nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  // No email service configured
  console.warn('⚠️  No email service configured. Emails will not be sent.');
  return null;
};

// Get or create transporter (lazy initialization)
const getTransporter = () => {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
};

// Send waitlist confirmation email
export const sendWaitlistConfirmation = async (email, position = null) => {
  const transporter = getTransporter();
  
  if (!transporter) {
    console.log('📧 Email service not configured. Skipping email to:', email);
    return { success: false, message: 'Email service not configured' };
  }

  // Handle Resend separately
  if (transporter === 'resend' && resendClient) {
    const positionText = position ? `<p style="font-size: 18px; font-weight: bold; color: #667eea; text-align: center; margin: 20px 0;">📊 You are number ${position} on the waitlist!</p>` : '';

    try {
      const result = await resendClient.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: email,
        subject: 'Welcome to Pointhed Waitlist! 🎉',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 You're on the Waitlist!</h1>
              </div>
              <div class="content">
                <p>Hi there!</p>
                <p>Thanks for joining the Pointhed waitlist. We're excited to have you on board! 🚀</p>
                ${positionText}
                <p>We're working hard to bring you the best customer loyalty platform for businesses. You'll be among the first to know when we launch.</p>
                <p><strong>What happens next?</strong></p>
                <ul>
                  <li>We'll keep you updated on our progress</li>
                  <li>You'll get early access when we launch</li>
                  <li>Special offers for early adopters</li>
                </ul>
                <p>In the meantime, want to try our instant demo?</p>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" class="button">Try Instant Demo</a>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Pointhed. All rights reserved.</p>
                <p>If you didn't sign up for this, you can safely ignore this email.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
      console.log('✅ Resend email sent successfully:', result.id);
      return { success: true, messageId: result.id };
    } catch (error) {
      console.error('❌ Error sending email via Resend:', error);
      return { success: false, error: error.message };
    }
  }

  // Handle nodemailer (Gmail, SendGrid, SMTP)
  const positionText = position ? `<p style="font-size: 18px; font-weight: bold; color: #667eea; text-align: center; margin: 20px 0;">📊 You are number ${position} on the waitlist!</p>` : '';
  const positionTextPlain = position ? `\n📊 You are number ${position} on the waitlist!\n` : '';

  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@loyolq.com',
      to: email,
      subject: 'Welcome to Pointhed Waitlist! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 You're on the Waitlist!</h1>
            </div>
            <div class="content">
              <p>Hi there!</p>
              <p>Thanks for joining the Pointhed waitlist. We're excited to have you on board! 🚀</p>
              ${positionText}
              <p>We're working hard to bring you the best customer loyalty platform for businesses. You'll be among the first to know when we launch.</p>
              <p><strong>What happens next?</strong></p>
              <ul>
                <li>We'll keep you updated on our progress</li>
                <li>You'll get early access when we launch</li>
                <li>Special offers for early adopters</li>
              </ul>
              <p>In the meantime, want to try our instant demo?</p>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" class="button">Try Instant Demo</a>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} Pointhed. All rights reserved.</p>
              <p>If you didn't sign up for this, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Welcome to Pointhed Waitlist!

Thanks for joining the Pointhed waitlist. We're excited to have you on board!
${positionTextPlain}
We're working hard to bring you the best customer loyalty platform for businesses. You'll be among the first to know when we launch.

What happens next?
- We'll keep you updated on our progress
- You'll get early access when we launch  
- Special offers for early adopters

Visit ${process.env.FRONTEND_URL || 'http://localhost:5173'} to try our instant demo.

© ${new Date().getFullYear()} Pointhed. All rights reserved.
      `.trim(),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { success: false, error: error.message };
  }
};

// Test email configuration
export const testEmailConfig = async () => {
  const transporter = getTransporter();
  
  if (!transporter) {
    return { success: false, message: 'No email service configured' };
  }

  try {
    await transporter.verify();
    console.log('✅ Email service is ready to send messages');
    return { success: true, message: 'Email service verified' };
  } catch (error) {
    console.error('❌ Email service verification failed:', error);
    return { success: false, error: error.message };
  }
};
