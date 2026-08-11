const { GoogleGenerativeAI } = require('@google/generative-ai');
const { dbGet, dbAll } = require('../database');

/**
 * Helper to get configured Gemini API key and model name
 */
async function getGeminiConfig() {
  const keyRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_api_key'");
  const modelRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_model'");
  
  const apiKey = (keyRow && keyRow.value) ? keyRow.value : process.env.GEMINI_API_KEY;
  let modelName = (modelRow && modelRow.value) ? modelRow.value : 'gemini-3.6-flash';
  if (!modelName || modelName.includes('1.5') || modelName.includes('2.0') || modelName.includes('2.5')) {
    modelName = 'gemini-3.6-flash';
  }

  return { apiKey, modelName };
}



function getLocalDateString(dateObj = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(dateObj);
}

/**
 * Fallback parser for voice dictation when offline or no API key provided
 */
function fallbackVoiceParser(text, categories, accounts) {
  const lower = text.toLowerCase();
  const amountMatch = lower.match(/(\d+(\.\d+)?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : null;

  let category = 'Otros';
  let concept = text;

  if (lower.includes('gasolina') || lower.includes('gasolinera')) {
    category = 'Transporte';
    concept = 'Gasolina';
  } else if (lower.includes('super') || lower.includes('despensa') || lower.includes('comida')) {
    category = 'Alimentación';
    concept = 'Alimentos / Supermercado';
  } else if (lower.includes('luz') || lower.includes('agua') || lower.includes('internet')) {
    category = 'Servicios';
    concept = 'Pago de Servicios';
  }

  let matchedAccount = accounts.find(a => lower.includes(a.name.toLowerCase())) || accounts[0] || null;

  const missingFields = [];
  if (!amount) missingFields.push('monto');
  if (!matchedAccount) missingFields.push('cuenta');
  if (!concept) missingFields.push('concepto');
  if (!category) missingFields.push('categoría');

  const todayStr = getLocalDateString();
  return {
    type: lower.includes('ingreso') || lower.includes('nómina') ? 'income' : 'expense',
    amount: amount || 0,
    concept: concept,
    category: category,
    account_id: matchedAccount ? matchedAccount.id : null,
    account_name: matchedAccount ? matchedAccount.name : '',
    date: todayStr,
    missing_fields: missingFields,
    source: 'voice_parsed'
  };
}

/**
 * Parses natural language voice dictation into structured JSON using Gemini API
 */
async function parseVoiceDictation(text, categories, accounts) {
  const { apiKey, modelName } = await getGeminiConfig();

  if (!apiKey) {
    console.log('No GEMINI_API_KEY configured. Using smart rule-based voice parser.');
    return fallbackVoiceParser(text, categories, accounts);
  }

  const candidateModels = Array.from(new Set([modelName, 'gemini-3.6-flash', 'gemini-3.5-flash-lite']));
  const genAI = new GoogleGenerativeAI(apiKey);
  const todayStr = getLocalDateString();

  const prompt = `
    Eres el intérprete financiero de la aplicación "Mis Finanzas".
    Analiza la siguiente frase dictada por el usuario: "${text}".

    FECHA DE HOY: "${todayStr}".
    Si la frase del usuario no especifica una fecha explícita (como "ayer" o "el 15 de marzo"), asigna SIEMPRE "date": "${todayStr}".

    Catálogo de Cuentas del usuario:
    ${JSON.stringify(accounts.map(a => ({ id: a.id, name: a.name, type: a.type })))}

    Catálogo de Categorías válidas:
    ${JSON.stringify(categories)}

    Responde ÚNICAMENTE con un objeto JSON válido (sin código markdown extra) con la siguiente estructura:
    {
      "type": "expense" | "income" | "payment",
      "amount": número o 0 si falta,
      "concept": "descripción breve del gasto/ingreso",
      "category": "categoría correspondiente del catálogo o 'Otros'",
      "account_id": id_de_la_cuenta_coincidente o null si falta,
      "account_name": "nombre de la cuenta coincidente o vacía",
      "date": "YYYY-MM-DD",
      "missing_fields": ["monto", "cuenta", "concepto", "categoría"]
    }
  `;

  for (const curModel of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: curModel });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const cleanJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJsonText);
    } catch (error) {
      console.warn(`⚠️ Dictado de voz modelo ${curModel} falló:`, error.message.substring(0, 100));
    }
  }

  console.error('Todos los modelos Gemini fallaron para dictado de voz, usando fallback.');
  return fallbackVoiceParser(text, categories, accounts);

}

