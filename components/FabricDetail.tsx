import React, { useState, useEffect } from 'react';
import { Fabric } from '../types';
import EditFabricModal from './EditFabricModal';
import PinModal from './PinModal';
import { generateFormatexSKU, isFormatexSupplier } from '../utils/skuUtils';

interface FabricDetailProps {
  fabric: Fabric;
  onBack: () => void;
  onEdit: (updatedFabric: Fabric) => void;
  onDelete: (id: string) => void;
}

const FabricDetail: React.FC<FabricDetailProps> = ({ fabric, onBack, onEdit, onDelete }) => {
  const [showSpecs, setShowSpecs] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isPinModalOpen, setPinModalOpen] = useState(false); // PIN Modal State
  
  // Sort colors alphabetically for display, handle undefined colors safely
  const sortedColors = [...(fabric.colors || [])].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  
  // Check if supplier matches Formatex rules
  const isFormatex = isFormatexSupplier(fabric.supplier);

  // Keydown listener for arrow keys in lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex !== null) {
        if (e.key === 'ArrowRight') handleNextImage(e);
        if (e.key === 'ArrowLeft') handlePrevImage(e);
        if (e.key === 'Escape') setLightboxIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex]);

  const handleNextImage = (e?: React.MouseEvent | KeyboardEvent) => {
    e?.stopPropagation();
    if (lightboxIndex !== null && sortedColors.length > 0) {
      setLightboxIndex((prev) => (prev! + 1) % sortedColors.length);
    }
  };

  const handlePrevImage = (e?: React.MouseEvent | KeyboardEvent) => {
    e?.stopPropagation();
    if (lightboxIndex !== null && sortedColors.length > 0) {
      setLightboxIndex((prev) => (prev! - 1 + sortedColors.length) % sortedColors.length);
    }
  };

  const getLightboxImage = () => {
    if (lightboxIndex === null) return null;
    const colorName = sortedColors[lightboxIndex];
    return fabric.colorImages?.[colorName] || fabric.mainImage;
  };

  const handleEditClick = () => {
      setPinModalOpen(true);
  };

  const handleDownloadFicha = (e: React.MouseEvent) => {
      if (fabric.pdfUrl) return; // If real URL exists, let default behavior happen
      
      e.preventDefault();
      
      // Generate SKUs text if applicable
      let skuSection = '';
      if (isFormatex) {
          skuSection = '\nCÓDIGOS DE REFERENCIA (SKU)\n';
          sortedColors.forEach(color => {
              const sku = generateFormatexSKU(fabric.name, color);
              skuSection += `- ${color}: ${sku}\n`;
          });
      }

      // Generate a text file with the specs
      const content = `
CREATA COLLECTION - FICHA TÉCNICA
---------------------------------
Modelo: ${fabric.name}
Proveedor: ${fabric.supplier}
Catálogo: ${fabric.customCatalog || (fabric.category === 'wood' ? 'Colección Maderas' : 'Colección Textil')}

RESUMEN TÉCNICO
${fabric.technicalSummary || 'Información no disponible'}

ESPECIFICACIONES
- Composición: ${fabric.specs.composition || 'N/A'}
- Durabilidad (Martindale): ${fabric.specs.martindale || 'N/A'}
- Peso: ${fabric.specs.weight || 'N/A'}

VARIANTES DE COLOR
${sortedColors.join(', ')}
${skuSection}
---------------------------------
Generado automáticamente por Creata App
`;

      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ficha_Tecnica_${fabric.name.replace(/\s+/g, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#f2f2f2] pb-20 animate-fade-in-up relative">
      
      {/* PIN Modal for Edit */}
      <PinModal 
        isOpen={isPinModalOpen} 
        onClose={() => setPinModalOpen(false)} 
        onSuccess={() => setEditModalOpen(true)} 
      />

      {/* Edit Modal */}
      {isEditModalOpen && (
        <EditFabricModal 
          fabric={fabric} 
          onClose={() => setEditModalOpen(false)} 
          onSave={(updated) => {
            onEdit(updated);
            setEditModalOpen(false);
          }}
          onDelete={() => {
              // Trigger the delete logic passed from App
              onDelete(fabric.id);
          }}
        />
      )}

      {/* Lightbox Overlay */}
      {lightboxIndex !== null && (
        <div 
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center cursor-pointer p-4 md:p-8"
            onClick={() => setLightboxIndex(null)}
        >
            <button 
              onClick={handlePrevImage}
              className="absolute left-2 md:left-8 text-white/80 hover:text-white hover:scale-110 transition-all p-3 z-[110] bg-black/20 rounded-full backdrop-blur-sm border border-white/10"
            >
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div 
                className="relative bg-white shadow-2xl rounded-sm overflow-hidden flex items-center justify-center border border-white/10
                           w-[90vw] h-[90vw] md:w-[80vh] md:h-[80vh]"
                onClick={(e) => e.stopPropagation()} 
            >
               <img 
                  src={getLightboxImage()!} 
                  alt="Full Texture" 
                  className="w-full h-full object-contain"
               />
            </div>

            <button 
              onClick={handleNextImage}
              className="absolute right-2 md:right-8 text-white/80 hover:text-white hover:scale-110 transition-all p-3 z-[110] bg-black/20 rounded-full backdrop-blur-sm border border-white/10"
            >
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>

            <button 
              onClick={() => setLightboxIndex(null)}
              className="absolute top-6 right-6 text-white/70 hover:text-white z-[110]"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
      )}

      {/* Specs Modal (Replaces Inline Expansion) */}
      {showSpecs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in" onClick={() => setShowSpecs(false)}>
            <div 
                className="bg-white w-full max-w-2xl rounded-3xl p-10 md:p-12 shadow-2xl relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button 
                    onClick={() => setShowSpecs(false)} 
                    className="absolute top-6 right-6 text-gray-400 hover:text-black transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <h3 className="font-serif text-3xl font-bold mb-6 text-slate-900 leading-tight">Resumen Técnico</h3>
                
                {fabric.specsImage ? (
                     <div className="mb-6 rounded-lg overflow-hidden border border-gray-100">
                         <img src={fabric.specsImage} alt="Ficha Técnica" className="w-full h-auto object-contain" />
                     </div>
                ) : (
                    <>
                        <p className="text-gray-600 mb-10 leading-relaxed font-sans text-lg border-b border-gray-100 pb-8">
                            {fabric.technicalSummary || "Información técnica detallada no disponible para este modelo."}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2 font-sans">Composición</span>
                                <span className="text-xl text-slate-900 font-medium font-serif leading-tight">{fabric.specs.composition || "N/A"}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2 font-sans">Durabilidad</span>
                                <span className="text-xl text-slate-900 font-medium font-serif leading-tight">{fabric.specs.martindale || "N/A"}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2 font-sans">Peso</span>
                                <span className="text-xl text-slate-900 font-medium font-serif leading-tight">{fabric.specs.weight || "N/A"}</span>
                            </div>
                        </div>
                    </>
                )}

                <div className="flex justify-end pt-2">
                     <a 
                       href={fabric.pdfUrl || "#"} 
                       download={`${fabric.name}-ficha-tecnica.pdf`}
                       className="flex items-center space-x-2 bg-black text-white px-8 py-4 rounded-full text-xs font-bold uppercase hover:bg-gray-800 transition-colors shadow-lg tracking-widest"
                       onClick={handleDownloadFicha}
                     >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        <span>Descargar Ficha Texto</span>
                     </a>
                </div>
            </div>
        </div>
      )}

      {/* Navigation Header */}
      <div className="sticky top-0 z-40 bg-[#f2f2f2]/90 backdrop-blur-sm px-6 py-3 flex items-center justify-center border-b border-gray-200/50">
        <div className="absolute left-6">
            <button onClick={onBack} className="flex items-center text-gray-400 hover:text-black transition-colors text-lg font-medium uppercase tracking-wide">
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Volver
            </button>
        </div>
        
        {/* Right side controls */}
        <div className="absolute right-6 flex items-center space-x-4">
            <button 
                onClick={handleEditClick} 
                className="text-gray-400 hover:text-black transition-colors font-bold text-3xl pb-4 h-8 flex items-center"
                title="Modificar ficha completa"
            >
                .
            </button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 flex flex-col items-center text-center max-w-5xl">
        
        {/* 1. Centered Header Info */}
        <div className="mb-6 space-y-2">
            <h2 className="text-gray-400 italic font-serif text-base tracking-wide">CREATA</h2>
            <h1 className="font-serif text-6xl md:text-8xl font-bold text-slate-900 tracking-tight leading-none uppercase">
                {fabric.name}
            </h1>
            <p className="text-sm text-gray-500 font-bold uppercase tracking-[0.25em] pt-2">
                {fabric.supplier}
            </p>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest pt-1">
                {fabric.customCatalog ? fabric.customCatalog : (fabric.category === 'wood' ? 'Colección Maderas' : 'Colección Textil')}
            </p>
        </div>

        {/* Trigger for Specs Modal */}
        <div className="w-full max-w-3xl mb-16">
            <button 
                onClick={() => setShowSpecs(true)}
                className="group flex items-center justify-center mx-auto space-x-2 text-sm font-medium text-gray-500 hover:text-black transition-colors px-6 py-3 rounded-full border border-gray-300 hover:border-black hover:bg-white"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                <span>Ficha técnica</span>
            </button>
        </div>

        {/* 2. Muestrario Interactivo (Circular Grid) */}
        <div className="w-full">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-[0.25em] mb-16">Variantes de Color</h3>
            
            <div className="flex flex-wrap justify-center gap-20 gap-y-32">
              {sortedColors.map((color, idx) => {
                const colorImg = fabric.colorImages?.[color] || fabric.mainImage;
                
                return (
                  <div key={idx} className="flex flex-col items-center group w-64">
                    <div 
                      onClick={() => setLightboxIndex(idx)} 
                      className="relative w-64 h-64 rounded-full border-[1px] border-gray-300 overflow-hidden cursor-pointer bg-white shadow-md transition-all duration-500 hover:shadow-2xl hover:scale-105"
                    >
                       <img 
                         src={colorImg} 
                         alt={color} 
                         className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                       />
                       
                       {/* HOVER OVERLAY WITH LUPA + ICON (Small White) */}
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                          <svg className="w-6 h-6 text-white drop-shadow-md transform scale-75 group-hover:scale-100 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                          </svg>
                       </div>
                    </div>
                    
                    <p className="mt-3 text-lg font-bold text-slate-900 uppercase tracking-widest text-center group-hover:text-black transition-colors">
                      {color}
                    </p>
                  </div>
                );
              })}
            </div>
            
            {sortedColors.length === 0 && (
                <p className="text-base text-gray-400 italic py-10">No hay variantes cargadas.</p>
            )}
        </div>

      </div>
    </div>
  );
};

export default FabricDetail;