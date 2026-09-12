const express = require('express');
const router = express.Router();
const controller = require('./library.controller');
const folderController = require('./folder.controller');
const tagController = require('./tag.controller');
const upload = require('../../core/middleware/upload.middleware');
const authenticate = require('../../core/middleware/auth.middleware');

const authorize = require('../../core/middleware/role.middleware');

router.use(authenticate); // 🔐 All library routes require authentication

// categories
router.get('/categories', controller.getCategories);
router.post('/categories', authorize('admin'), controller.createCategory);
router.put('/categories/:id', authorize('admin'), controller.updateCategory);
router.delete('/categories/:id', authorize('admin'), controller.deleteCategory);
router.get('/categories/:id/download', controller.downloadCategoryZip);

// folders
router.get('/folders', folderController.getFolders);
router.post('/folders', authorize('admin'), folderController.createFolder);
router.put('/folders/:id', authorize('admin'), folderController.updateFolder);
router.delete('/folders/:id', authorize('admin'), folderController.deleteFolder);

// tags
router.get('/tags', tagController.getTags);
router.post('/tags', authorize('admin'), tagController.createTag);
router.delete('/tags/:id', authorize('admin'), tagController.deleteTag);

// documents
router.get('/documents', controller.getDocuments);
router.post('/documents', authorize('admin'), upload.single('file'), controller.createDocument);
router.put('/documents/:id', authorize('admin'), controller.updateDocument);
router.delete('/documents/:id', authorize('admin'), controller.deleteDocument);
router.post('/documents/:id/archive', authorize('admin'), controller.archiveDocument);
router.get('/documents/:id/download', controller.downloadDocument);
router.get('/documents/:id/preview',  controller.previewDocument);

// version history
router.get('/documents/:id/versions', controller.getVersions);
router.post('/documents/:id/versions', authorize('admin'), upload.single('file'), controller.addVersion);
router.post('/documents/:id/versions/:versionId/restore', authorize('admin'), controller.restoreVersion);

module.exports = router;