/**
 * Fallback parser for simulated document scanning when offline or no API key provided
 */
function fallbackDocumentScanner(docType, referenceName) {
  const today = new Date().toISOString().split('T')[0];
  if (docType === 'credit_card') {
    return {
      type: 'credit_card',
      reference: referenceName || 'Estado de Cuenta Tarjeta',
      total_balance: 14500.00,
      available_credit: 25500.00,
      cutoff_date: '2026-08-15',
      due_date: '2026-09-05',
      minimum_payment: 1200.00,
      interest_rate: 42.5,
      msi_plans: [
        { concept: 'Laptop Oficina', monthly_amount: 1500, remaining_installments: 6 }
      ],
      extracted_at: today
    };
  } else if (docType === 'payroll') {
    return {
      type: 'payroll',
      reference: referenceName || 'Recibo de Nómina',
      deposit_amount: 18500.00,
      payroll_loans_deduction: 1200.00,
      employer: 'Empresa Tecnológica S.A.',
      date: today,
      extracted_at: today
    };
  } else {
    return {
      type: 'receipt',
      reference: referenceName || 'Recibo de Servicio',
      vendor: 'Comisión Federal de Electricidad (CFE)',
      concept: 'Luz y Energía Eléctrica',
      amount: 680.00,
      frequency: 'bimonthly',
      due_date: '2026-08-30',
      extracted_at: today
    };
  }
}

/**
 * Analyzes uploaded documents (credit card statements, payroll stubs, receipts) using Gemini Vision
 */
