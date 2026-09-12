const service = require('./project.service');
const { success, error, paginated } = require('../../core/utils/response');

exports.createProject = async (req, res, next) => {
  try {
    const { name, client_name, project_type } = req.body;
    if (!name || !client_name || !project_type) {
        return res.status(400).json(error('Missing required fields: name, client_name, project_type', 400));
    }
    const data = await service.createProject(req.body, req.user.id);
    res.status(201).json(success(data, 'Project created', 201));
  } catch (err) {
    next(err); // passes error to global error handler
  }
};

exports.getProjects = async (req, res, next) => {
  try {
    const { rows, total, page, limit } = await service.getProjects(req.user, req.query);
    rows.forEach(r => service.redactForRole(r, req.user?.role));
    res.json(paginated(rows, total, page, limit));
  } catch (err) {
    next(err);
  }
};

exports.getProjectById = async (req, res, next) => {
  try {
    const data = await service.getProjectById(req.params.id);
    if (!data) {
      return res.status(404).json(error('Project not found', 404));
    }
    // Attach the requesting user's membership role on this project so the
    // frontend can gate write actions (Edit/Archive) on membership, not just role.
    // Admin always has full management rights.
    data.my_project_role = req.user?.role === 'admin'
      ? 'admin'
      : await service.getUserProjectRole(req.params.id, req.user.id);
    data.is_member = data.my_project_role != null;
    service.redactForRole(data, req.user?.role);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.updateProject = async (req, res, next) => {
  try {
    const data = await service.updateProject(req.params.id, req.body, req.user.id);
    res.json(success(data, 'Project updated'));
  } catch (err) {
    next(err);
  }
};

exports.completeProject = async (req, res, next) => {
  try {
    let invoiceKey = null;
    let originalName = null;
    if (req.file) {
      const { uploadToR2 } = require('../../core/utils/r2Upload');
      invoiceKey = await uploadToR2(req.file, `projects/${req.params.id}/invoice`);
      originalName = req.file.originalname;
    }
    const data = await service.completeProject(req.params.id, invoiceKey, req.user.id, originalName);
    res.json(success(data, 'Project marked complete'));
  } catch (err) {
    next(err);
  }
};

exports.downloadInvoice = async (req, res, next) => {
  try {
    const project = await service.getProjectById(req.params.id);
    if (!project || !project.invoice_url) {
      return res.status(404).json(error('No invoice on file for this project', 404));
    }
    const { getPresignedUrl } = require('../../core/utils/r2Download');
    const filename = `Invoice_${(project.name || 'project').replace(/[^a-z0-9]/gi, '_')}.${project.invoice_url.split('.').pop()}`;
    const url = await getPresignedUrl(project.invoice_url, 3600, filename);
    res.json(success({ url }));
  } catch (err) {
    next(err);
  }
};

exports.cancelProject = async (req, res, next) => {
  try {
    const data = await service.cancelProject(req.params.id, req.body.reason, req.user.id);
    res.json(success(data, 'Project cancelled and archived'));
  } catch (err) {
    next(err);
  }
};

exports.archiveProject = async (req, res, next) => {
  try {
    const data = await service.archiveProject(req.params.id, req.user.id);
    res.json(success(data, 'Project archived'));
  } catch (err) {
    next(err);
  }
};

exports.restoreProject = async (req, res, next) => {
  try {
    const data = await service.restoreProject(req.params.id, req.user.id);
    res.json(success(data, 'Project restored from archive'));
  } catch (err) {
    next(err);
  }
};

exports.deleteProject = async (req, res, next) => {
  try {
    const data = await service.deleteProject(req.params.id, req.user.id);
    res.json(success(data, 'Project deleted'));
  } catch (err) {
    next(err);
  }
};

exports.bulkUpdateStatus = async (req, res, next) => {
  try {
    const { ids, status } = req.body;
    const data = await service.bulkUpdateStatus(ids, status, req.user.id);
    res.json(success(data, `Updated ${data.updated} projects`));
  } catch (err) { next(err); }
};
