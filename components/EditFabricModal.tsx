
import React, { useState, useRef } from 'react';
import { Fabric } from '../types';
import { compressImage } from '../utils/imageCompression';

interface EditFabricModalProps {
  fabric: Fabric;
  onClose: () => void;
  onSave: (updatedFabric: Fabric) => Promise<void> | void; // Allow async
  onDelete: () => void;
}

const EditFabricModal: React.FC<EditFabricModalProps> = ({ fabric, onClose, onSave, onDelete }) => {
  const [formData, setFormData] = useState<Fabric>({ 
      ...fabric,
      colors: fabric.colors || [],
      colorImages: fabric.colorImages || {}
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const specsImageInputRef = useRef<HTMLInputElement>(null);
  const specsPdfInputRef = useRef<HTMLInputElement>(null);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [processingImageId, setProcessingImageId] = useState<string | null>(null);

  const handleChange = (field: keyof Fabric, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSpecChange = (field: keyof typeof fabric.specs, value: string) => {
    setFormData(prev => ({
      ...prev,
      specs: { ...prev.specs, [field]: value }
    }));
  };

  const handleColorNameChange = (index: number, newName: string) => {
    const newColors = [...formData.colors];
    const oldName = newColors[index];
    newColors[index] = newName;

    const newColorImages = { ...formData.colorImages };
    if (newColorImages[oldName]) {
      newColorImages[newName] = newColorImages[oldName];
      delete newColorImages[oldName];
    }

    setFormData(prev => ({ ...prev, colors: newColors, colorImages: newColorImages }));
  };

  const handleRemoveColor = (index: number) => {
    const colorName = formData.colors[index];
    const newColors = formData.colors.filter((_, i) => i !== index);
    const newColorImages = { ...formData.colorImages };
    delete newColorImages[colorName];
    setFormData(prev => ({ ...prev, colors: newColors, colorImages: newColorImages }));
  };

  const handleAddColor = () => {
    setFormData(prev => ({
        ...prev,
        colors: [...prev.colors, "Nuevo Color"]
    }));
  };

  const triggerImageUpload = (index: number) => {
    setEditingColorIndex(index);
    fileInputRef.current?.click();
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && editingColorIndex !== null) {
      const file = e.target.files[0];
      const colorName = formData.colors[editingColorIndex];
      setProcessingImageId(`color-${editingColorIndex}`);

      try {
          // OPTIMIZED: 1920px, 0.80
          const base64 = await compressImage(file, 1920, 0.80);
          
          setFormData(prev => {
              let newMain = prev.mainImage;
              // If main image is empty, use this one as main
              if (!newMain) newMain = base64;

              return {
                ...prev,
                colorImages: { ...prev.colorImages, [colorName]: base64 },
                mainImage: newMain
              };
          });
      } catch (err: any) {
          alert("Error al procesar la imagen.");
      } finally {
          setProcessingImageId(null);
          setEditingColorIndex(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };
  
  const handleSpecsImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setProcessingImageId('specs');
          try {
              const base64 = await compressImage(file, 1920, 0.80);
              setFormData(prev => ({ ...prev, specsImage: base64 }));
          } catch(err) {
              alert("Error subiendo imagen de ficha técnica.");
          } finally {
              setProcessingImageId(null);
          }
      }
  };

  const handleSpecsPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.type !== 'application/pdf') {
            alert('Solo se permiten archivos PDF.');
            return;
        }
        
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            setFormData(prev => ({ ...prev, pdfUrl: reader.result as string }));
        };
        reader.onerror = () => alert("Error leyendo el PDF.");
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (window.confirm("¿Estás seguro de que quieres eliminar esta ficha completamente? Esta acción no se puede deshacer.")) {
        onDelete();
      }
  };

  const handleSaveClick = async () => {
    setIsSaving(true);
    try {
        await onSave(formData);
        // onClose is called by parent if save succeeds, typically
    } catch (e) {
        // Error is alerted in firebase.ts, we just stop the spinner here
        console.error("Save failed in modal", e);
    } finally {
        setIsSaving(false);
    }
  };

  // Helper to check image storage location
  const StorageBadge = ({ url }: { url: string | undefined }) => {
    if (!url) return <span className="text-[9px] text-gray-400 font-medium ml-1">Sin Imagen</span>;
    const isCloud = url.startsWith('http');
    return (
      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1 w-fit mt-1 ${isCloud ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
        {isCloud ? (
           <>
             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
             Nube
           </>
        ) : (
           <>
             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
             Local (No subido)
           </>
        )}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
              <h2 className="font-serif text-2xl font-bold text-primary">Editar Ficha de Ingreso</h2>
              <p className="text-xs text-gray-400 mt-1">Gestiona nombres, datos técnicos e imágenes.</p>
          </div>
          {!isSaving && (
            <button onClick={onClose} className="text-gray-400 hover:text-black">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 relative">
          
          {isSaving && (
             <div className="absolute inset-0 bg-white/80 z-50 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                <p className="mt-4 font-bold text-sm">Guardando y Subiendo imágenes...</p>
             </div>
          )}

          {/* Main Info Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Nombre Tela</label>
              <input 
                type="text" 
                value={formData.name} 
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:ring-1 focus:ring-black outline-none font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Proveedor</label>
              <input 
                type="text" 
                value={formData.supplier} 
                onChange={(e) => handleChange('supplier', e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:ring-1 focus:ring-black outline-none font-medium"
              />
            </div>
          </div>
          
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            <label className="block text-xs font-bold uppercase text-blue-800 mb-2">Catálogo / Colección</label>
            <input 
                type="text" 
                value={formData.customCatalog || ''} 
                onChange={(e) => handleChange('customCatalog', e.target.value)}
                placeholder="Ej: Colección Verano 2025"
                className="w-full p-3 bg-white rounded-lg border border-blue-200 focus:ring-1 focus:ring-blue-500 outline-none font-medium text-blue-900"
            />
          </div>

          <div>
             <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Resumen Técnico (Texto)</label>
             <textarea 
               value={formData.technicalSummary}
               onChange={(e) => handleChange('technicalSummary', e.target.value)}
               className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 focus:ring-1 focus:ring-black outline-none h-24 resize-none"
             />
          </div>

          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
             <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Composición</label>
                <input type="text" value={formData.specs.composition} onChange={(e) => handleSpecChange('composition', e.target.value)} className="w-full p-2 bg-white rounded border border-gray-200 text-sm"/>
             </div>
             <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Durabilidad</label>
                <input type="text" value={formData.specs.martindale} onChange={(e) => handleSpecChange('martindale', e.target.value)} className="w-full p-2 bg-white rounded border border-gray-200 text-sm"/>
             </div>
             <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Uso</label>
                <input type="text" value={formData.specs.usage} onChange={(e) => handleSpecChange('usage', e.target.value)} className="w-full p-2 bg-white rounded border border-gray-200 text-sm"/>
             </div>
             <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Peso</label>
                <input type="text" value={formData.specs.weight || ''} onChange={(e) => handleSpecChange('weight', e.target.value)} className="w-full p-2 bg-white rounded border border-gray-200 text-sm"/>
             </div>
          </div>
          
          <div className="border-t border-gray-100 pt-6">
              <label className="block text-xs font-bold uppercase text-gray-400 mb-4">Archivos de Ficha Técnica</label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Specs Image Upload */}
                  <div className="flex flex-col space-y-2 p-3 border border-gray-100 rounded-xl bg-gray-50">
                      <span className="text-[10px] font-bold uppercase text-gray-400">Imagen (JPG/PNG)</span>
                      <div className="flex items-start space-x-3">
                          <div className="w-24 h-24 bg-white rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center shadow-sm relative">
                              {processingImageId === 'specs' ? (
                                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                              ) : formData.specsImage ? (
                                  <img src={formData.specsImage} alt="Specs" className="w-full h-full object-cover" />
                              ) : (
                                  <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              )}
                          </div>
                          <div className="flex flex-col space-y-1">
                             <StorageBadge url={formData.specsImage} />
                             <button 
                                onClick={() => specsImageInputRef.current?.click()}
                                className="text-xs font-bold text-blue-600 hover:underline text-left mt-1"
                            >
                                {formData.specsImage ? 'Cambiar Foto' : 'Subir Foto'}
                            </button>
                            {formData.specsImage && (
                                <button onClick={() => handleChange('specsImage', '')} className="text-[10px] text-red-400 hover:text-red-600 text-left">Quitar</button>
                            )}
                          </div>
                      </div>
                  </div>

                  {/* PDF Upload */}
                  <div className="flex flex-col space-y-2 p-3 border border-gray-100 rounded-xl bg-gray-50">
                      <span className="text-[10px] font-bold uppercase text-gray-400">Documento (PDF)</span>
                      <div className="flex items-start space-x-3">
                          <div className="w-24 h-24 bg-white rounded-lg border border-gray-200 flex items-center justify-center shadow-sm">
                               {formData.pdfUrl ? (
                                   <svg className="w-10 h-10 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                               ) : (
                                   <span className="text-gray-300 text-[10px] font-bold">PDF</span>
                               )}
                          </div>
                          <div className="flex flex-col space-y-1">
                             <StorageBadge url={formData.pdfUrl} />
                            <button 
                                onClick={() => specsPdfInputRef.current?.click()}
                                className="text-xs font-bold text-blue-600 hover:underline text-left mt-1"
                            >
                                {formData.pdfUrl ? 'Cambiar PDF' : 'Subir PDF'}
                            </button>
                            {formData.pdfUrl && (
                                <button onClick={() => handleChange('pdfUrl', '')} className="text-[10px] text-red-400 hover:text-red-600 text-left">Quitar</button>
                            )}
                          </div>
                      </div>
                  </div>
              </div>

              <input ref={specsImageInputRef} type="file" className="hidden" accept="image/*" onChange={handleSpecsImageChange} />
              <input ref={specsPdfInputRef} type="file" className="hidden" accept="application/pdf" onChange={handleSpecsPdfChange} />
          </div>

          <hr className="border-gray-100" />

          {/* COLORS SECTION */}
          <div>
              <div className="flex justify-between items-center mb-6">
                  <div>
                      <label className="block text-xs font-bold uppercase text-gray-400">Variantes de Color</label>
                      <p className="text-[10px] text-gray-400">Sube la imagen en el recuadro grande.</p>
                  </div>
                  <button onClick={handleAddColor} className="text-xs bg-black text-white px-3 py-2 rounded-full font-bold hover:bg-gray-800 transition-colors shadow-lg">
                      + Añadir Color
                  </button>
              </div>
              
              <div className="space-y-4">
                  {formData.colors.map((color, idx) => {
                      const imgUrl = formData.colorImages && formData.colorImages[color];
                      const isProcessing = processingImageId === `color-${idx}`;

                      return (
                          <div key={idx} className="flex items-start space-x-4 bg-gray-50 p-4 rounded-xl border border-gray-100 transition-shadow hover:shadow-md hover:bg-white">
                              {/* Image Upload Box */}
                              <div className="flex flex-col items-center gap-2">
                                  <div 
                                      onClick={() => triggerImageUpload(idx)}
                                      className="w-24 h-24 bg-gray-200 rounded-xl cursor-pointer overflow-hidden flex-shrink-0 hover:opacity-80 relative group border border-gray-300 shadow-sm"
                                      title="Haz clic para subir foto de alta calidad"
                                  >
                                      {isProcessing ? (
                                          <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                                          </div>
                                      ) : imgUrl ? (
                                          <img src={imgUrl} alt={color} className="w-full h-full object-cover" />
                                      ) : (
                                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                              <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
                                              <span className="text-[9px] uppercase font-bold">Subir Foto</span>
                                          </div>
                                      )}
                                      
                                      {!isProcessing && (
                                        <div className="absolute inset-0 bg-black/20 hidden group-hover:flex items-center justify-center">
                                            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        </div>
                                      )}
                                  </div>
                                  <StorageBadge url={imgUrl} />
                              </div>

                              <div className="flex-1 pt-1 flex flex-col justify-center h-24">
                                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Nombre del Color</label>
                                  <input 
                                      type="text" 
                                      value={color} 
                                      onChange={(e) => handleColorNameChange(idx, e.target.value)}
                                      className="w-full bg-white border border-gray-200 rounded-lg p-3 focus:ring-1 focus:ring-black outline-none text-base font-medium"
                                      placeholder="Ej: Navy Blue"
                                  />
                              </div>

                              <div className="h-24 flex items-center">
                                  <button 
                                    onClick={() => handleRemoveColor(idx)} 
                                    className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition-colors" 
                                    title="Eliminar este color"
                                  >
                                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                              </div>
                          </div>
                      );
                  })}
                  
                  {formData.colors.length === 0 && (
                      <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                          <p className="text-base text-gray-400">No hay colores registrados.</p>
                          <button onClick={handleAddColor} className="mt-2 text-blue-600 hover:underline text-sm font-bold">Añadir el primer color</button>
                      </div>
                  )}
              </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex flex-col space-y-4 shadow-inner">
            <button 
                type="button"
                onClick={handleSaveClick}
                disabled={isSaving}
                className="w-full bg-black text-white py-4 rounded-xl font-bold tracking-wide hover:opacity-90 transition-all text-sm uppercase shadow-lg transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSaving ? 'Procesando...' : 'Guardar Cambios y Subir Imágenes'}
            </button>
            
            {!isSaving && (
                <button 
                    type="button"
                    onClick={handleDeleteClick}
                    className="w-full text-red-400 text-xs font-bold uppercase tracking-widest hover:text-red-600 hover:underline py-2"
                >
                    Eliminar Ficha Permanentemente
                </button>
            )}
        </div>

        <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleImageFileChange} />
      </div>
    </div>
  );
};

export default EditFabricModal;
