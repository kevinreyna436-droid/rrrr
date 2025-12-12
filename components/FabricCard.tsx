
import React from 'react';
import { Fabric } from '../types';

interface FabricCardProps {
  fabric: Fabric;
  onClick: () => void;
  mode: 'model' | 'color';
  specificColorName?: string;
  index: number;
}

// Helper to Capitalize First Letter (e.g. "alanis" -> "Alanis")
const toTitleCase = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const FabricCard: React.FC<FabricCardProps> = ({ fabric, onClick, mode, specificColorName }) => {
  // Determine which image to show
  let displayImage = fabric.mainImage;
  if (mode === 'color' && specificColorName && fabric.colorImages?.[specificColorName]) {
    displayImage = fabric.colorImages[specificColorName];
  }

  // Safe access to colors
  const colorList = fabric.colors || [];

  return (
    <div 
      onClick={onClick}
      className="group relative w-full aspect-[3/4] md:aspect-[4/5] bg-white rounded-3xl shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer flex flex-col hover:-translate-y-2 hover:scale-[0.97] transform-gpu scale-[0.95]"
    >
      {/* SECTION SUPERIOR (Imagen) - 70% height */}
      <div className="relative h-[70%] w-full bg-gray-100 overflow-hidden">
        {displayImage ? (
          <img 
            src={displayImage} 
            alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
            className="w-full h-full object-cover object-center transition-transform duration-700 scale-[1.1] group-hover:scale-[1.15]"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 group-hover:bg-gray-100 transition-colors">
            <div className="text-center">
              <span className="block font-serif text-3xl md:text-4xl text-gray-200 font-bold opacity-50 mb-2">
                 {fabric.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-gray-300">
                 Sin Foto
              </span>
            </div>
          </div>
        )}
        
        {/* Curved Wave Separator (SVG) */}
        <div className="absolute bottom-[-1px] left-0 w-full text-white pointer-events-none z-10">
             <svg 
               viewBox="0 0 1440 120" 
               className="w-full h-auto block fill-current"
               preserveAspectRatio="none"
             >
               <path d="M0,60 C480,130 960,130 1440,60 L1440,120 L0,120 Z" />
             </svg>
        </div>
      </div>

      {/* SECTION INFERIOR (Información) - 30% height */}
      <div className="h-[30%] px-4 pb-2 text-center flex flex-col items-center justify-start pt-3 bg-white relative z-20">
        <div className="w-full flex flex-col justify-center h-full space-y-1">
          {mode === 'model' ? (
            /* --- VISTA MODELOS --- */
            /* Jerarquía: 1. Nombre Modelo (Title Case) / 2. Proveedor (UPPERCASE) / 3. Footer (Lista Colores) */
            <>
              {/* Main Title: MODEL NAME */}
              <h3 className="font-serif text-lg md:text-xl font-medium text-slate-800 leading-tight mb-1 group-hover:text-black transition-colors px-1 line-clamp-1">
                {toTitleCase(fabric.name)}
              </h3>
              {/* Subtitle: SUPPLIER (Uppercase for contrast, spaced) */}
              <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-[0.2em] leading-none">
                {fabric.supplier}
              </p>
              
              {/* Footer: List of available colors (Light Grey) */}
              <p className="text-[9px] text-gray-400 font-normal uppercase leading-snug px-1 tracking-wide line-clamp-1 mt-2">
                {colorList.length > 0 ? colorList.join(', ') : 'Sin Variantes'}
              </p>
            </>
          ) : (
            /* --- VISTA COLORES --- */
            /* Jerarquía: 1. Nombre Color (Title Case) / 2. Nombre Modelo (UPPERCASE) */
            <>
              {/* Main Title: SPECIFIC COLOR NAME */}
              <h3 className="font-serif text-lg md:text-xl font-medium text-slate-800 leading-tight mb-1 group-hover:text-black transition-colors px-1 line-clamp-2 break-words">
                {specificColorName ? toTitleCase(specificColorName) : 'Sin Nombre'}
              </h3>
              
              {/* Subtitle: MODEL NAME (Uppercase to act as "Collection Name") */}
              <p className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-[0.2em] leading-none">
                {fabric.name}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FabricCard;
