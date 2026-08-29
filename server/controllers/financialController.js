const { calculateFinancialMetrics } = require('../services/financialRules');

/**
 * Controller for dashboard summary & financial health metrics
 */
async function getSummaryMetrics(req, res) {
  try {
    const metrics = await calculateFinancialMetrics();
    return res.json(metrics);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getSummaryMetrics
};
