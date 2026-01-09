import express from 'express';
import { testEmailConfig, sendWaitlistConfirmation } from '../services/email.service.js';

const router = express.Router();

// Protected test endpoint - requires ADMIN_TOKEN header to be set
router.post('/test-email', async (req, res) => {
  try {
    const adminToken = process.env.ADMIN_TOKEN;
    const provided = req.headers['x-admin-token'];

    if (!adminToken) {
      return res.status(403).json({ success: false, error: 'Admin tests are disabled (no ADMIN_TOKEN configured)' });
    }

    if (!provided || provided !== adminToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { email } = req.body || {};

    // Verify transporter
    const verification = await testEmailConfig();

    // If email provided, attempt to send a test confirmation
    let sendResult = null;
    if (email) {
      sendResult = await sendWaitlistConfirmation(email, 1).catch(err => ({ success: false, error: err.message }));
    }

    return res.json({ success: true, verification, sendResult });
  } catch (err) {
    console.error('❌ Error in /admin/test-email:', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal error' });
  }
});

export default router;
