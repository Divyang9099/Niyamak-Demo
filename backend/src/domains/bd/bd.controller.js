const { GetObjectCommand } = require('@aws-sdk/client-s3');
const r2  = require('../../core/config/r2');
const env = require('../../core/config/env');
const { uploadToR2, deleteFromR2 } = require('../../core/utils/r2Upload');

const clients     = require('./bd.clients.service');
const contacts     = require('./bd.contacts.service');
const channels     = require('./bd.channels.service');
const config       = require('./bd.config.service');
const touchpoints  = require('./bd.touchpoints.service');
const followups    = require('./bd.followups.service');
const auditService = require('./bd.audit.service');
const bdExport      = require('./bd.export.service');
const { success, paginated, error } = require('../../core/utils/response');

// ── Clients ──────────────────────────────────────────────────────────────────
exports.createClient = async (req, res, next) => {
  try {
    if (!req.body?.name || !String(req.body.name).trim()) {
      return res.status(400).json(error('Client name is required', 400));
    }
    const data = await clients.createClient(req.body, req.user?.id);
    res.status(201).json(success(data, 'Client created', 201));
  } catch (err) { next(err); }
};

exports.getClients = async (req, res, next) => {
  try {
    const { rows, total, page, limit } = await clients.getClients(req.query);
    res.json(paginated(rows, total, page, limit));
  } catch (err) { next(err); }
};

exports.exportClientsExcel = async (req, res, next) => {
  try {
    const buffer = await bdExport.generateClientsWorkbook(req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="niyamak-bd-clients-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
};

exports.getClientById = async (req, res, next) => {
  try {
    res.json(success(await clients.getClientById(req.params.id)));
  } catch (err) { next(err); }
};

exports.updateClient = async (req, res, next) => {
  try {
    res.json(success(await clients.updateClient(req.params.id, req.body, req.user?.id), 'Client updated'));
  } catch (err) { next(err); }
};

exports.updateStatus = async (req, res, next) => {
  try {
    res.json(success(await clients.updateStatus(req.params.id, req.body, req.user?.id), 'Status updated'));
  } catch (err) { next(err); }
};

exports.updatePriority = async (req, res, next) => {
  try {
    res.json(success(await clients.updatePriority(req.params.id, req.body?.priority, req.user?.id), 'Priority updated'));
  } catch (err) { next(err); }
};

exports.deleteClient = async (req, res, next) => {
  try {
    await clients.deleteClient(req.params.id, req.user?.id);
    res.json(success(null, 'Client deleted'));
  } catch (err) { next(err); }
};

exports.getDashboard = async (req, res, next) => {
  try {
    res.json(success(await clients.getDashboard(req.query)));
  } catch (err) { next(err); }
};

exports.getStats = async (req, res, next) => {
  try {
    res.json(success(await clients.getStats()));
  } catch (err) { next(err); }
};

// ── Client logo (R2, mirrors user avatar pattern) ─────────────────────────────
exports.uploadLogo = async (req, res, next) => {
  try {
    if (!req.file) throw Object.assign(new Error('No image provided'), { statusCode: 400 });
    if (!/^image\//.test(req.file.mimetype || '')) {
      throw Object.assign(new Error('Logo must be an image (JPG, PNG, WEBP, SVG)'), { statusCode: 400 });
    }
    const key = await uploadToR2(req.file, 'bd-logos');
    let oldKey;
    try {
      oldKey = await clients.setLogoKey(req.params.id, key);
    } catch (err) {
      deleteFromR2(key).catch(() => {});
      throw err;
    }
    if (oldKey && oldKey !== key) deleteFromR2(oldKey).catch(() => {});
    res.json(success({ logo_url: key }, 'Logo updated'));
  } catch (err) { next(err); }
};

exports.getLogo = async (req, res, next) => {
  try {
    const key = await clients.getLogoKey(req.params.id);
    const response = await r2.send(new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }));
    res.setHeader('Content-Type', response.ContentType || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Neutralise any script in a directly-opened SVG logo (no effect on <img>).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    response.Body.pipe(res);
  } catch (err) {
    if (!err.statusCode || err.statusCode === 404) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      return res.status(404).end();
    }
    next(err);
  }
};

exports.removeLogo = async (req, res, next) => {
  try {
    const key = await clients.removeLogoKey(req.params.id);
    if (key) deleteFromR2(key).catch(() => {});
    res.json(success(null, 'Logo removed'));
  } catch (err) { next(err); }
};

// ── Contacts ─────────────────────────────────────────────────────────────────
exports.listContacts = async (req, res, next) => {
  try {
    res.json(success(await contacts.listContacts(req.params.id)));
  } catch (err) { next(err); }
};

exports.createContact = async (req, res, next) => {
  try {
    res.status(201).json(success(await contacts.createContact(req.params.id, req.body, req.user?.id), 'Contact added', 201));
  } catch (err) { next(err); }
};

exports.updateContact = async (req, res, next) => {
  try {
    res.json(success(await contacts.updateContact(req.params.contactId, req.body, req.user?.id), 'Contact updated'));
  } catch (err) { next(err); }
};

exports.deleteContact = async (req, res, next) => {
  try {
    await contacts.deleteContact(req.params.contactId, req.user?.id);
    res.json(success(null, 'Contact removed'));
  } catch (err) { next(err); }
};

// ── Channels ─────────────────────────────────────────────────────────────────
exports.listChannels = async (req, res, next) => {
  try {
    res.json(success(await channels.listChannels(req.params.id, req.query)));
  } catch (err) { next(err); }
};

exports.createChannel = async (req, res, next) => {
  try {
    res.status(201).json(success(await channels.createChannel(req.params.id, req.body, req.user?.id), 'Channel added', 201));
  } catch (err) { next(err); }
};

