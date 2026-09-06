import type { AIModel } from '../lib/types';

export interface UseCase {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  requirements: string[];
  filter: (model: AIModel) => boolean;
  tips: string[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'code-review',
    title: 'AI for Code Review',
    tagline: 'Encuentra bugs, mejora la calidad y aplica buenas prácticas automáticamente',
    description: 'Los modelos de IA pueden revisar tu código en busca de bugs, vulnerabilidades de seguridad, problemas de rendimiento y violaciones de estilo. Los mejores modelos entienden el contexto del proyecto completo y sugieren mejoras específicas.',
    requirements: ['Alta capacidad de razonamiento', 'Contexto largo para repos grandes', 'Comprensión de múltiples lenguajes'],
    filter: (m) => m.category === 'coding' || m.category === 'reasoning',
    tips: [
      'Provee contexto: incluye archivos relacionados, no solo el diff',
      'Pide explicaciones: "explica por qué este código es problemático"',
      'Valida siempre: la IA puede generar falsos positivos',
    ],
  },
  {
    slug: 'customer-support',
    title: 'AI for Customer Support',
    tagline: 'Responde consultas de clientes 24/7 con contexto y empatía',
    description: 'Modelos para soporte al cliente necesitan ser rápidos, empáticos y seguir instrucciones estrictas. Los mejores mantienen conversaciones naturales mientras respetan políticas de la empresa.',
    requirements: ['Baja latencia', 'Capacidad de seguir instrucciones', 'Buen manejo de contexto'],
    filter: (m) => m.category === 'chat' && m.context_window >= 32000,
    tips: [
      'Define un system prompt claro con tono y políticas',
      'Usa function calling para acceder a bases de conocimiento',
      'Incluye historial de conversación para continuidad',
    ],
  },
  {
    slug: 'content-generation',
    title: 'AI for Content Generation',
    tagline: 'Crea artículos, posts, copy y contenido creativo a escala',
    description: 'Modelos para generación de contenido equilibran creatividad, coherencia y adaptabilidad al tono de marca. Soportan múltiples formatos y longitudes.',
    requirements: ['Buena escritura en el idioma objetivo', 'Contexto largo', 'Bajo costo por token'],
    filter: (m) => m.category === 'chat' && m.input_price + m.output_price < 20,
    tips: [
      'Da ejemplos del tono que quieres (few-shot)',
      'Especifica audiencia y formato',
      'Pide variaciones para comparar opciones',
    ],
  },
  {
    slug: 'data-analysis',
    title: 'AI for Data Analysis',
    tagline: 'Analiza datasets, genera queries SQL y encuentra patrones',
    description: 'Los modelos para análisis de datos deben ser buenos en razonamiento lógico, matemáticas y comprensión de esquemas. Idealmente soportan function calling para ejecutar queries.',
    requirements: ['Razonamiento fuerte', 'Capacidad de usar herramientas', 'Contexto largo para datasets'],
    filter: (m) => m.category === 'reasoning' || m.category === 'coding',
    tips: [
      'Pide el razonamiento paso a paso antes de la respuesta',
      'Valida las queries SQL antes de ejecutarlas',
      'Provee el esquema completo cuando sea posible',
    ],
  },
  {
    slug: 'translation',
    title: 'AI for Translation',
    tagline: 'Traduce documentos completos manteniendo contexto y estilo',
    description: 'Modelos multilingües con buen contexto preservan el tono, terminología técnica y estructura del documento original.',
    requirements: ['Soporte multilingüe', 'Contexto largo para documentos', 'Bajo costo por volumen'],
    filter: (m) => m.category === 'chat' && m.context_window >= 32000,
    tips: [
      'Incluye glosario de términos específicos',
      'Divide documentos grandes en secciones',
      'Pide el tono deseado (formal, casual, técnico)',
    ],
  },
  {
    slug: 'image-generation',
    title: 'AI for Image Generation',
    tagline: 'Genera imágenes desde descripciones de texto',
    description: 'Modelos especializados en crear imágenes artísticas, realistas, diseños y conceptos visuales a partir de prompts.',
    requirements: ['Modalidad de salida de imagen', 'Buen entendimiento de prompts', 'Diversos estilos'],
    filter: (m) => m.modalities?.image_output === true || m.category === 'image',
    tips: [
      'Sé específico: estilo, composición, iluminación',
      'Menciona artistas o referencias visuales',
      'Pide variaciones para comparar',
    ],
  },
  {
    slug: 'vision-analysis',
    title: 'AI for Vision & Image Analysis',
    tagline: 'Analiza imágenes, extrae texto (OCR), describe contenido visual',
    description: 'Modelos multimodales que entienden imágenes: pueden describir, clasificar, leer texto en imágenes y responder preguntas sobre el contenido visual.',
    requirements: ['Entrada de imagen', 'OCR y comprensión visual', 'Razonamiento sobre imágenes'],
    filter: (m) => m.modalities?.image_input === true,
    tips: [
      'Combina imágenes y texto en una sola pregunta',
      'Pide OCR explícito cuando lo necesites',
      'Especifica el formato de respuesta deseado',
    ],
  },
  {
    slug: 'embeddings',
    title: 'AI for Embeddings & Search',
    tagline: 'Convierte texto en vectores para búsqueda semántica y RAG',
    description: 'Modelos de embedding convierten texto en representaciones vectoriales para búsqueda por similitud, clustering y sistemas RAG.',
    requirements: ['Especializado en embeddings', 'Bajo costo por token', 'Alta dimensionalidad'],
    filter: (m) => m.category === 'embedding',
    tips: [
      'Normaliza los vectores antes de comparar similitud',
      'Usa el mismo modelo para indexar y buscar',
      'Considera chunks de 200-500 tokens',
    ],
  },
];

