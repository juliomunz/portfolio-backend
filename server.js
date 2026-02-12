const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5001;

// CONEXIÓN BASE DE DATOS (Estable y compatible IPv4) 
const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
  family: 4, // Fuerza uso de IPv4
};

console.log("⏳ Conectando a MongoDB...");

mongoose.connect(process.env.MONGODB_URI, clientOptions)
  .then(() => console.log('🍃 MongoDB Conectado Exitosamente'))
  .catch(err => console.error('❌ Error fatal de conexión a MongoDB:', err.message));

// MIDDLEWARE
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: 'Demasiados intentos. Intenta más tarde.'
});

// Configurar Email
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false,
    ciphers: 'SSLv3'
  },
  logger: true,
  debug: true,
  connectionTimeout: 10000,
});

console.log("🕵️‍♂️ Probando conexión SMTP con Gmail...");

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ ERROR CRÍTICO SMTP (Al iniciar):", error);
  } else {
    console.log("✅ CONEXIÓN SMTP EXITOSA: El servidor está listo para enviar correos.");
  }
});

// Esquema de Datos
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  subject: String,
  message: String,
  date: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', contactSchema);

// Esquema para Suscriptores
const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now }
});

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// --- RUTAS ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', dbState: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected' });
});

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validación simple
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
    }

    // 1. Guardar en Base de Datos
    console.log('💾 [2/4] Guardando en MongoDB...');
    const newContact = new Contact({ name, email, subject, message });
    await newContact.save();
    console.log('✅ [2/4] Guardado en MongoDB OK');
    
    // 2. Preparar Emails
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER, 
      replyTo: email,
      subject: `[Portfolio] ${subject}`,
      html: `
        <h3>Nuevo Mensaje de ${name}</h3>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Asunto:</strong> ${subject}</p>
        <hr>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `
    };

    const confirmationMail = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Recibí tu mensaje - Julio Muñoz',
      html: `
        <h3>¡Hola ${name}!</h3>
        <p>Gracias por escribirme. He recibido tu mensaje correctamente.</p>
        <p>Te responderé pronto a este correo.</p>
        <br><p>Saludos,<br>Julio Muñoz</p>
      `
    };

    console.log('📤 [3/4] Intentando conectar con Gmail para enviar correos...');

    // 3. Enviar Emails (En paralelo para más velocidad)
    await Promise.all([
      transporter.sendMail(mailOptions),
      transporter.sendMail(confirmationMail)
    ]);

    console.log(`✅ Nuevo contacto procesado: ${email}`);
    
    res.json({ success: true, message: 'Mensaje enviado y guardado correctamente' });

  } catch (error) {
    console.error('❌ Error procesando contacto:', error.message);
    res.status(500).json({ success: false, message: 'Error interno al procesar tu mensaje.' });
  }
});

// Ruta para Suscripción al Newsletter
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

    // Validación simple de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Email inválido' });
    }

    // Verificar si ya existe
    const existingSubscriber = await Subscriber.findOne({ email });
    if (existingSubscriber) {
      return res.status(400).json({ success: false, message: 'Este email ya está suscrito.' });
    }

    // Guardar en BD
    const newSubscriber = new Subscriber({ email });
    await newSubscriber.save();

    console.log(`✅ Nuevo suscriptor: ${email}`);
    res.json({ success: true, message: '¡Gracias por suscribirte!' });

  } catch (error) {
    console.error('❌ Error suscripción:', error.message);
    res.status(500).json({ success: false, message: 'Error interno.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en puerto ${PORT}`);
});