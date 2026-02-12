const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5001;

// Inicialización de Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// CONEXIÓN BASE DE DATOS (Forzando IPv4 para estabilidad en Render)
const clientOptions = {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
  family: 4, 
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

// Rate limiting para evitar Spam
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 5, 
  message: 'Demasiados intentos. Intenta más tarde.'
});

// --- MODELOS DE DATOS ---
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  subject: String,
  message: String,
  date: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now }
});
const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// --- RUTAS ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', dbState: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected' });
});

// Ruta de Contacto (MongoDB + Resend)
app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'Todos los campos son requeridos' });
    }

    // 1. Guardar en MongoDB
    const newContact = new Contact({ name, email, subject, message });
    await newContact.save();
    console.log(`💾 Contacto guardado en BD: ${email}`);
    
    // 2. Enviar Email vía Resend usando tu nuevo dominio
    await resend.emails.send({
      from: 'Portfolio <contacto@juliomunoz.dev>', // Tu dominio profesional
      to: 'julio.mun.cor@gmail.com', 
      replyTo: email,
      subject: `🚀 Nuevo Mensaje: ${subject}`,
      html: `
        <h3>Tienes un nuevo mensaje de contacto</h3>
        <p><strong>Nombre:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Asunto:</strong> ${subject}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${message}</p>
      `
    });

    console.log('📧 Notificación enviada exitosamente');
    res.json({ success: true, message: '¡Mensaje recibido! Te contactaré pronto.' });

  } catch (error) {
    console.error('❌ Error en /api/contact:', error.message);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
});

// Ruta de Suscripción
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Email inválido' });
    }

    const existingSubscriber = await Subscriber.findOne({ email });
    if (existingSubscriber) {
      return res.status(400).json({ success: false, message: 'Este email ya está suscrito.' });
    }

    const newSubscriber = new Subscriber({ email });
    await newSubscriber.save();

    console.log(`✅ Nuevo suscriptor: ${email}`);
    res.json({ success: true, message: '¡Gracias por suscribirte!' });
  } catch (error) {
    console.error('❌ Error suscripción:', error.message);
    res.status(500).json({ success: false, message: 'Error interno.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en puerto ${PORT}`);
});