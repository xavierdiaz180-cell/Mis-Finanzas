const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet } = require('../database');
const { JWT_SECRET } = require('../middleware/authMiddleware');

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Proporcione correo y contraseña.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await dbGet('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    
    if (!user) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Error en authController.login:', error);
    return res.status(500).json({ error: 'Error interno al procesar el inicio de sesión.' });
  }
}

async function me(req, res) {
  try {
    const user = await dbGet('SELECT id, email, name, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    return res.json({ success: true, user });
  } catch (error) {
    console.error('Error en authController.me:', error);
    return res.status(500).json({ error: 'Error al verificar sesión.' });
  }
}

module.exports = {
  login,
  me
};
