const service = require('./invoice.service');
const { uploadToR2 } = require('../../../../core/utils/r2Upload');
const { success } = require('../../../../core/utils/response');

exports.extractInvoice = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    // Multer disk storage → req.file.path; memory storage → req.file.buffer
    const result = req.file.path
      ? await service.extractFromPath(req.file.path, req.file.originalname)
      : await service.extractFromBuffer(req.file.buffer, req.file.originalname);
    console.log('[invoice extract] status:', result.extraction_status,
      '| method:', result.extraction_method,
      '| fields:', JSON.stringify(result.fields),
      '| items:', result.items?.length);
    res.json(success(result, 'Extracted'));
  } catch (err) { next(err); }
};

exports.listInvoices = async (req, res, next) => {
  try {
    const data = await service.listInvoices(req.params.id);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.getInvoice = async (req, res, next) => {
  try {
    const data = await service.getInvoice(req.params.id, req.params.invoiceId);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.createInvoice = async (req, res, next) => {
  try {
    let fileKey = null, fileName = null;
    if (req.file) {
      fileKey  = await uploadToR2(req.file, 'invoices');
      fileName = req.file.originalname;
    }
    const body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
    const data = await service.createInvoice(req.params.id, { ...body, file_key: fileKey, file_name: fileName }, req.user.id);
    res.status(201).json(success(data, 'Invoice created', 201));
  } catch (err) { next(err); }
};

exports.updateInvoice = async (req, res, next) => {
  try {
    const body = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body;
    const data = await service.updateInvoice(req.params.id, req.params.invoiceId, body, req.user.id);
    res.json(success(data, 'Invoice updated'));
  } catch (err) { next(err); }
};

exports.deleteInvoice = async (req, res, next) => {
  try {
    await service.deleteInvoice(req.params.id, req.params.invoiceId);
    res.json(success(null, 'Invoice deleted'));
  } catch (err) { next(err); }
};

exports.downloadInvoice = async (req, res, next) => {
  try {
    const data = await service.getDownloadUrl(req.params.id, req.params.invoiceId);
    res.json(success(data));
  } catch (err) { next(err); }
};
