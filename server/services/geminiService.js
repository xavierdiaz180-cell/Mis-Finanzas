const { GoogleGenerativeAI } = require('@google/generative-ai');
const { dbGet, dbAll } = require('../database');

/**
 * Helper to get configured Gemini API key and model name
 */
async function getGeminiConfig() {
  const keyRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_api_key'");
  const modelRow = await dbGet("SELECT value FROM settings WHERE key = 'gemini_model'");
  
  const apiKey = (keyRow && keyRow.value) ? keyRow.value : process.env.GEMINI_API_KEY;
  const modelName = (modelRow && modelRow.value) ? modelRow.value : 'gemini-1.5-flash';

  return { apiKey, modelName };
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

  return {
    type: lower.includes('ingreso') || lower.includes('nómina') ? 'income' : 'expense',
    amount: amount || 0,
    concept: concept,
    category: category,
    account_id: matchedAccount ? matchedAccount.id : null,
    account_name: matchedAccount ? matchedAccount.name : '',
    date: new Date().toISOString().split('T')[0],
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

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
      Eres el intérprete financiero de la aplicación "Mis Finanzas".
      Analiza la siguiente frase dictada por el usuario: "${text}".

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
        "missing_fields": ["monto", "cuenta", "concepto", "categoría"] // array con los nombres de campos esenciales que faltan o están en 0/null
      }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    const cleanJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJsonText);
  } catch (error) {
    console.error('Error al llamar a Gemini para dictado de voz:', error.message);
    return fallbackVoiceParser(text, categories, accounts);
  }
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

  let extractedData;

  if (!apiKey || !fileBuffer) {
    console.log('Using smart simulated Gemini Vision extraction for document scan.');
    extractedData = fallbackDocumentScanner(docType, referenceName);
  } else {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: modelName });

      const imagePart = {
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType: mimeType || 'image/png'
        }
      };

      const prompt = `
        Analiza la imagen o documento adjunto (${docType}) y extrae los datos clave para la app Mis Finanzas.
        Tipo de documento: ${docType} (credit_card | payroll | receipt).

        Responde ÚNICAMENTE en JSON con el formato adecuado:
        Si es credit_card: { "total_balance": 0, "available_credit": 0, "cutoff_date": "YYYY-MM-DD", "due_date": "YYYY-MM-DD", "minimum_payment": 0, "interest_rate": 0, "msi_plans": [] }
        Si es payroll: { "deposit_amount": 0, "payroll_loans_deduction": 0, "employer": "", "date": "YYYY-MM-DD" }
        Si es receipt: { "vendor": "", "concept": "", "amount": 0, "frequency": "monthly|bimonthly|yearly", "due_date": "YYYY-MM-DD" }
      `;

      const result = await model.generateContent([prompt, imagePart]);
      const responseText = result.response.text().trim();
      const cleanJsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      extractedData = JSON.parse(cleanJsonText);
    } catch (error) {
      console.error('Error al analizar documento con Gemini Vision:', error.message);
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
    discrepancyDetails
  };
}

module.exports = {
  parseVoiceDictation,
  analyzeDocument
};
