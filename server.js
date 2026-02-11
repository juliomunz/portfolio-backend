const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting para prevenir spam
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 requests por ventana
  message: 'Demasiados mensajes enviados. Por favor intenta más tarde.'
});

// Configurar transporter de nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail', // o tu servicio de email preferido
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD // Usa App Password si es Gmail
  }
});

// Ruta de health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend funcionando correctamente' });
});

// Ruta para enviar mensajes de contacto
app.post('/api/contact', contactLimiter, async (req, res) => {
  // [LOG 1] Inicio de solicitud
  console.log('📩 Solicitud POST recibida en /api/contact');

  try {
    const { name, email, subject, message } = req.body;

    // [LOG 2] Verificación de datos recibidos
    console.log(`📝 Datos recibidos de: ${name} (${email}) | Asunto: ${subject}`);

    // Validación básica
    if (!name || !email || !subject || !message) {
      console.warn('⚠️ Validación fallida: Faltan campos');
      return res.status(400).json({ 
        success: false, 
        message: 'Todos los campos son requeridos' 
      });
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.warn('⚠️ Validación fallida: Email inválido');
      return res.status(400).json({ 
        success: false, 
        message: 'Email inválido' 
      });
    }

    // Configurar el email para TI (Admin)
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, 
      replyTo: email,
      subject: `[Portfolio] ${subject}`,
      html: `
        <h2>Nuevo mensaje de contacto</h2>
        <p><strong>Nombre:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Asunto:</strong> ${subject}</p>
        <h3>Mensaje:</h3>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <hr>
        <p><small>Enviado desde tu portfolio web</small></p>
      `
    };

    // Email de confirmación al USUARIO
    const confirmationMail = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Gracias por contactarme - Julio Muñoz',
      html: `
        <h2>¡Hola ${name}!</h2>
        <p>Gracias por ponerte en contacto conmigo. He recibido tu mensaje y te responderé lo antes posible.</p>
        <h3>Tu mensaje:</h3>
        <p><strong>Asunto:</strong> ${subject}</p>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <br>
        <p>Saludos,<br>Julio Muñoz</p>
        <hr>
        <p><small>Este es un mensaje automático.</small></p>
      `
    };

    // [LOG 3] Intento de envío
    console.log('📤 Intentando conectar con Gmail...');

    // Enviar emails
    const infoAdmin = await transporter.sendMail(mailOptions);
    console.log('✅ Email al admin enviado. ID:', infoAdmin.messageId);

    const infoUser = await transporter.sendMail(confirmationMail);
    console.log('✅ Confirmación al usuario enviada. ID:', infoUser.messageId);

    res.json({ 
      success: true, 
      message: 'Mensaje enviado correctamente' 
    });

  } catch (error) {
    // [LOG 4] Error detallado
    console.error('❌ ERROR AL ENVIAR EMAIL:', error.message);
    
    // Si Google da detalles técnicos, los mostramos
    if (error.response) {
      console.error('🔍 Detalles SMTP de Google:', error.response);
    }

    res.status(500).json({ 
      success: false, 
      message: 'Error al enviar el mensaje. Por favor intenta nuevamente.',
      debug: error.message // Enviamos el error al frontend para que lo veas
    });
  }
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Ruta no encontrada' 
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Error interno del servidor' 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  
  // Verificación inicial de credenciales
  if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    console.log(`✅ Credenciales cargadas para: ${process.env.EMAIL_USER}`);
    console.log(`🔑 Contraseña cargada (${process.env.EMAIL_PASSWORD.length} caracteres).`);
  } else {
    console.error('❌ ALERTA: No se encontraron credenciales de email en .env');
  }
});
