const service = require('./pipeline.service');
const conversion = require('./conversion.service');
const docService = require('./pipeline.documents.service');
const { success, paginated } = require('../../core/utils/response');

exports.createPipeline = async (req, res, next) => {
  try {
    const data = await service.createPipeline(req.body, req.user.id);
    res.status(201).json(success(data, 'Pipeline created', 201));
  } catch (err) {
    next(err);
  }
};

exports.getPipelines = async (req, res, next) => {
  try {
    const { rows, total, page, limit } = await service.getPipelines(req.query);
    res.json(paginated(rows, total, page, limit));
  } catch (err) { next(err); }
};

exports.getPipelineHistory = async (req, res, next) => {
  try {
    const data = await service.getPipelineHistory(req.query);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.getCalendarView = async (req, res, next) => {
  try {
    const data = await service.getCalendarView(req.query);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.getPipelineById = async (req, res, next) => {
  try {
    const data = await service.getPipelineById(req.params.id);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.updatePipeline = async (req, res, next) => {
  try {
    const data = await service.updatePipeline(req.params.id, req.body, req.user.id);
    res.json(success(data, 'Pipeline updated'));
  } catch (err) {
    next(err);
  }
};

exports.deletePipeline = async (req, res, next) => {
  try {
    await service.deletePipeline(req.params.id, req.user.id);
    res.json(success(null, 'Pipeline deleted'));
  } catch (err) {
    next(err);
  }
};

// ── Pipeline Documents (checklist: Quotation, Confirmation, Agreement, PO, WO …) ──
exports.getPipelineDocuments = async (req, res, next) => {
  try {
    const data = await docService.listDocuments(req.params.id);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.addPipelineDocument = async (req, res, next) => {
  try {
    const data = await docService.addDocument(req.params.id, req.body.name, req.user.id);
    res.status(201).json(success(data, 'Document added', 201));
  } catch (err) { next(err); }
};

exports.updatePipelineDocument = async (req, res, next) => {
  try {
    const data = await docService.updateDocument(
      req.params.id, req.params.docId,
      { file: req.file, name: req.body.name },
      req.user.id
    );
    res.json(success(data, 'Document updated'));
  } catch (err) { next(err); }
};

exports.deletePipelineDocument = async (req, res, next) => {
  try {
    await docService.deleteDocument(req.params.id, req.params.docId, req.user.id);
    res.json(success(null, 'Document deleted'));
  } catch (err) { next(err); }
};

exports.revokePipelineDocument = async (req, res, next) => {
  try {
    await docService.revokeDocument(req.params.id, req.params.docId, req.user.id);
    res.json(success(null, 'File removed from document slot'));
  } catch (err) { next(err); }
};

exports.updateStage = async (req, res, next) => {
  try {
    const data = await service.updateStage(req.params.id, req.body.stage, req.user.id, {
      reason: req.body.reason,
    });
    res.json(success(data, 'Stage updated'));
  } catch (err) {
    next(err);
  }
};

exports.convertToProject = async (req, res, next) => {
  try {
    const data = await conversion.convertToProject(req.params.id, req.user.id);
    res.json(success(data, 'Successfully converted pipeline to project'));
  } catch (err) {
    next(err);
  }
};
