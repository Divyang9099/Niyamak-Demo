/**
 * WhatsApp Service — Meta Cloud API (free tier, 1000 conversations/month)
 *
 * Setup (one-time):
 *   1. meta.com/business → create a Business account
 *   2. developers.facebook.com → create an App → add WhatsApp product
 *   3. Get your Phone Number ID and a permanent System User access token
 *   4. Set WHATSAPP_PHONE_ID and WHATSAPP_ACCESS_TOKEN in .env
 *   5. Submit each template below for Meta approval (takes ~24h)
 *
 * Templates to submit at business.facebook.com/wa/manage/message-templates:
 *   Name                        | Category    | Body
 *   varuna_pilot_assignment     | UTILITY     | Hi {{1}}, you are assigned to project *{{2}}* starting {{3}}. Drone: {{4}}. — Varuna Nexus
 *   varuna_project_status       | UTILITY     | Hi {{1}}, project *{{2}}* has moved to *{{3}}*. Log in to Varuna Nexus for details.
 *   varuna_deliverable_uploaded | UTILITY     | Hi {{1}}, a new deliverable *{{2}}* was uploaded to project *{{3}}*. Please review.
 *   varuna_deliverable_approved | UTILITY     | Hi {{1}}, your deliverable *{{2}}* on *{{3}}* has been approved.
 *   varuna_deliverable_rejected | UTILITY     | Hi {{1}}, your deliverable *{{2}}* on *{{3}}* was rejected. Reason: {{4}}. Please resubmit.
 *   varuna_member_added         | UTILITY     | Hi {{1}}, you have been added to project *{{2}}* as {{3}}. Log in to Varuna Nexus.
 *   varuna_welcome              | UTILITY     | Welcome to Varuna Nexus, {{1}}! Your role: {{2}}. Login email: {{3}}. Check your email for credentials.
 *   varuna_license_expiry_pilot | UTILITY     | Hi {{1}}, your DGCA pilot license expires on {{2}}. Please initiate renewal immediately.
 *   varuna_license_expiry_admin | UTILITY     | Hi {{1}}, pilot {{2}} has a license expiring on {{3}}. Please follow up.
 *   varuna_drone_maintenance    | UTILITY     | Hi {{1}}, drone *{{2}}* is due for scheduled maintenance on {{3}}. Please plan accordingly.
 */

const https = require('https');
const env   = require('../../core/config/env');

const GRAPH_API_VERSION = 'v20.0';

const isConfigured = () => !!(env.whatsapp.phoneId && env.whatsapp.accessToken);

// Normalize phone → E.164 without '+' (Meta format: "919876543210")
const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  // Indian 10-digit number → prepend 91
  if (digits.length === 10) return `91${digits}`;
  // Already has country code
  if (digits.length >= 11) return digits;
  return null;
};

// Raw Meta API call
const _callApi = (body) => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'graph.facebook.com',
      path: `/${GRAPH_API_VERSION}/${env.whatsapp.phoneId}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Meta API ${res.statusCode}: ${JSON.stringify(parsed.error || parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Meta API non-JSON response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

/**
 * Send a pre-approved template message.
 * @param {string} phone - recipient phone number (any format, auto-normalized)
 * @param {string} templateName - Meta-approved template name (see list above)
 * @param {string[]} params - ordered replacement values for {{1}}, {{2}}, …
 * @param {string} [langCode] - BCP-47 language code, default 'en'
 */
exports.sendTemplate = async (phone, templateName, params = [], langCode = 'en') => {
  if (!isConfigured()) {
    console.log(`[WhatsApp Stub] Template: ${templateName} | To: ${phone} | Params: ${params.join(', ')}`);
    return { skipped: true };
  }

  const to = normalizePhone(phone);
  if (!to) {
    console.warn(`[WhatsApp] Invalid phone number skipped: ${phone}`);
    return { skipped: true };
  }

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: langCode },
      components: params.length > 0 ? [{
        type: 'body',
        parameters: params.map((text) => ({ type: 'text', text: String(text) })),
      }] : [],
    },
  };

  try {
    const result = await _callApi(body);
    console.log(`[WhatsApp Sent] Template: ${templateName} → ${to} | msgId: ${result?.messages?.[0]?.id}`);
    return result;
  } catch (err) {
    console.error(`[WhatsApp Error] Template: ${templateName} → ${to} | ${err.message}`);
    throw err;
  }
};

/**
 * Send a plain text message (only works within 24h of user messaging you first).
 * Useful for testing. Production notifications must use sendTemplate().
 */
exports.sendText = async (phone, text) => {
  if (!isConfigured()) {
    console.log(`[WhatsApp Stub] Text → ${phone}: ${text}`);
    return { skipped: true };
  }

  const to = normalizePhone(phone);
  if (!to) return { skipped: true };

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };

  try {
    const result = await _callApi(body);
    console.log(`[WhatsApp Sent] Text → ${to}`);
    return result;
  } catch (err) {
    console.error(`[WhatsApp Error] Text → ${to} | ${err.message}`);
    throw err;
  }
};
