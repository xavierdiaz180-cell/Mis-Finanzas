const { initDatabase, pool } = require('../database');
const { login } = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');

async function runAuthTests() {
  console.log('\n======================================================');
  console.log('🧪 INICIANDO PRUEBAS DE AUTENTICACIÓN Y LOGIN');
  console.log('======================================================\n');

  await initDatabase();

  // Test 1: Successful Login
  console.log('📌 AUTH-001: Inicio de sesión exitoso con credenciales correctas');
  const req1 = { body: { email: 'xavierdiaz1@live.com.mx', password: 'Hola.321' } };
  let result1 = null;
  const res1 = {
    status: function(code) { this.statusCode = code; return this; },
    json: function(payload) { result1 = payload; return this; }
  };
  await login(req1, res1);

  if (result1 && result1.success && result1.token && result1.user?.email === 'xavierdiaz1@live.com.mx') {
    console.log('  ✅ PASÓ [AUTH-001]: Token JWT expedido exitosamente para xavierdiaz1@live.com.mx');
  } else {
    throw new Error(`[AUTH-001] Falla en login: ${JSON.stringify(result1)}`);
  }

  const validToken = result1.token;

  // Test 2: Invalid Password
  console.log('📌 AUTH-002: Rechazo de contraseña incorrecta');
  const req2 = { body: { email: 'xavierdiaz1@live.com.mx', password: 'PasswordErróneo' } };
  let result2 = null;
  let code2 = 200;
  const res2 = {
    status: function(code) { code2 = code; return this; },
    json: function(payload) { result2 = payload; return this; }
  };
  await login(req2, res2);

  if (code2 === 401 && result2 && result2.error) {
    console.log('  ✅ PASÓ [AUTH-002]: Contraseña errónea rechazada con HTTP 401');
  } else {
    throw new Error(`[AUTH-002] Falla en rechazo de contraseña: Code=${code2}, Payload=${JSON.stringify(result2)}`);
  }

  // Test 3: Middleware requireAuth without Token
  console.log('📌 AUTH-003: Bloqueo de rutas protegidas sin token Authorization');
  const req3 = { headers: {} };
  let code3 = 200;
  let result3 = null;
  const res3 = {
    status: function(code) { code3 = code; return this; },
    json: function(payload) { result3 = payload; return this; }
  };
  let nextCalled3 = false;
  requireAuth(req3, res3, () => { nextCalled3 = true; });

  if (code3 === 401 && !nextCalled3) {
    console.log('  ✅ PASÓ [AUTH-003]: Petición sin token bloqueada con HTTP 401');
  } else {
    throw new Error('[AUTH-003] Falla en middleware de autenticación sin token');
  }

  // Test 4: Middleware requireAuth with Valid Token
  console.log('📌 AUTH-004: Acceso concedido a rutas protegidas con Token JWT válido');
  const req4 = { headers: { authorization: `Bearer ${validToken}` } };
  let nextCalled4 = false;
  const res4 = {};
  requireAuth(req4, res4, () => { nextCalled4 = true; });

  if (nextCalled4 && req4.user && req4.user.email === 'xavierdiaz1@live.com.mx') {
    console.log('  ✅ PASÓ [AUTH-004]: Acceso concedido y usuario adjuntado en req.user');
  } else {
    throw new Error('[AUTH-004] Falla en validación de token JWT legítimo');
  }

  console.log('\n======================================================');
  console.log('📊 RESULTADO FINAL PRUEBAS DE AUTH: 100% PASS');
  console.log('======================================================\n');
}

if (require.main === module) {
  runAuthTests()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runAuthTests };
