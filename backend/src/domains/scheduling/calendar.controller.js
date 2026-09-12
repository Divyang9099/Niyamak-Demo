const service = require('./calendar.service');
const eventService = require('./event.service');
const conflictService = require('./conflict.service');

const { success } = require('../../core/utils/response');

exports.getCalendar = async (req, res, next) => {
  try {
    const data = await service.getCalendar(req.query);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

// EVENTS
exports.getEvents = async (req, res, next) => {
  try {
    const data = await eventService.getEvents();
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.createEvent = async (req, res, next) => {
  try {
    const data = await eventService.createEvent(req.body);
    res.status(201).json(success(data, 'Event created', 201));
  } catch (err) {
    next(err);
  }
};

exports.updateEvent = async (req, res, next) => {
  try {
    const data = await eventService.updateEvent(req.params.id, req.body, req.user);
    res.json(success(data, 'Event updated'));
  } catch (err) {
    next(err);
  }
};

exports.deleteEvent = async (req, res, next) => {
  try {
    await eventService.deleteEvent(req.params.id, req.user);
    res.json(success(null, 'Event deleted'));
  } catch (err) {
    next(err);
  }
};

// CONFLICTS
exports.getConflicts = async (req, res, next) => {
  try {
    const data = await conflictService.getConflicts();
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.resolveConflict = async (req, res, next) => {
  try {
    const data = await conflictService.resolveConflict(req.params.id);
    res.json(success(data, 'Conflict resolved'));
  } catch (err) {
    next(err);
  }
};
