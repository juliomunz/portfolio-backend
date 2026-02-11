const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
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
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
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
    const newContact = new Contact({ name, email, subject, message });
    await newContact.save();
    
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

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en puerto ${PORT}`);
});