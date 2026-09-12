const service = require('./dashboard.service');
const { success } = require('../../core/utils/response');

exports.getSummary = async (req, res, next) => {
  try {
    const data = await service.getSummary(req.user);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.getProjects = async (req, res, next) => {
  try {
    const data = await service.getProjects(req.query, req.user);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.getProjectDetails = async (req, res, next) => {
  try {
    const data = await service.getProjectDetails(req.params.id, req.user);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.getActivity = async (req, res, next) => {
  try {
    const data = await service.getActivity(req.user);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.getUtilization = async (req, res, next) => {
  try {
    const data = await service.getUtilization(req.user);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.getUpcoming = async (req, res, next) => {
  try {
    const data = await service.getUpcoming(req.user);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.getAlerts = async (req, res, next) => {
  try {
    const data = await service.getAlerts(req.user);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.getReminders = async (req, res, next) => {
  try {
    const data = await service.getReminders(req.user);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.getDroneUtilization = async (req, res, next) => {
  try {
    const data = await service.getDroneUtilization(req.user);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.getPilotGantt = async (req, res, next) => {
  try {
    res.json(success(await service.getPilotGantt(req.user, req.query)));
  } catch (err) { next(err); }
};

exports.getDroneGantt = async (req, res, next) => {
  try {
    res.json(success(await service.getDroneGantt(req.user, req.query)));
  } catch (err) { next(err); }
};

exports.exportData = async (req, res, next) => {
  try {
    const csvData = await service.exportGlobalData(req.user);
    if (csvData === "No Data") {
      return res.status(404).json({ message: "No data available to export." });
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Varuna_Global_Data_Projects_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvData);
  } catch (err) {
    next(err);
  }
};
