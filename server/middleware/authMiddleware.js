const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mis_finanzas_v2_secret_key_2026';

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado. Inicie sesión para continuar.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sesión expirada o token inválido. Inicie sesión nuevamente.' });
  }
}

module.exports = {
  requireAuth,
  JWT_SECRET
};
