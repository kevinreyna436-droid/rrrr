
import { Fabric } from './types';

export const MASTER_FABRIC_DB: Record<string, string[]> = {};

// DEMO DATA: These will appear only if the Database is empty.
export const INITIAL_FABRICS: Fabric[] = [
  {
    id: 'demo-1',
    name: 'Alanis',
    supplier: 'FORMATEX',
    category: 'model',
    technicalSummary: 'Tejido bouclé de alta resistencia, ideal para tapicería de tráfico pesado. Tacto suave con estructura tridimensional.',
    specs: {
      composition: '95% Polyester, 5% Acrylic',
      martindale: '50.000 Ciclos',
      weight: '450 gr/m2',
      usage: 'Tapicería Interior'
    },
    colors: ['01 Pearl', '05 Sand', '12 Stone', '09 Onyx'],
    mainImage: 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?q=80&w=800&auto=format&fit=crop', // White bouclé
    colorImages: {
        '01 Pearl': 'https://images.unsplash.com/photo-1616469829581-73993eb86b02?q=80&w=800&auto=format&fit=crop',
        '05 Sand': 'https://images.unsplash.com/photo-1616469832301-ffad25f5406c?q=80&w=800&auto=format&fit=crop',
        '12 Stone': 'https://images.unsplash.com/photo-1595166418861-454523992015?q=80&w=800&auto=format&fit=crop', // Grey
        '09 Onyx': 'https://images.unsplash.com/photo-1505330622279-bf7d7fc918f4?q=80&w=800&auto=format&fit=crop' // Black
    },
    createdAt: Date.now()
  },
  {
    id: 'demo-2',
    name: 'Bikendi',
    supplier: 'CREATA',
    category: 'model',
    technicalSummary: 'Lino lavado a la piedra con caída natural. Tratamiento antimanchas incluido.',
    specs: {
      composition: '100% Lino Natural',
      martindale: '25.000 Ciclos',
      weight: '380 gr/m2',
      usage: 'Cortinas y Decoración'
    },
    colors: ['Natural', 'Terra', 'Mostaza'],
    mainImage: 'https://images.unsplash.com/photo-1520699918507-3c3e0dc69b22?q=80&w=800&auto=format&fit=crop',
    colorImages: {
        'Natural': 'https://images.unsplash.com/photo-1520699918507-3c3e0dc69b22?q=80&w=800&auto=format&fit=crop',
        'Terra': 'https://images.unsplash.com/photo-1598464873836-97641dd13f56?q=80&w=800&auto=format&fit=crop',
        'Mostaza': 'https://images.unsplash.com/photo-1551232864-3f0890e580d9?q=80&w=800&auto=format&fit=crop'
    },
    createdAt: Date.now() - 10000
  },
  {
    id: 'demo-3',
    name: 'Roble Americano',
    supplier: 'MADERAS FINAS',
    category: 'wood',
    technicalSummary: 'Madera maciza de roble con acabado mate. Veta recta y uniforme.',
    specs: {
      composition: 'Roble (Quercus alba)',
      martindale: 'N/A',
      weight: '750 kg/m3',
      usage: 'Mobiliario Estructural'
    },
    colors: ['Natural', 'Nogal Tinte', 'Negro Poro Abierto'],
    mainImage: 'https://images.unsplash.com/photo-1542887800-cb0c968470a6?q=80&w=800&auto=format&fit=crop',
    colorImages: {
        'Natural': 'https://images.unsplash.com/photo-1542887800-cb0c968470a6?q=80&w=800&auto=format&fit=crop',
        'Nogal Tinte': 'https://images.unsplash.com/photo-1611244420083-d52f6c8d7698?q=80&w=800&auto=format&fit=crop',
        'Negro Poro Abierto': 'https://images.unsplash.com/photo-1610477218698-54b0292f7e77?q=80&w=800&auto=format&fit=crop'
    },
    createdAt: Date.now() - 20000
  }
];
