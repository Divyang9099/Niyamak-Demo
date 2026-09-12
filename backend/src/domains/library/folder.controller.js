const folderService = require('./folder.service');
const { success } = require('../../core/utils/response');

exports.getFolders = async (req, res, next) => {
    try {
        res.json(success(await folderService.getFolders()));
    } catch (err) { next(err); }
};

exports.createFolder = async (req, res, next) => {
    try {
        res.status(201).json(success(await folderService.createFolder(req.body), 'Folder created', 201));
    } catch (err) { next(err); }
};

exports.updateFolder = async (req, res, next) => {
    try {
        res.json(success(await folderService.updateFolder(req.params.id, req.body), 'Folder updated'));
    } catch (err) { next(err); }
};

exports.deleteFolder = async (req, res, next) => {
    try {
        await folderService.deleteFolder(req.params.id);
        res.json(success(null, 'Folder deleted'));
    } catch (err) { next(err); }
};
