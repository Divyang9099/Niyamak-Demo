const service = require('./notification.service');
const { success } = require('../../core/utils/response');

exports.getNotifications = async (req, res, next) => {
  try {
    const data = await service.getNotifications(req.user.id);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const data = await service.markAsRead(req.params.id, req.user.id);
    res.json(success(data, 'Marked as read'));
  } catch (err) {
    next(err);
  }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const data = await service.markAllRead(req.user.id);
    res.json(success(data, 'All notifications marked as read'));
  } catch (err) {
    next(err);
  }
};

exports.deleteNotification = async (req, res, next) => {
  try {
    await service.deleteNotification(req.params.id, req.user.id);
    res.json(success(null, 'Notification deleted'));
  } catch (err) {
    next(err);
  }
};
