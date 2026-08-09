const { GoogleGenerativeAI } = require('@google/generative-ai');
const { dbGet, dbAll } = require('../database');
const { calculateFinancialMetrics } = require('./financialRules');

/**
 * Gathers complete structured financial snapshot for Coach context
 */
async function getFinancialSnapshot() {
  const metrics = await calculateFinancialMetrics();
  const accounts = await dbAll('SELECT name, type, balance, available_credit, credit_limit FROM accounts WHERE active = 1');
  const debts = await dbAll('SELECT name, type, current_balance, payment_amount, interest_rate, due_date FROM debts WHERE current_balance > 0');
  const investments = await dbAll('SELECT name, invested_amount, current_documented_value, risk_level FROM investments');
  const msiPlans = await dbAll('SELECT concept, monthly_amount, remaining_balance, installments_paid, installments_total FROM installment_plans');
  const goal = await dbGet('SELECT target_age, target_amount FROM financial_goals LIMIT 1');

  return {
    metrics,
    accounts,
    debts,
    investments,
    msiPlans,
    financialGoal: goal || { target_age: 55, target_amount: 10000000 }
  };
}

/**
 * Handles conversational chat with the Financial Coach using Gemini API
 */
async function generateCoachChatResponse(userMessage, chatHistory = []) {
  const snapshot = await getFinancialSnapshot();

  const keyRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_api_key'");
  const modelRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_model'");
  const apiKey = (keyRow && keyRow.value) ? keyRow.value : process.env.GEMINI_API_KEY;
  const modelName = (modelRow && modelRow.value) ? modelRow.value : 'gemini-1.5-flash';

  const systemContext = `
    Eres el Coach Financiero personal de "Mis Finanzas".
    Tu personalidad es: DIRECTA, CONVERSACIONAL, CLARA Y ORIENTADA A ACCIONES CONCRETAS.

    FOTO FINANCIERA ACTUAL DEL USUARIO:
    - Disponible Hoy (Cuentas + Nómina + Efectivo, excluye inversiones): $${snapshot.metrics.disponible_hoy.toLocaleString('es-MX')}
    - Riqueza Neta (Patrimonio real): $${snapshot.metrics.riqueza_neta.toLocaleString('es-MX')}
    - Salud Financiera: ${snapshot.metrics.salud_financiera.score}/100 (${snapshot.metrics.salud_financiera.etiqueta})
    - Presupuesto Diario Disponible Hoy: $${snapshot.metrics.presupuesto_diario.disponible_hoy}
    - Ingresos del Mes: $${snapshot.metrics.ingresos_mes.toLocaleString('es-MX')} | Gastos del Mes: $${snapshot.metrics.gastos_mes.toLocaleString('es-MX')}
    - Meta Libertad Financiera: $${snapshot.financialGoal.target_amount.toLocaleString('es-MX')} a la edad de ${snapshot.financialGoal.target_age} años.

    DEUDAS ACTIVAS:
    ${JSON.stringify(snapshot.debts)}

    INVERSIONES ACTUALES:
    ${JSON.stringify(snapshot.investments)}

    COMPRAS A MESES SIN INTERESES (MSI):
    ${JSON.stringify(snapshot.msiPlans)}

    REGLAS ESTRICTAS DE RESPUESTA:
    1. Sé direct@ y directo al grano. Brinda recomendaciones prácticas.
    2. Prioriza saldar deudas de ALTO INTERÉS antes de sugerir inversiones especulativas.
    3. Si el usuario tiene excedentes de liquidez y sus deudas están bajo control, recomienda opciones de inversión acordes al nivel de riesgo.
    4. PUEDES recomendar mover dinero entre inversiones o cuentas, pero ACLARA SIEMPRE que nunca ejecutas operaciones automáticamente (el usuario debe autorizar en la app).
    5. Usa viñetas breves y números claros.
  `;

  if (!apiKey) {
    // Intelligent fallback rule-based response when offline or no API key
    let advice = `Basado en tu liquidez de **$${snapshot.metrics.disponible_hoy.toLocaleString('es-MX')}** y Riqueza Neta de **$${snapshot.metrics.riqueza_neta.toLocaleString('es-MX')}**:\n\n`;

    if (snapshot.debts.length > 0) {
      const highestDebt = snapshot.debts.reduce((max, d) => d.interest_rate > max.interest_rate ? d : max, snapshot.debts[0]);
      advice += `1. 🔥 **Prioridad Alta (Deuda)**: Enfócate en liquidar **${highestDebt.name}** (tasa del **${highestDebt.interest_rate}%**). Abonar $${(highestDebt.payment_amount * 1.5).toFixed(0)} extras reducirá drásticamente tu costo financiero.\n`;
    } else {
      advice += `1. ✅ **Cero Deudas**: Mantienes tus compromisos bajo control. Buen momento para aumentar tus aportaciones de inversión.\n`;
    }

    if (snapshot.metrics.disponible_hoy > 10000) {
      advice += `2. 📈 **Oportunidad de Inversión**: Cuentas con liquidez sobrante. Considera mover un porcentaje a instrumentos de bajo riesgo como CETES o Sofipos para proteger tu dinero de la inflación.\n`;
    }

    advice += `3. 🎯 **Libertad Financiera**: Estás en ruta a tu meta de **$${snapshot.financialGoal.target_amount.toLocaleString('es-MX')}** a los **${snapshot.financialGoal.target_age} años**.`;

    return { reply: advice, snapshot };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const fullPrompt = `${systemContext}\n\nPregunta del Usuario: "${userMessage}"`;
    const result = await model.generateContent(fullPrompt);
    const reply = result.response.text();

    return { reply, snapshot };
  } catch (error) {
    console.error('Error al generar respuesta del Coach:', error.message);
    return {
      reply: `Hola. He revisado tus números: cuentas con $${snapshot.metrics.disponible_hoy.toLocaleString('es-MX')} disponibles y una salud financiera de ${snapshot.metrics.salud_financiera.score}/100. Prioriza amortizar tus deudas con mayor tasa de interés este mes.`,
      snapshot
    };
  }
}

