import express from 'express';
import { sendInstant, verifyWebhook, handleWebhook, removeLead, notifySubscribersEndpoint } from '../controllers/whatsapp.controller.js';

const router = express.Router();

router.post('/instant', sendInstant);
router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhook);
router.delete('/lead/:phoneNumber', removeLead);
router.post('/notify', notifySubscribersEndpoint);

export default router;

