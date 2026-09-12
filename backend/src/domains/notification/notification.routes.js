const express = require('express');
const router = express.Router();
const controller = require('./notification.controller');
const prefsCtrl  = require('./notif_prefs.controller');
const authenticate = require('../../core/middleware/auth.middleware');

router.use(authenticate);

router.get('/',         controller.getNotifications);
router.put('/read-all', controller.markAllRead);
router.put('/:id/read', controller.markAsRead);
router.delete('/:id',   controller.deleteNotification);

// Notification preferences (any authenticated user for their own prefs)
router.get('/prefs',  prefsCtrl.getPrefs);
router.put('/prefs',  prefsCtrl.updatePrefs);

module.exports = router;
