
import React from 'react';
import { Fabric } from '../types';

interface FabricCardProps {
  fabric: Fabric;
  onClick: () => void;
  mode: 'model' | 'color';
  specificColorName?: string;
  index: number;
}

// Helper to Capitalize First Letter (Title Case)
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
      {/* SECTION SUPERIOR (Imagen) - 75% height for more visual impact */}
      <div className="relative h-[75%] w-full bg-gray-100 overflow-hidden">
        {displayImage ? (
          <img 
            src={displayImage} 
            alt={mode === 'model' ? fabric.name : `${fabric.name} - ${specificColorName}`} 
            className="w-full h-full object-cover object-center transition-transform duration-700 scale-[1.05] group-hover:scale-[1.15]"
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
      </div>

      {/* SECTION INFERIOR (Información) - 25% height */}
      <div className="h-[25%] px-5 pb-4 text-center flex flex-col items-center justify-center bg-white relative z-20">
        <div className="w-full flex flex-col items-center justify-center space-y-1">
          {mode === 'model' ? (
            /* --- VISTA MODELOS (Grid General) --- */
            <>
              {/* Título: Nombre Modelo (Ej: Alanis) - Primera mayúscula */}
              <h3 className="font-serif text-2xl font-medium text-slate-900 leading-tight group-hover:text-black transition-colors">
                {toTitleCase(fabric.name)}
              </h3>
              
              {/* Subtítulo: Proveedor (Ej: FORMATEX) - Todo mayúsculas, espaciado */}
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.25em] leading-relaxed">
                {fabric.supplier || 'CREATA'}
              </p>
              
              {/* Pie: Lista de colores disponibles (texto gris claro) */}
              <p className="text-[10px] text-gray-400 font-light mt-2 line-clamp-1 max-w-[95%] opacity-80 overflow-hidden text-ellipsis">
                {colorList.length > 0 ? colorList.join(', ') : ''}
              </p>
            </>
          ) : (
            /* --- VISTA COLORES (Grid Colores) --- */
            <>
              {/* Título: Nombre Color (Ej: 05 Sand) - Primera mayúscula */}
              <h3 className="font-serif text-xl font-medium text-slate-900 leading-tight group-hover:text-black transition-colors line-clamp-1">
                {specificColorName ? toTitleCase(specificColorName) : 'Sin Nombre'}
              </h3>
              
              {/* Subtítulo: Nombre Modelo (Ej: ALANIS) - Todo mayúsculas */}
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.25em] leading-relaxed">
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
