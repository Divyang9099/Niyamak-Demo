const service      = require('./estimation.service');
const costEngine   = require('./costEngine.service');
const exportService = require('./export.service');
const rateCardService = require('./rateCard.service');
const { success, paginated, error } = require('../../core/utils/response');
const { pdfQueue, excelQueue, addJob, REDIS_ENABLED } = require('../../core/queues/index');

// DB-backed: returns { rate_cards: { travel: [...], per_diem: [...], ... }, defaults: {...} }
exports.getRateCards = async (_req, res, next) => {
  try {
    res.json(success(await rateCardService.getAllGrouped()));
  } catch (err) { next(err); }
};

// Flat list — for Admin rate-card management UI
exports.listRateCards = async (_req, res, next) => {
  try {
    res.json(success(await rateCardService.listAll()));
  } catch (err) { next(err); }
};

exports.createRateCard = async (req, res, next) => {
  try {
    const { category, item_name, rate } = req.body;
    if (!category || !item_name || rate === undefined) {
      return res.status(400).json(error('category, item_name, rate are required', 400));
    }
    res.status(201).json(success(await rateCardService.create(req.body), 'Rate card created', 201));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json(error('A rate card with this category + item_name already exists', 409));
    }
    next(err);
  }
};

exports.updateRateCard = async (req, res, next) => {
  try {
    res.json(success(await rateCardService.update(req.params.id, req.body), 'Rate card updated'));
  } catch (err) { next(err); }
};

exports.deleteRateCard = async (req, res, next) => {
  try {
    res.json(success(await rateCardService.remove(req.params.id), 'Rate card deactivated'));
  } catch (err) { next(err); }
};

exports.createEstimation = async (req, res, next) => {
  try {
    const cost = costEngine.calculate(req.body);
    const data = await service.createEstimation(req.body, cost, req.user.id);
    res.status(201).json(success(data, 'Estimation created', 201));
  } catch (err) {
    next(err);
  }
};

exports.getEstimations = async (req, res, next) => {
  try {
    const { rows, total, page, limit } = await service.getEstimations(req.user, req.query);
    res.json(paginated(rows, total, page, limit));
  } catch (err) {
    next(err);
  }
};

exports.getEstimationById = async (req, res, next) => {
  try {
    const data = await service.getEstimationById(req.params.id);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.updateEstimation = async (req, res, next) => {
  try {
    const cost = costEngine.calculate(req.body);
    const data = await service.updateEstimation(req.params.id, req.body, cost);
    res.json(success(data, 'Estimation updated'));
  } catch (err) {
    next(err);
  }
};

exports.deleteEstimation = async (req, res, next) => {
  try {
    await service.deleteEstimation(req.params.id);
    res.json(success(null, 'Estimation deleted'));
  } catch (err) {
    next(err);
  }
};

exports.renameEstimation = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json(error('name is required', 400));
    }
    const data = await service.renameEstimation(req.params.id, name);
    res.json(success(data, 'Estimation renamed'));
  } catch (err) {
    next(err);
  }
};

exports.cloneEstimation = async (req, res, next) => {
  try {
    const data = await service.cloneEstimation(req.params.id, req.user.id);
    res.status(201).json(success(data, 'Estimation cloned', 201));
  } catch (err) {
    next(err);
  }
};

exports.exportExcel = async (req, res, next) => {
  try {
    const buffer = await exportService.generateExcel(req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="estimation-${req.params.id.slice(0,8)}.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
};

exports.exportPDF = async (req, res, next) => {
  try {
    const buffer = await exportService.generatePDF(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="estimation-${req.params.id.slice(0,8)}.pdf"`);
    res.send(buffer);
  } catch (err) { next(err); }
};
