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
  const modelName = (modelRow && modelRow.value) ? modelRow.value : 'gemini-3.6-flash';

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
 * Generates an in-depth AI financial analysis using Gemini
 */
async function generateDeepAnalysis() {
  const snapshot = await getFinancialSnapshot();
  const { getFullAnalysisData } = require('./analysisService');
  const fullAnalysis = await getFullAnalysisData();
  const recentTransactions = await dbAll('SELECT date, type, amount, category, concept FROM transactions ORDER BY date DESC LIMIT 20');

  const keyRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_api_key'");
  const modelRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_model'");
  const apiKey = (keyRow && keyRow.value) ? keyRow.value : process.env.GEMINI_API_KEY;
  const modelName = (modelRow && modelRow.value) ? modelRow.value : 'gemini-3.6-flash';

  const contextData = {
    metrica_disponible_hoy: snapshot.metrics.disponible_hoy,
    riqueza_neta: snapshot.metrics.riqueza_neta,
    salud_financiera: snapshot.metrics.salud_financiera,
    presupuesto_diario: snapshot.metrics.presupuesto_diario,
    cuentas: snapshot.accounts,
    deudas: snapshot.debts,
    inversiones: snapshot.investments,
    meses_sin_intereses: snapshot.msiPlans,
    meta_libertad: snapshot.financialGoal,
    tendencias_mensuales: fullAnalysis.monthly_trends,
    gastos_por_categoria: fullAnalysis.categories_breakdown,
    capacidad_ahorro: fullAnalysis.savings_capacity,
    proyeccion_30_dias: fullAnalysis.forecast_30_days,
    ultimas_transacciones: recentTransactions
  };

  const fallbackAnalysis = {
    diagnostico: {
      resumen: `Tienes un disponible de $${snapshot.metrics.disponible_hoy.toLocaleString('es-MX')} y un patrimonio neto de $${snapshot.metrics.riqueza_neta.toLocaleString('es-MX')}. Tu calificación de salud es ${snapshot.metrics.salud_financiera.score}/100.`,
      puntos_fuertes: [
        snapshot.metrics.disponible_hoy > 0 ? 'Liquidez inmediata positiva en tus cuentas principales' : 'Registro activo de cuentas',
        snapshot.debts.length === 0 ? 'Sin deudas registradas' : 'Seguimiento constante de compromisos'
      ],
      puntos_mejora: [
        snapshot.debts.length > 0 ? 'Reducir el saldo deudor total para disminuir carga de intereses' : 'Incrementar aportaciones de inversión',
        'Establecer un presupuesto mensual estricto por categorías'
      ]
    },
    estrategia_deudas: {
      titulo: snapshot.debts.length > 0 ? 'Método Avalancha (Priorizar alto interés)' : 'Mantener cero deudas',
      recomendacion: snapshot.debts.length > 0
        ? `Consolida o liquida primero las deudas con mayor tasa de interés. Actualmente tu mayor compromiso es ${snapshot.debts[0]?.name || 'tarjeta'}.`
        : 'Excelente manejo de crédito. Continúa usando tarjetas solo para aprovechar beneficios o MSI sin saturar capacidad de pago.',
      orden_pago: snapshot.debts.map(d => `${d.name} - Saldo: $${d.current_balance?.toLocaleString('es-MX')} (Tasa: ${d.interest_rate}%)`),
      ahorro_estimado: snapshot.debts.length > 0 ? 'Hasta 25% en intereses abonando 15% extra al pago mínimo.' : 'N/A'
    },
    estrategia_inversion: {
      titulo: 'Plan de Crecimiento del Patrimonio',
      recomendacion: snapshot.metrics.disponible_hoy > 10000
        ? 'Aprovecha el capital disponible manteniendo 1-2 meses de gastos en liquidez y el resto en instrumentos de bajo riesgo.'
        : 'Construye primero tu fondo de emergencia de al menos $15,000 en débito/fondo líquido antes de buscar rendimientos a plazo.',
      distribucion_sugerida: [
        { instrumento: 'Fondo de Emergencia (Débito/CETES 28d)', porcentaje: 40 },
        { instrumento: 'Renta Fija / Sofipos (Bajo riesgo)', porcentaje: 40 },
        { instrumento: 'Renta Variable / ETFs (Mediano/Largo plazo)', porcentaje: 20 }
      ]
    },
    plan_accion: {
      dias_30: [
        'Revisar suscripciones y gastos recurrentes prescindibles',
        snapshot.debts.length > 0 ? 'Abonar $500 extras al capital de la deuda principal' : 'Destinar $1,000 a inversión fija'
      ],
      dias_60: [
        'Evaluar la tasa de ahorro del mes y ajustar presupuesto diario',
        'Consolidar el fondo de imprevistos'
      ],
      dias_90: [
        'Revisar avance hacia la meta de Libertad Financiera',
        'Automatizar transferencias de ahorro a inversión'
      ]
    },
    libertad_financiera: {
      analisis: `Tu meta es acumular $${snapshot.financialGoal.target_amount.toLocaleString('es-MX')} para los ${snapshot.financialGoal.target_age} años.`,
      ritmo_actual: snapshot.metrics.riqueza_neta > 0 ? 'En marcha inicial' : 'Requiere impulsar el nivel de ahorro mensual',
      ajuste_sugerido: 'Incrementar el ahorro mensual en un 10% adicional respecto a tus ingresos promedio.'
    },
    alertas: [
      snapshot.debts.length > 0 ? { tipo: 'warning', mensaje: 'Tienes deudas activas. Evita contraer nuevos planes a MSI hasta liquidarlas.' } : { tipo: 'info', mensaje: 'Mantén bajo control tus tarjetas de crédito.' },
      snapshot.metrics.disponible_hoy < 5000 ? { tipo: 'danger', mensaje: 'Tu liquidez disponible es reducida. Prioriza acumular reserva de emergencias.' } : { tipo: 'info', mensaje: 'Nivel de liquidez saludable.' }
    ]
  };

  if (!apiKey) {
    return fallbackAnalysis;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
      Eres el Asesor y Estratega Financiero Principal de "Mis Finanzas".
      Analiza detalladamente el estado financiero del usuario y proporciona un informe estratégico profundo en formato JSON ESTRICTO.

      DATOS FINANCIEROS COMPLETOS DEL USUARIO:
      ${JSON.stringify(contextData, null, 2)}

      DEBES RESPONDER ÚNICAMENTE UN OBJETO JSON CON LA SIGUIENTE ESTRUCTURA EXACTA (sin markdown adicional fuera del JSON):

      {
        "diagnostico": {
          "resumen": "Explicación clara y detallada de su situación actual en 2-3 oraciones",
          "puntos_fuertes": ["Punto fuerte 1", "Punto fuerte 2"],
          "puntos_mejora": ["Área de mejora 1", "Área de mejora 2"]
        },
        "estrategia_deudas": {
          "titulo": "Nombre de la estrategia recomendada (ej: Método Avalancha o Bola de Nieve)",
          "recomendacion": "Explicación paso a paso de qué hacer con sus deudas",
          "orden_pago": ["Prioridad 1: Nombre deuda - Razón", "Prioridad 2: ..."],
          "ahorro_estimado": "Estimación del ahorro en tiempo/intereses si sigue el plan"
        },
        "estrategia_inversion": {
          "titulo": "Estrategia de Crecimiento y Conservación de Capital",
          "recomendacion": "Recomendación específica según su liquidez y nivel de riesgo",
          "distribucion_sugerida": [
            { "instrumento": "Nombre instrumento (ej: CETES / Sofipo / ETF)", "porcentaje": 50 }
          ]
        },
        "plan_accion": {
          "dias_30": ["Acción inmediata 1", "Acción inmediata 2"],
          "dias_60": ["Acción mediano plazo 1", "Acción mediano plazo 2"],
          "dias_90": ["Acción consolidación 1", "Acción consolidación 2"]
        },
        "libertad_financiera": {
          "analisis": "Evaluación realista de su meta de retiro a la edad configurada",
          "ritmo_actual": "Evaluación del ritmo (Buena velocidad, Requiere aceleración, etc.)",
          "ajuste_sugerido": "Sugerencia concreta de aportación mensual necesaria"
        },
        "alertas": [
          { "tipo": "danger" | "warning" | "info", "mensaje": "Descripción de la alerta o riesgo detectado" }
        ]
      }
    `;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text();
    
    // Clean JSON response if wrapped in code blocks
    const cleanedJson = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedJson);
    return parsedData;
  } catch (error) {
    console.error('Error al generar Análisis Profundo con Gemini:', error.message);
    return fallbackAnalysis;
  }
}

/**
 * Returns structured prioritized action cards for the Coach screen
 */
async function getCoachRecommendations() {
  const snapshot = await getFinancialSnapshot();

  const keyRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_api_key'");
  const modelRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_model'");
  const apiKey = (keyRow && keyRow.value) ? keyRow.value : process.env.GEMINI_API_KEY;
  const modelName = (modelRow && modelRow.value) ? modelRow.value : 'gemini-1.5-flash';

  if (apiKey) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });

      const prompt = `
        Analiza los siguientes datos financieros y genera exactamente 3 o 4 tarjetas de recomendación personalizadas de alta prioridad.
        DATOS:
        - Liquidez disponible: $${snapshot.metrics.disponible_hoy}
        - Riqueza Neta: $${snapshot.metrics.riqueza_neta}
        - Deudas: ${JSON.stringify(snapshot.debts)}
        - Inversiones: ${JSON.stringify(snapshot.investments)}
        - MSI: ${JSON.stringify(snapshot.msiPlans)}
        - Meta: $${snapshot.financialGoal.target_amount} a los ${snapshot.financialGoal.target_age} años.

        Responde ÚNICAMENTE en JSON ESTRICTO con una lista de objetos:
        [
          {
            "id": 1,
            "priority": "high" | "medium" | "low",
            "title": "Título corto y directo",
            "category": "Deuda" | "Inversión" | "Liquidez" | "Ahorro" | "Meta",
            "action": "Acción cuantitativa y concreta que debe tomar el usuario",
            "impact": "Beneficio o impacto esperado"
          }
        ]
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      const recs = JSON.parse(text);
      if (Array.isArray(recs) && recs.length > 0) return recs;
    } catch (e) {
      console.warn('Fallback a recomendaciones estáticas por error en Gemini:', e.message);
    }
  }

  // Fallback rule-based recommendations if no API key or error
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
  getCoachRecommendations,
  generateDeepAnalysis
};

