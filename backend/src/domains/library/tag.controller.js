const tagService = require('./tag.service');
const { success } = require('../../core/utils/response');

exports.getTags = async (req, res, next) => {
    try {
        res.json(success(await tagService.getTags()));
    } catch (err) { next(err); }
};

exports.createTag = async (req, res, next) => {
    try {
        res.status(201).json(success(await tagService.createTag(req.body), 'Tag created', 201));
    } catch (err) { next(err); }
};

exports.deleteTag = async (req, res, next) => {
    try {
        await tagService.deleteTag(req.params.id);
        res.json(success(null, 'Tag deleted'));
    } catch (err) { next(err); }
};
