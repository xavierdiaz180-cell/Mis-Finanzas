const financialMetricsService = require('../services/financialMetricsService');

/**
 * Controller for dashboard summary & financial metrics relying on financialMetricsService
 */
async function getSummaryMetrics(req, res) {
  try {
    const metrics = await financialMetricsService.getSummaryMetrics();
    return res.json(metrics);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getCashFlow(req, res) {
  try {
    const months = parseInt(req.query.months || '1', 10);
    const cashFlow = await financialMetricsService.getCashFlow(months);
    return res.json(cashFlow);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getUpcomingPayments(req, res) {
  try {
    const payments = await financialMetricsService.getUpcomingPayments();
    return res.json(payments);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function getTimelines(req, res) {
  try {
    const timelines = await financialMetricsService.getTimelines();
    return res.json(timelines);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getSummaryMetrics,
  getCashFlow,
  getUpcomingPayments,
  getTimelines
};