exports.updateChannel = async (req, res, next) => {
  try {
    res.json(success(await channels.updateChannel(req.params.channelId, req.body, req.user?.id), 'Channel updated'));
  } catch (err) { next(err); }
};

exports.deleteChannel = async (req, res, next) => {
  try {
    await channels.deleteChannel(req.params.channelId, req.user?.id);
    res.json(success(null, 'Channel removed'));
  } catch (err) { next(err); }
};

exports.reorderChannels = async (req, res, next) => {
  try {
    res.json(success(await channels.reorderChannels(req.body?.items, req.user?.id), 'Order saved'));
  } catch (err) { next(err); }
};

// ── Sectors ──────────────────────────────────────────────────────────────────
exports.listSectors = async (req, res, next) => {
  try {
    res.json(success(await config.listSectors({ activeOnly: req.query.active_only === 'true' })));
  } catch (err) { next(err); }
};
exports.createSector = async (req, res, next) => {
  try { res.status(201).json(success(await config.createSector(req.body, req.user?.id), 'Sector created', 201)); }
  catch (err) { next(err); }
};
exports.updateSector = async (req, res, next) => {
  try { res.json(success(await config.updateSector(req.params.id, req.body, req.user?.id), 'Sector updated')); }
  catch (err) { next(err); }
};
exports.deleteSector = async (req, res, next) => {
  try { await config.deleteSector(req.params.id, req.user?.id); res.json(success(null, 'Sector deleted')); }
  catch (err) { next(err); }
};

// ── Departments ──────────────────────────────────────────────────────────────
exports.listDepartments = async (req, res, next) => {
  try {
    res.json(success(await config.listDepartments({ activeOnly: req.query.active_only === 'true' })));
  } catch (err) { next(err); }
};
exports.createDepartment = async (req, res, next) => {
  try { res.status(201).json(success(await config.createDepartment(req.body, req.user?.id), 'Department created', 201)); }
  catch (err) { next(err); }
};
exports.updateDepartment = async (req, res, next) => {
  try { res.json(success(await config.updateDepartment(req.params.id, req.body, req.user?.id), 'Department updated')); }
  catch (err) { next(err); }
};
exports.deleteDepartment = async (req, res, next) => {
  try { await config.deleteDepartment(req.params.id, req.user?.id); res.json(success(null, 'Department deleted')); }
  catch (err) { next(err); }
};

// ── Settings ─────────────────────────────────────────────────────────────────
exports.getSettings = async (req, res, next) => {
  try { res.json(success(await config.getSettings())); }
  catch (err) { next(err); }
};
exports.updateSettings = async (req, res, next) => {
  try { res.json(success(await config.updateSettings(req.body, req.user?.id), 'Settings saved')); }
  catch (err) { next(err); }
};

// ── Touchpoints (the communication log) ───────────────────────────────────────
exports.logOutreach = async (req, res, next) => {
  try {
    res.status(201).json(success(await touchpoints.logOutreach(req.params.channelId, req.body, req.user?.id), 'Outreach logged', 201));
  } catch (err) { next(err); }
};

exports.logResponse = async (req, res, next) => {
  try {
    res.json(success(await touchpoints.logResponse(req.params.id, req.body, req.user?.id), 'Response logged'));
  } catch (err) { next(err); }
};

exports.createTouchpoint = async (req, res, next) => {
  try {
    res.status(201).json(success(await touchpoints.createManualTouchpoint(req.body, req.user?.id), 'Touchpoint logged', 201));
  } catch (err) { next(err); }
};

exports.correctTouchpoint = async (req, res, next) => {
  try {
    res.json(success(await touchpoints.correctTouchpoint(req.params.id, req.body, req.user?.id), 'Entry corrected'));
  } catch (err) { next(err); }
};

exports.listTouchpoints = async (req, res, next) => {
  try {
    const { rows, total, page, limit } = await touchpoints.listTouchpoints(req.params.id, req.query);
    res.json(paginated(rows, total, page, limit));
  } catch (err) { next(err); }
};

exports.deleteTouchpoint = async (req, res, next) => {
  try {
    res.json(success(await touchpoints.deleteTouchpoint(req.params.id, req.user?.id), 'Touchpoint deleted'));
  } catch (err) { next(err); }
};

// ── Activity (BD's own audit viewer) ──────────────────────────────────────────
exports.getActivity = async (req, res, next) => {
  try {
    res.json(success(await auditService.getLogs(req.query)));
  } catch (err) { next(err); }
};

// ── Follow-ups (the inbox) ────────────────────────────────────────────────────
exports.listFollowups = async (req, res, next) => {
  try { res.json(success(await followups.listFollowups(req.query))); }
  catch (err) { next(err); }
};
exports.createFollowup = async (req, res, next) => {
  try { res.status(201).json(success(await followups.createFollowup(req.body, req.user?.id), 'Follow-up created', 201)); }
  catch (err) { next(err); }
};
exports.completeFollowup = async (req, res, next) => {
  try { res.json(success(await followups.completeFollowup(req.params.id, req.user?.id), 'Follow-up completed')); }
  catch (err) { next(err); }
};
exports.snoozeFollowup = async (req, res, next) => {
  try { res.json(success(await followups.snoozeFollowup(req.params.id, req.body, req.user?.id), 'Follow-up snoozed')); }
  catch (err) { next(err); }
};
exports.cancelFollowup = async (req, res, next) => {
  try { res.json(success(await followups.cancelFollowup(req.params.id, req.user?.id), 'Follow-up cancelled')); }
  catch (err) { next(err); }
};