async function analyzeDocument(fileBuffer, mimeType, docType, referenceName, existingData) {
  const { apiKey, modelName } = await getGeminiConfig();

  let geminiError = null;
  let extractedData;

  if (!apiKey || !fileBuffer) {
    const reason = !apiKey ? 'No hay clave API de Gemini configurada en la base de datos.' : 'No se recibió ningún archivo para escanear.';
    console.log('Fallback:', reason);
    geminiError = reason;
    extractedData = fallbackDocumentScanner(docType, referenceName);
  } else {
    const candidateModels = Array.from(new Set([modelName, 'gemini-3.6-flash', 'gemini-3.5-flash-lite']));
    let lastError = null;
    const genAI = new GoogleGenerativeAI(apiKey);

    const imagePart = {
      inlineData: {
        data: fileBuffer.toString('base64'),
        mimeType: mimeType || 'image/png'
      }
    };

    const prompt = `
      Eres un extractor especializado en estados de cuenta bancarios mexicanos.
      Analiza la imagen del documento adjunto (tipo: ${docType}) y extrae exactamente los datos indicados.

      === REGLAS ESTRICTAS PARA credit_card (estado de cuenta tarjeta de crédito) ===
      - "total_balance": El campo "Pago para no generar intereses" o "Saldo total" o "Pago requerido este periodo". Es el monto total que debes pagar para no generar intereses. NO confundir con "Adeudo del periodo anterior".
      - "minimum_payment": El campo "Pago mínimo" exacto. Suele ser el monto más pequeño requerido.
      - "cutoff_date": La "Fecha de corte" en formato YYYY-MM-DD.
      - "due_date": La "Fecha límite de pago" en formato YYYY-MM-DD. NO confundir con fecha de corte.
      - "available_credit": El "Crédito disponible" si aparece. Si no, déjalo en 0.
      - "interest_rate": La "Tasa de interés anual variable" o "CAT" como número (ej: 68.51 para 68.51%). NO es un valor en pesos.
      - "msi_plans": Array de cargos a meses sin intereses. Cada elemento: { "concept": "...", "monthly_amount": 0, "remaining_installments": 0 }. Array vacío si no hay MSI.

      === REGLAS PARA payroll (recibo de nómina) ===
      - "deposit_amount": El monto neto depositado / "Importe neto a pagar"
      - "payroll_loans_deduction": Descuentos por préstamos de nómina, si aplica
      - "employer": Nombre de la empresa empleadora
      - "date": Fecha del recibo en formato YYYY-MM-DD

      === REGLAS PARA receipt (recibo de servicio) ===
      - "vendor": Nombre del proveedor (CFE, Telmex, etc.)
      - "concept": Descripción del servicio
      - "amount": Monto total a pagar
      - "frequency": "monthly" | "bimonthly" | "yearly"
      - "due_date": Fecha límite de pago YYYY-MM-DD

      Responde ÚNICAMENTE con JSON válido (sin markdown, sin texto adicional).
      Para credit_card: { "total_balance": 0, "available_credit": 0, "cutoff_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD", "minimum_payment": 0, "interest_rate": 0, "msi_plans": [] }
      Para payroll: { "deposit_amount": 0, "payroll_loans_deduction": 0, "employer": "", "date": "YYYY-MM-DD" }
      Para receipt: { "vendor": "", "concept": "", "amount": 0, "frequency": "monthly", "due_date": "YYYY-MM-DD" }
    `;

    for (const curModel of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: curModel });
        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text().trim();
        const cleanJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        extractedData = JSON.parse(cleanJsonText);
        console.log(`✅ Gemini Vision (${curModel}) extrajo datos correctamente:`, JSON.stringify(extractedData));
        geminiError = null;
        break;
      } catch (err) {
        if (!lastError) lastError = err;
        console.warn(`⚠️ Modelo ${curModel} falló:`, err.message.substring(0, 100));
      }
    }

    if (!extractedData) {
      const msg = lastError ? lastError.message : '';
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('authentication') || msg.includes('API_KEY_INVALID') || msg.includes('ACCESS_TOKEN') || apiKey.startsWith('AQ.')) {
        geminiError = 'La clave de API utilizada (que inicia con AQ...) es un token de Google Cloud Console/OAuth, no una clave de API de Google AI Studio. Para usar Gemini IA, ingresa en Ajustes una clave gratuita creada en aistudio.google.com/app/apikey (debe iniciar con AIzaSy...).';
      } else if (msg.includes('429') || msg.includes('Quota exceeded') || msg.includes('limit: 0')) {
        geminiError = 'La clave API ingresada no tiene cuota disponible. Genera una clave gratuita en Google AI Studio (aistudio.google.com/app/apikey).';
      } else {
        geminiError = lastError ? lastError.message : 'Error al conectar con Gemini.';
      }
      console.error('❌ Todos los modelos Gemini fallaron:', geminiError);
      extractedData = fallbackDocumentScanner(docType, referenceName);
    }
  }




  // Discrepancy Check against existing DB entries
  let discrepancy = false;
  let discrepancyDetails = '';

  if (docType === 'credit_card' && existingData && existingData.current_balance !== undefined) {
    if (Math.abs(existingData.current_balance - extractedData.total_balance) > 1) {
      discrepancy = true;
      discrepancyDetails = `El estado de cuenta muestra un saldo de $${extractedData.total_balance.toLocaleString('es-MX')}, pero el sistema registra $${existingData.current_balance.toLocaleString('es-MX')}.`;
    }
  }

  return {
    docType,
    extractedData,
    discrepancy,
    discrepancyDetails,
    geminiError
  };
}

module.exports = {
  parseVoiceDictation,
  analyzeDocument
};
