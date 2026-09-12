const service = require('./expense.service');

exports.getExpenses = async (req, res) => {
  try {
    const data = await service.getExpenses(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.createExpense = async (req, res) => {
  try {
    const expense = await service.createExpense(req.params.id, req.user.id, req.body);
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.importExpenses = async (req, res) => {
  try {
    const result = await service.bulkCreateExpenses(req.params.id, req.user.id, req.body.rows || []);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.deleteAllExpenses = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.user?.role === 'super_admin';
    const { deleted } = await service.deleteAllExpenses(req.params.id, req.user.id, isAdmin);
    res.json({ success: true, message: `${deleted} expense${deleted !== 1 ? 's' : ''} deleted`, data: { deleted } });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    await service.deleteExpense(req.params.id, req.params.expenseId, req.user.id, isAdmin);
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};
