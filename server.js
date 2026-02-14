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

// Save Contact Model
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  subject: String,
  message: String,
  date: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

// Save Suscriber Model
const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  date: { type: Date, default: Date.now }
});
const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// Save Like Model
const blogLikeSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 }
});

const BlogLike = mongoose.model('BlogLike', blogLikeSchema);

// RUTAS

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

    // 1. Save in MongoDB
    const newContact = new Contact({ name, email, subject, message });
    await newContact.save();
    console.log(`💾 Contacto guardado en BD: ${email}`);
    
    await Promise.all([
      resend.emails.send({
        from: 'Portfolio <contacto@juliomunoz.dev>',
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
      }),

      // Correo para el CLIENTE (Confirmación automática)
      resend.emails.send({
        from: 'Julio Muñoz <contacto@juliomunoz.dev>',
        to: email, 
        subject: 'Confirmación de recepción - Julio Muñoz',
        html: `
          <h3>¡Hola ${name}!</h3>
          <p>He recibido tu mensaje correctamente respecto a: <strong>"${subject}"</strong>.</p>
          <p>Te agradezco el interés. Revisaré los detalles y me pondré en contacto contigo lo antes posible.</p>
          <br>
          <p>Saludos cordiales,</p>
          <p><strong>Julio Muñoz</strong><br>Software Engineer</p>
        `
      })
    ]);

    console.log('📧 Notificación y confirmación enviadas exitosamente');
    res.json({ success: true, message: '¡Mensaje recibido! Te contactaré pronto.' });

  } catch (error) {
    console.error('❌ Error en /api/contact:', error.message);
    res.status(500).json({ success: false, message: 'Error interno del servidor.' });
  }
});

// Get Likes
app.get('/api/blog/:slug/likes', async (req, res) => {
  try {
    const { slug } = req.params;
    let post = await BlogLike.findOne({ slug });
    
    // Si el post no existe en la BD aún, devolvemos 0
    res.json({ likes: post ? post.count : 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener likes' });
  }
});

// ++ Likes
app.patch('/api/blog/:slug/like', async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Usamos $inc para que MongoDB maneje el incremento de forma atómica
    const updatedPost = await BlogLike.findOneAndUpdate(
      { slug },
      { $inc: { count: 1 } },
      { new: true, upsert: true } // upsert crea el registro si no existe
    );
    
    res.json({ success: true, likes: updatedPost.count });
  } catch (error) {
    res.status(500).json({ message: 'Error al procesar el like' });
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