/**
 * Returns structured prioritized action cards for the Coach screen
 */
async function getCoachRecommendations() {
  const snapshot = await getFinancialSnapshot();
  const recs = [];

  // High priority: High interest debt
  if (snapshot.debts.length > 0) {
    const sortedDebts = [...snapshot.debts].sort((a, b) => b.interest_rate - a.interest_rate);
    const topDebt = sortedDebts[0];
    recs.push({
      id: 1,
      priority: 'high',
      title: `Acelerar pago de ${topDebt.name}`,
      category: 'Deuda',
      action: `Abona $${(topDebt.payment_amount * 1.25).toFixed(0)} adicionales este mes para disminuir el interés del ${topDebt.interest_rate}%.`,
      impact: 'Ahorro directo en intereses acumulados'
    });
  }

  // Medium priority: Emergency fund or Investment surplus
  if (snapshot.metrics.disponible_hoy > 15000) {
    recs.push({
      id: 2,
      priority: 'medium',
      title: 'Transferir excedente de liquidez a Inversiones',
      category: 'Inversión',
      action: `Tienes $${snapshot.metrics.disponible_hoy.toLocaleString()} disponibles en cuenta. Destina $5,000 a CETES o instrumentos con disponibilidad inmediata.`,
      impact: 'Generación de rendimiento pasivo diario'
    });
  } else {
    recs.push({
      id: 2,
      priority: 'medium',
      title: 'Consolidar Fondo de Emergencia',
      category: 'Liquidez',
      action: 'Mantén al menos 1 mes de gastos fijos ($10,000) en tu cuenta de débito para imprevistos.',
      impact: 'Protección contra imprevistos sin endeudarte'
    });
  }

  // Freedom Goal Progress
  recs.push({
    id: 3,
    priority: 'low',
    title: `Avanzar hacia la Libertad Financiera (${snapshot.financialGoal.target_age} años)`,
    category: 'Meta',
    action: `Patrimonio actual de $${snapshot.metrics.riqueza_neta.toLocaleString()} frente a la meta de $${snapshot.financialGoal.target_amount.toLocaleString()}.`,
    impact: 'Alineación con tu meta de retiro'
  });

  return recs;
}

module.exports = {
  getFinancialSnapshot,
  generateCoachChatResponse,
  getCoachRecommendations
};
