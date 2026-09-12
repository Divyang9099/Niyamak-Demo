const express      = require('express');
const router       = express.Router();
const controller   = require('./asset.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const authorize    = require('../../core/middleware/role.middleware');

router.use(authenticate);

router.get('/summary',    controller.getAssetSummary);               // summary counts — all roles
router.get('/',           controller.getAssets);                     // list — all roles
router.get('/:id',        controller.getAssetById);                  // detail — all roles
router.post('/',          authorize('admin', 'project_manager'), controller.createAsset);
router.put('/:id',        authorize('admin', 'project_manager'), controller.updateAsset);
router.delete('/:id',     authorize('admin'),                    controller.deleteAsset);

module.exports = router;
