const financialMetricsService = require('../services/financialMetricsService');

/**
 * Controller for dashboard summary & financial metrics supporting Global Date Range
 */
async function getSummaryMetrics(req, res) {
  try {
    const { startDate, endDate, start_date, end_date } = req.query;
    const metrics = await financialMetricsService.getSummaryMetrics({
      startDate: startDate || start_date,
      endDate: endDate || end_date
    });
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
    const { startDate, endDate, start_date, end_date } = req.query;
    const timelines = await financialMetricsService.getTimelines({
      startDate: startDate || start_date,
      endDate: endDate || end_date
    });
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
