// Rubros del catálogo de la DNCP (segmentos UNSPSC: dos primeros dígitos del código).
const RUBROS: Record<string, string> = {
  "10": "Plantas, animales e insumos agropecuarios", "11": "Minerales, tejidos y materias primas", "12": "Productos químicos",
  "13": "Resinas, caucho y espumas", "14": "Papel y cartón", "15": "Combustibles y lubricantes", "20": "Maquinaria minera y de perforación",
  "21": "Maquinaria agrícola y forestal", "22": "Maquinaria de construcción", "23": "Maquinaria industrial", "24": "Manejo y almacenamiento de materiales",
  "25": "Vehículos y repuestos", "26": "Generación y distribución de energía", "27": "Herramientas y maquinaria general",
  "30": "Materiales de construcción", "31": "Componentes y suministros de manufactura", "32": "Componentes electrónicos",
  "39": "Electricidad e iluminación", "40": "Climatización, plomería y bombas", "41": "Equipos de laboratorio y medición",
  "42": "Equipo e insumos médicos", "43": "Informática y telecomunicaciones", "44": "Equipos y útiles de oficina",
  "45": "Impresión, fotografía y audiovisual", "46": "Defensa, seguridad y protección", "47": "Limpieza",
  "48": "Equipos de cocina y servicios", "49": "Deportes y recreación", "50": "Alimentos y bebidas", "51": "Medicamentos",
  "52": "Artículos domésticos y electrodomésticos", "53": "Ropa, calzado y accesorios", "54": "Relojería y joyería",
  "55": "Publicaciones e impresos", "56": "Muebles", "60": "Material educativo, arte e instrumentos",
  "70": "Servicios agropecuarios y forestales", "71": "Servicios de minería y petróleo", "72": "Construcción y mantenimiento",
  "73": "Servicios de producción industrial", "76": "Servicios de limpieza y residuos", "77": "Servicios ambientales",
  "78": "Transporte, almacenaje y correo", "80": "Consultoría y servicios administrativos", "81": "Ingeniería, investigación y tecnología",
  "82": "Publicidad, diseño y servicios editoriales", "83": "Servicios públicos y comunicaciones", "84": "Seguros y servicios financieros",
  "85": "Servicios de salud", "86": "Educación y capacitación", "90": "Viajes, alojamiento, comida y eventos",
  "91": "Servicios personales y domésticos", "92": "Seguridad y orden público", "93": "Servicios políticos y cívicos",
  "94": "Organizaciones y asociaciones", "95": "Terrenos, edificios y estructuras",
};
export const nombreRubro = (id: string) => RUBROS[id] ?? `Rubro ${id}`;
