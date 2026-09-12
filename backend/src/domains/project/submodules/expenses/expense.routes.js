const express    = require('express');
const router     = express.Router({ mergeParams: true });
const controller = require('./expense.controller');
const requireProjectRole = require('../../../../core/middleware/projectRole.middleware');

// GET  /projects/:id/expenses
router.get('/',               controller.getExpenses);

// POST /projects/:id/expenses/import   — bulk CSV import (must be before /:expenseId)
router.post('/import', requireProjectRole('project_manager'), controller.importExpenses);

// POST /projects/:id/expenses
router.post('/', requireProjectRole('project_manager'), controller.createExpense);

// DELETE /projects/:id/expenses      — wipe every expense on the project
router.delete('/', requireProjectRole('project_manager'), controller.deleteAllExpenses);

// DELETE /projects/:id/expenses/:expenseId
router.delete('/:expenseId', requireProjectRole('project_manager'), controller.deleteExpense);

module.exports = router;
