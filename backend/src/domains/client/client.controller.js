const service = require('./client.service');
const { success, paginated, error } = require('../../core/utils/response');

exports.createClient = async (req, res, next) => {
  try {
    if (!req.body?.name || !String(req.body.name).trim()) {
      return res.status(400).json(error('Client name is required', 400));
    }
    const data = await service.createClient(req.body, req.user?.id);
    res.status(201).json(success(data, 'Client created', 201));
  } catch (err) { next(err); }
};

exports.getClients = async (req, res, next) => {
  try {
    const { rows, total, page, limit } = await service.getClients(req.query);
    rows.forEach(r => service.redactClientForViewer(r, req.user));
    res.json(paginated(rows, total, page, limit));
  } catch (err) { next(err); }
};

exports.getClientById = async (req, res, next) => {
  try {
    const client = await service.getClientById(req.params.id);
    service.redactClientForViewer(client, req.user);
    res.json(success(client));
  } catch (err) { next(err); }
};

exports.updateClient = async (req, res, next) => {
  try {
    res.json(success(await service.updateClient(req.params.id, req.body, req.user?.id), 'Client updated'));
  } catch (err) { next(err); }
};

exports.deleteClient = async (req, res, next) => {
  try {
    await service.deleteClient(req.params.id, req.user?.id);
    res.json(success(null, 'Client deleted'));
  } catch (err) { next(err); }
};
