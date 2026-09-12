const service = require('./pilot.service');
const { success, paginated } = require('../../core/utils/response');
const { uploadToR2 } = require('../../core/utils/r2Upload');
const { getPresignedUrl, buildDownloadFilename } = require('../../core/utils/r2Download');

async function attachDocUrls(pilot) {
  const docFields = [
    { key: 'aadhaar_doc_key',     urlField: 'aadhaar_doc_url',     label: 'aadhaar' },
    { key: 'passport_doc_key',    urlField: 'passport_doc_url',    label: 'passport' },
    { key: 'certificate_doc_key', urlField: 'certificate_doc_url', label: 'certificate' },
  ];
  await Promise.all(docFields.map(async ({ key, urlField, label }) => {
    if (pilot[key]) {
      const filename = buildDownloadFilename(`${label}_${pilot.name || 'pilot'}`, pilot[key]);
      pilot[urlField] = await getPresignedUrl(pilot[key], 3600, filename);
    }
  }));
  return pilot;
}

const uploadPilotFile = async (files, field, pilotFolder) => {
  const f = files?.[field]?.[0];
  return f ? uploadToR2(f, pilotFolder) : undefined;
};

exports.createPilot = async (req, res, next) => {
  try {
    const folder = `pilots/docs`;
    const [aadhaar_doc_key, passport_doc_key, certificate_doc_key] = await Promise.all([
      uploadPilotFile(req.files, 'aadhaar',     folder),
      uploadPilotFile(req.files, 'passport',    folder),
      uploadPilotFile(req.files, 'certificate', folder),
    ]);
    const data = await service.createPilot({
      ...req.body,
      aadhaar_doc_key,
      passport_doc_key,
      certificate_doc_key,
    });
    res.status(201).json(success(data, 'Pilot created', 201));
  } catch (err) { next(err); }
};

exports.getPilots = async (req, res, next) => {
  try {
    const { rows, total, page, limit } = await service.getPilots(req.query);
    rows.forEach(r => service.redactPilotForViewer(r, req.user));
    res.json(paginated(rows, total, page, limit));
  } catch (err) { next(err); }
};

exports.getPilotById = async (req, res, next) => {
  try {
    const pilot = await service.getPilotById(req.params.id);
    // Redact BEFORE generating doc URLs — a stripped doc key means attachDocUrls
    // naturally skips it (no presigned URL is ever minted for a redacted field).
    service.redactPilotForViewer(pilot, req.user);
    await attachDocUrls(pilot);
    res.json(success(pilot));
  } catch (err) { next(err); }
};

exports.updatePilot = async (req, res, next) => {
  try {
    const folder = `pilots/docs`;
    const [aadhaar_doc_key, passport_doc_key, certificate_doc_key] = await Promise.all([
      uploadPilotFile(req.files, 'aadhaar',     folder),
      uploadPilotFile(req.files, 'passport',    folder),
      uploadPilotFile(req.files, 'certificate', folder),
    ]);
    const data = await service.updatePilot(req.params.id, {
      ...req.body,
      ...(aadhaar_doc_key     !== undefined && { aadhaar_doc_key }),
      ...(passport_doc_key    !== undefined && { passport_doc_key }),
      ...(certificate_doc_key !== undefined && { certificate_doc_key }),
    });
    res.json(success(data, 'Pilot updated'));
  } catch (err) { next(err); }
};

exports.deletePilot = async (req, res, next) => {
  try {
    await service.deletePilot(req.params.id);
    res.json(success(null, 'Pilot deleted'));
  } catch (err) { next(err); }
};