export const BEST_PICKS = [
  {
    slug: 'free',
    title: 'Best Free AI Models',
    tagline: 'Modelos con tier gratuito o completamente gratis',
    description: 'Si estás empezando o quieres experimentar sin costos, estos modelos ofrecen acceso gratuito con buenas capacidades.',
    filter: (m: AIModel) => m.pricing?.free === true,
  },
  {
    slug: 'cheap',
    title: 'Best Cheap AI Models',
    tagline: 'Buena relación calidad-precio, menos de $1 por millón de tokens',
    description: 'Modelos potentes a precios accesibles. Ideales para producción con volumen alto.',
    filter: (m: AIModel) => m.input_price + m.output_price > 0 && m.input_price + m.output_price < 5,
  },
  {
    slug: 'long-context',
    title: 'Best Long Context Models',
    tagline: 'Modelos con ventanas de contexto de 200K+ tokens',
    description: 'Para documentos largos, codebases completas, análisis de libros o conversaciones extendidas.',
    filter: (m: AIModel) => m.context_window >= 200000,
  },
  {
    slug: 'reasoning',
    title: 'Best Reasoning Models',
    tagline: 'Los mejores modelos para lógica, matemáticas y problemas complejos',
    description: 'Modelos optimizados para razonamiento profundo, ideal para problemas que requieren pensar paso a paso.',
    filter: (m: AIModel) => m.category === 'reasoning' || (m.benchmark && (m.benchmark.math || m.benchmark.mmlu) && m.benchmark.math >= 80),
  },
  {
    slug: 'open-source',
    title: 'Best Open Source Models',
    tagline: 'Modelos open source que puedes descargar y correr localmente',
    description: 'Si necesitas control total, privacidad o deployment on-premise, estos modelos open source son la mejor opción.',
    filter: (m: AIModel) => ['meta-llama', 'mistralai', 'qwen', 'deepseek', 'google'].includes(m.provider),
  },
  {
    slug: 'vision',
    title: 'Best Vision Models',
    tagline: 'Modelos que entienden imágenes y pueden analizar contenido visual',
    description: 'Modelos multimodales con capacidades de visión: análisis de imágenes, OCR, descripción visual.',
    filter: (m: AIModel) => m.modalities?.image_input === true,
  },
];

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find(u => u.slug === slug);
}

export function getBestPick(slug: string) {
  return BEST_PICKS.find(b => b.slug === slug);
}
