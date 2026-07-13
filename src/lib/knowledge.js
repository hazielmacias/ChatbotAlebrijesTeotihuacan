const escuelaFlow = require('../bot/flows/escuela.json');
const tdpFlow = require('../bot/flows/tdp.json');
const veranoFlow = require('../bot/flows/verano.json');
const faqFlow = require('../bot/flows/faq.json');
const menuFlow = require('../bot/flows/menu.json');

module.exports = {
  academia: {
    nombre: 'Alebrijes Teotihuacan',
    sede: 'Centro Recreativo Pascual Boing, Teotihuacan, Estado de Mexico',
    ubicacion_url: 'https://maps.app.goo.gl/nXnXtADvzofWVusk9',
    contacto: {
      nombre: 'Prof. Haziel Alejandro',
      telefono: '55 2529 5501',
      whatsapp: 'https://wa.me/525525295501'
    }
  },
  menu: [
    { numero: 1, nombre: 'Escuela de Futbol - Centro de Iniciacion Deportiva', publico: 'Ninos de 6 a 11 anos' },
    { numero: 2, nombre: 'Fuerzas Basicas - TDP', publico: 'Jovenes de 12 a 18 anos' },
    { numero: 3, nombre: 'Equipo Piloto - Liga de Expansion MX', publico: 'Nacidos entre 2002 y 2004' },
    { numero: 4, nombre: 'Curso de Verano' },
    { numero: 5, nombre: 'Preguntas Frecuentes' }
  ],
  escuela: {
    nombre: 'Centro de Iniciacion Deportiva (Escuela)',
    publico: 'Ninos de 6 a 11 anos',
    inscripcion: '$0 MXN (Gratis)',
    mensualidad: '$550 MXN',
    horarios: [
      { id: 'A', nombre: 'Matutino (Alto Rendimiento)', dias: 'Lunes a Viernes', hora: '08:00 a 10:30 hrs.' }
    ],
    info: 'Incluye entrenamiento con metodologia, partidos internos y acceso a las instalaciones. Se entrega Pase de Semana de Prueba sin costo para probar antes de inscribirte formalmente.'
  },
  tdp: {
    nombre: 'Fuerzas Basicas y Tercera Division Profesional (TDP)',
    publico: 'Jovenes de 12 a 18 anos (nacidos entre 2002 y 2012)',
    proceso: 'Semana de pruebas sin costo',
    info: 'Entrena y juega durante una semana con el equipo de Tercera Division Profesional. Se entrega Pase con el nombre del jugador. Evaluacion por staff de visores e inteligencia deportiva.',
    duracion: '1 semana',
    incluye: [
      '(Opcional) Seguro contra accidentes y lesiones deportivas con vigencia de un mes',
      'Hidratacion en todas las sesiones',
      'Fisioterapeutas en cancha',
      'Canchas empastadas',
      'Partidos vs equipos TDP y Fuerzas Basicas',
      'Evaluacion tecnica de inteligencia deportiva',
      'Seguridad privada'
    ]
  },
  piloto: {
    nombre: 'Equipo Piloto - Liga de Expansion MX',
    publico: 'Jovenes nacidos entre 2002 y 2004',
    proceso: 'Semana de pruebas sin costo',
    info: 'Mismo proceso que TDP pero para visorias de la Liga de Expansion MX. Entrena y juega una semana con el equipo profesional.'
  },
  verano: {
    nombre: 'Curso de Verano',
    publico: 'Abierto a todas las edades',
    inscripcion: '$850 MXN (Pago unico, sin mensualidades)',
    horarios: [
      { dias: 'Lunes a Viernes', hora: '08:30 a 10:30 hrs.' },
      { dias: 'Sabados', hora: 'Juego' }
    ],
    incluye: [
      'Seguro contra accidentes y lesiones deportivas',
      'Hidratacion en cancha',
      'Uniforme de entrenamiento',
      'Atencion en cancha con fisioterapeuta',
      'Canchas totalmente empastadas',
      'Partidos amistosos con otros equipos',
      'Entrenadores certificados'
    ]
  },
  faq: {
    horarios_ubicacion: 'Estamos en el Centro Recreativo Pascual Boing, Teotihuacan, EdoMex. Escuela: solo turno matutino L-V 08:00-10:30 hrs. TDP/Piloto: la fecha la da el asesor. Curso de Verano: L-V 08:30-10:30 + Sabados de juego.',
    requisitos_pase: 'Para el Pase de Semana de Prueba solo necesitas presentarte con: imagen del pase (en tu celular o impresa), ropa blanca, zapatos de futbol e hidratacion propia.',
    requisitos_formales: 'Para la inscripcion formal se piden: acta de nacimiento, CURP del jugador y tutor, comprobante de domicilio y certificado medico reciente.',
    edades_categorias: 'Escuela: 6-11 anos. TDP: 12-18 anos (nacidos 2002-2012). Piloto: nacidos 2002-2004. Curso de Verano: cualquier edad.',
    que_traer: 'Ropa deportiva comoda (preferentemente blanca), zapatos de futbol (tacos), hidratacion propia. El club proporciona balones, petos y staff tecnico.'
  }
};
