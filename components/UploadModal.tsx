
import React, { useState, useRef } from 'react';
import { extractFabricData, extractColorFromSwatch } from '../services/geminiService';
import { MASTER_FABRIC_DB } from '../constants';
import { Fabric } from '../types';
import { compressImage } from '../utils/imageCompression';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (fabric: Fabric) => Promise<void> | void;
  onBulkSave?: (fabrics: Fabric[]) => Promise<void> | void;
  onReset?: () => void;
}

const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSave, onBulkSave, onReset }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  const [currentProgress, setCurrentProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'model' | 'wood'>('model');
  const [expandedSpecsIndex, setExpandedSpecsIndex] = useState<number | null>(null);
  
  // Ref only for the single image replacement input
  const singleImageInputRef = useRef<HTMLInputElement>(null);
  const [activeUpload, setActiveUpload] = useState<{ 
      fabricIndex: number; 
      type: 'main' | 'color' | 'add_color'; 
      colorName?: string; 
  } | null>(null);

  if (!isOpen) return null;

  // Handle Desktop Folder Upload
  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
    }
  };

  // Handle Mobile/Drive Files Upload
  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          setFiles(Array.from(e.target.files));
      }
  };
  
  const handleSingleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeUpload) {
        try {
            const file = e.target.files[0];
            const { fabricIndex, type, colorName } = activeUpload;
            
            // HIGH QUALITY: 2560px, 0.95 quality
            const base64 = await compressImage(file, 2560, 0.95);

            setExtractedFabrics(prev => {
                const updated = [...prev];
                const fabric = { ...updated[fabricIndex] };
                
                if (type === 'main') {
                    fabric.mainImage = base64;
                } else if (type === 'color' && colorName) {
                    const newImages = { ...fabric.colorImages, [colorName]: base64 };
                    fabric.colorImages = newImages;
                } else if (type === 'add_color') {
                    const newName = window.prompt("Nombre del nuevo color:", `Color ${(fabric.colors?.length || 0) + 1}`);
                    if (newName) {
                        const newColors = [...(fabric.colors || []), newName];
                        const newImages = { ...fabric.colorImages, [newName]: base64 };
                        fabric.colors = newColors;
                        fabric.colorImages = newImages;
                    }
                }
                
                updated[fabricIndex] = fabric;
                return updated;
            });

        } catch (err) {
            console.error("Error updating image", err);
        }
        setActiveUpload(null);
        if (singleImageInputRef.current) singleImageInputRef.current.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const analyzeFileGroup = async (groupFiles: File[], groupName: string): Promise<Partial<Fabric>> => {
      const pdfFile = groupFiles.find(f => f.type === 'application/pdf');
      const imgFiles = groupFiles.filter(f => f.type.startsWith('image/'));

      let rawData: any = { name: "Unknown", supplier: "Unknown", technicalSummary: "", specs: {} };

      // 1. Extract Info (Keep standard quality for AI to be fast)
      try {
        if (pdfFile) {
            const base64Data = await fileToBase64(pdfFile);
            rawData = await extractFabricData(base64Data.split(',')[1], 'application/pdf');
            if (base64Data.length < 1000000) { 
                rawData.pdfUrl = base64Data;
            }
        } else if (imgFiles.length > 0) {
            const aiAnalysisImg = await compressImage(imgFiles[0], 1024, 0.85);
            rawData = await extractFabricData(aiAnalysisImg.split(',')[1], 'image/jpeg');
        }
      } catch (e: any) {
          console.warn(`Extraction failed for ${groupName}`, e?.message || "Unknown error");
      }

      const cleanFabricName = (inputName: string) => {
          if (!inputName) return "";
          return inputName.replace(/^(fromatex|fotmatex|formatex|creata)[_\-\s]*/i, '').trim();
      };

      if (rawData.name && rawData.name !== "Unknown") {
          rawData.name = cleanFabricName(rawData.name);
      }
      if (!rawData.name || rawData.name === "Unknown") {
          rawData.name = cleanFabricName(groupName); 
      }

      let dbColors: string[] = [];
      const dbName = Object.keys(MASTER_FABRIC_DB).find(
        key => key.toLowerCase() === rawData.name?.toLowerCase()
      );

      if (dbName) {
        dbColors = [...MASTER_FABRIC_DB[dbName]];
        rawData.name = dbName;
      }

      const colorImages: Record<string, string> = {};
      const detectedColorsList: string[] = [];
      
      let processedCount = 0;
      for (const file of imgFiles) {
        processedCount++;
        if (processedCount % 3 === 0) {
             setCurrentProgress(`Escaneando colores (${processedCount}/${imgFiles.length}) para ${rawData.name}...`);
        }

        try {
            // HIGH QUALITY STORAGE: 2560px, 0.95
            const base64Img = await compressImage(file, 2560, 0.95);
            
            // For OCR, we can use the same string or a smaller one, but let's reuse to keep it simple
            // We pass split base64 to AI
            let detectedName = await extractColorFromSwatch(base64Img.split(',')[1]);
            
            if (!detectedName) {
                const fileNameLower = file.name.toLowerCase().replace(/\.[^/.]+$/, "");
                if (dbColors.length > 0) {
                     const matchedColor = dbColors.find(color => fileNameLower.includes(color.toLowerCase()));
                     if (matchedColor) detectedName = matchedColor;
                }
                if (!detectedName) {
                    let cleanColorName = fileNameLower;
                    if (rawData.name) {
                        const nameRegex = new RegExp(`^${rawData.name}[_\\-\\s]*`, 'i');
                        cleanColorName = cleanColorName.replace(nameRegex, '');
                    }
                    cleanColorName = cleanColorName.replace(/^(fromatex|fotmatex|formatex|creata)[_\-\s]*/i, '');
                    const cleanName = cleanColorName.replace(/[-_]/g, " ").trim();
                    detectedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
                }
            }

            if (detectedName && dbColors.length > 0) {
                 const exactMatch = dbColors.find(c => c.toLowerCase() === detectedName!.toLowerCase().trim());
                 if (exactMatch) detectedName = exactMatch;
            }

            if (detectedName) {
                if (!colorImages[detectedName]) {
                    colorImages[detectedName] = base64Img;
                    detectedColorsList.push(detectedName);
                }
            }
        } catch (imgError) {
            console.warn(`Failed to process image ${file.name}`, imgError);
        }
      }

      if (dbName && dbColors.length > 0) {
           detectedColorsList.sort(); 
      } else {
           detectedColorsList.sort();
      }

      let mainImageToUse = '';
      if (Object.keys(colorImages).length > 0) {
          mainImageToUse = Object.values(colorImages)[0];
      } else if (imgFiles.length > 0) {
          try {
            mainImageToUse = await compressImage(imgFiles[0], 2560, 0.95);
          } catch(e) {
            mainImageToUse = '';
          }
      }

      return {
          ...rawData,
          colors: detectedColorsList,
          colorImages: colorImages,
          mainImage: mainImageToUse,
          category: selectedCategory,
          customCatalog: '' 
      };
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    setStep('processing');
    setExtractedFabrics([]);

    // 1. Grouping Logic (Safe)
    const groups: Record<string, File[]> = {};
    try {
        files.forEach(f => {
            let key = 'Lote Cargado'; 
            if (f.webkitRelativePath) {
                const parts = f.webkitRelativePath.split('/');
                if (parts.length > 2) key = parts[1];
                else if (parts.length === 2) key = parts[0];
            }
            if (!groups[key]) groups[key] = [];
            groups[key].push(f);
        });
    } catch (e) {
        console.error("Error grouping files:", e);
        alert('Error al agrupar los archivos.');
        setStep('upload');
        return;
    }

    const groupKeys = Object.keys(groups);
    const results: Partial<Fabric>[] = [];

    // 2. Processing Loop (Robust)
    for (let i = 0; i < groupKeys.length; i++) {
        const key = groupKeys[i];
        const groupFiles = groups[key];
        
        // Skip groups with no valid media
        if (!groupFiles.some(f => f.type.startsWith('image/') || f.type === 'application/pdf')) continue;
        
        setCurrentProgress(`Analizando ${key}... (${i + 1}/${groupKeys.length})`);
        
        try {
            const fabricNameHint = key === 'Lote Cargado' ? 'Unknown' : key;
            const fabricData = await analyzeFileGroup(groupFiles, fabricNameHint);
            
            // Add to results successfully
            results.push(fabricData);

        } catch (innerErr: any) {
            // If one folder fails, LOG IT but DO NOT STOP the loop.
            console.error(`Error procesando grupo ${key}:`, innerErr?.message);
        }
    }

    // 3. Finalize: Show whatever we managed to read
    if (results.length > 0) {
        setExtractedFabrics(results);
        setStep('review');
    } else {
        alert('No se pudieron procesar los archivos. Verifica que sean válidos e inténtalo de nuevo.');
        setStep('upload');
    }
  };

  const removeFabricFromReview = (index: number) => {
      setExtractedFabrics(prev => prev.filter((_, i) => i !== index));
  };

  const updateFabricField = (index: number, field: keyof Fabric, value: any) => {
      setExtractedFabrics(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], [field]: value };
          return updated;
      });
  };

  const handleFinalSave = async () => {
    if (extractedFabrics.length === 0) return;
    setIsSaving(true);
    try {
        const finalFabrics: Fabric[] = extractedFabrics.map(data => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: data.name || 'Sin Nombre',
            supplier: data.supplier || 'Consultar',
            technicalSummary: data.technicalSummary || 'Sin datos técnicos disponibles.',
            specs: data.specs || { composition: 'N/A', martindale: 'N/A', usage: 'N/A' },
            colors: data.colors || [],
            colorImages: data.colorImages || {},
            mainImage: data.mainImage || '',
            category: selectedCategory,
            customCatalog: data.customCatalog, 
            pdfUrl: data.pdfUrl
        }));

        if (finalFabrics.length === 1) {
            await onSave(finalFabrics[0]);
        } else if (finalFabrics.length > 1 && onBulkSave) {
            await onBulkSave(finalFabrics);
        }
        
        // Only close if successful
        setTimeout(() => {
            setStep('upload');
            setFiles([]);
            setExtractedFabrics([]);
            onClose();
        }, 500);

    } catch (error: any) {
        console.error("Save error:", error);
        // Do NOT close the modal on error, allowing retry.
        // Error alert is handled in firebase.ts services layer now.
    } finally {
        setIsSaving(false);
    }
  };

  const triggerUpload = (fabricIndex: number, type: 'main' | 'color' | 'add_color', colorName?: string) => {
      setActiveUpload({ fabricIndex, type, colorName });
      singleImageInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl rounded-3xl p-8 shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
        {!isSaving && (
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black z-10">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        )}

        <h2 className="font-serif text-3xl mb-2 text-primary text-center flex-shrink-0">
            {step === 'review' ? 'Revisar antes de Guardar' : 'Subir Archivos'}
        </h2>
        {step === 'upload' && !isSaving && (
            <div className="flex justify-center mb-6">
                <div className="flex bg-gray-100 p-1 rounded-full">
                    <button 
                        onClick={() => setSelectedCategory('model')}
                        className={`px-6 py-2 rounded-full text-sm font-bold uppercase transition-all ${selectedCategory === 'model' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                        Colección Textil
                    </button>
                    <button 
                         onClick={() => setSelectedCategory('wood')}
                        className={`px-6 py-2 rounded-full text-sm font-bold uppercase transition-all ${selectedCategory === 'wood' ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                        Colección Maderas
                    </button>
                </div>
            </div>
        )}

        {isSaving ? (
             <div className="flex flex-col items-center justify-center flex-1 h-64 space-y-6 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                <div>
                    <p className="font-serif text-lg font-bold">Guardando en la Nube...</p>
                    <p className="text-xs text-gray-400 mt-2">Subiendo imágenes de ALTA CALIDAD a Firebase Storage.</p>
                    <p className="text-xs text-gray-300 mt-1">Si tarda mucho, revisa tu conexión a internet.</p>
                </div>
             </div>
        ) : (
            <>
                {step === 'upload' && (
                  <div className="space-y-6 flex-1 overflow-y-auto">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Option 1: Desktop Folder Upload */}
                        <label className="border-2 border-dashed border-gray-300 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors h-48 text-center relative group">
                            <svg className="w-10 h-10 text-gray-400 mb-3 group-hover:text-black transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                            <span className="font-bold text-gray-700 group-hover:text-black">Subir Carpeta (PC)</span>
                            <p className="text-xs text-gray-400 mt-1">Ideal para subir catálogos ordenados.</p>
                            <input 
                                type="file" 
                                {...({ webkitdirectory: "", directory: "" } as any)} 
                                multiple 
                                className="hidden" 
                                onChange={handleFolderChange} 
                            />
                        </label>

                        {/* Option 2: Mobile/Drive Upload */}
                        <label className="border-2 border-dashed border-blue-200 bg-blue-50/30 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 transition-colors h-48 text-center relative group">
                            <svg className="w-10 h-10 text-blue-500 mb-3 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="font-bold text-blue-800">Fotos / Drive (Móvil)</span>
                            <p className="text-xs text-blue-600 mt-1">Selecciona fotos sueltas de la galería o Drive.</p>
                            <input 
                                type="file" 
                                multiple 
                                accept="image/*,application/pdf" 
                                className="hidden" 
                                onChange={handleFilesChange} 
                            />
                        </label>
                    </div>

                    {files.length > 0 && (
                        <div className="bg-green-50 p-4 rounded-xl flex items-center justify-between border border-green-100">
                             <div className="flex items-center space-x-3">
                                 <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                 <span className="font-bold text-green-800">{files.length} archivos seleccionados</span>
                             </div>
                             <button onClick={() => setFiles([])} className="text-xs text-red-500 hover:underline">Borrar</button>
                        </div>
                    )}

                    <button 
                      onClick={processFiles}
                      disabled={files.length === 0}
                      className="w-full bg-primary text-white py-4 rounded-xl font-bold tracking-wide hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase shadow-md"
                    >
                      Procesar Archivos
                    </button>
                    
                    {onReset && (
                        <div className="pt-4 border-t border-gray-100 mt-4 text-center">
                            <button 
                                onClick={onReset}
                                className="text-red-400 text-xs font-bold uppercase tracking-widest hover:text-red-600 hover:underline"
                            >
                                Resetear Catálogo (Borrar Todo)
                            </button>
                        </div>
                    )}
                  </div>
                )}

                {step === 'processing' && (
                  <div className="flex flex-col items-center justify-center h-64 space-y-6 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                    <div>
                        <p className="font-serif text-lg animate-pulse">Analizando con Gemini AI...</p>
                        <p className="text-xs text-gray-400 mt-2">{currentProgress}</p>
                    </div>
                  </div>
                )}

                {step === 'review' && (
                  <div className="flex flex-col h-full overflow-hidden">
                     <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                         <div className="bg-green-50 p-4 rounded-xl mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-serif text-green-800">¡Análisis Completo!</h3>
                                <p className="text-xs text-green-600">Se han detectado {extractedFabrics.length} modelos. Revisa y selecciona qué subir.</p>
                            </div>
                         </div>
                         
                         {extractedFabrics.map((f, i) => (
                             <div key={i} className="flex flex-col gap-4 p-6 bg-gray-50 rounded-3xl border border-gray-100 transition-all hover:shadow-lg hover:bg-white relative">
                                 <div className="flex flex-col md:flex-row gap-6">
                                    <div className="relative group">
                                        <div className="w-24 h-24 md:w-32 md:h-32 flex-shrink-0 bg-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                            {f.mainImage ? (
                                                <img src={f.mainImage} alt="Main" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Img</div>
                                            )}
                                        </div>
                                        <button 
                                            onClick={() => triggerUpload(i, 'main')}
                                            className="absolute -top-3 -left-3 w-8 h-8 bg-white text-blue-600 rounded-full flex items-center justify-center shadow-md border border-gray-100 hover:scale-110 transition-transform z-10"
                                            title="Cambiar imagen principal"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                        </button>
                                    </div>

                                    <div className="flex-1 flex flex-col space-y-3">
                                        <div className="flex flex-col gap-2">
                                            <input 
                                                type="text" 
                                                value={f.name} 
                                                onChange={(e) => updateFabricField(i, 'name', e.target.value)}
                                                className="w-full p-4 bg-white rounded-xl border border-gray-200 font-serif text-3xl font-bold focus:ring-2 focus:ring-black outline-none shadow-sm"
                                                placeholder="Nombre del Modelo"
                                            />
                                            <input 
                                                type="text" 
                                                value={f.supplier} 
                                                onChange={(e) => updateFabricField(i, 'supplier', e.target.value)}
                                                className="w-full md:w-2/3 p-3 bg-white rounded-lg border border-gray-200 text-sm font-bold uppercase tracking-widest text-gray-500 focus:ring-1 focus:ring-black outline-none"
                                                placeholder="PROVEEDOR"
                                            />
                                        </div>
                                        
                                        <div className="flex items-center">
                                            <input 
                                                type="text" 
                                                value={f.customCatalog || ''} 
                                                onChange={(e) => updateFabricField(i, 'customCatalog', e.target.value)}
                                                className="text-sm text-blue-800 bg-blue-50/50 px-3 py-2 rounded-lg border border-blue-100 focus:border-blue-400 focus:outline-none w-full md:w-2/3 font-medium"
                                                placeholder="Catálogo (yo lo escribo)"
                                            />
                                        </div>

                                        <div className="mt-2">
                                            <div className="flex items-center space-x-2 mb-2">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">
                                                    {f.colors?.length || 0} Colores Detectados
                                                </p>
                                                <button 
                                                    onClick={() => triggerUpload(i, 'add_color')}
                                                    className="w-5 h-5 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-100 hover:bg-blue-100 transition-colors shadow-sm"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {f.colors?.map((c, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => triggerUpload(i, 'color', c)}
                                                        className="group relative w-8 h-8 rounded-full bg-gray-200 border-2 border-white shadow-sm overflow-hidden cursor-pointer hover:border-black transition-all" 
                                                    >
                                                        {f.colorImages && f.colorImages[c] ? (
                                                            <img src={f.colorImages[c]} alt={c} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full bg-gray-300"></div>
                                                        )}
                                                        <div className="absolute inset-0 bg-black/30 hidden group-hover:flex items-center justify-center">
                                                             <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        
                                        {expandedSpecsIndex === i && (
                                            <div className="mt-2 animate-fade-in">
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Resumen Técnico (Edición Rápida)</label>
                                                <textarea 
                                                    value={f.technicalSummary} 
                                                    onChange={(e) => updateFabricField(i, 'technicalSummary', e.target.value)}
                                                    className="w-full p-3 rounded-xl border border-gray-200 text-sm focus:ring-1 focus:ring-black outline-none bg-white min-h-[80px]"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-row md:flex-col items-start justify-start gap-2 pt-2">
                                         <button 
                                            onClick={() => removeFabricFromReview(i)}
                                            className="text-red-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors w-10 h-10 flex items-center justify-center"
                                         >
                                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                         </button>
                                         <button 
                                            onClick={() => setExpandedSpecsIndex(expandedSpecsIndex === i ? null : i)}
                                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${expandedSpecsIndex === i ? 'bg-black text-white' : 'text-gray-400 hover:text-black hover:bg-gray-100'}`}
                                        >
                                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                         </button>
                                    </div>
                                 </div>
                             </div>
                         ))}
                     </div>

                     <div className="pt-4 border-t border-gray-100 mt-2 flex gap-4">
                        <button 
                            onClick={() => { setStep('upload'); setFiles([]); }}
                            className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-xl font-bold tracking-wide hover:bg-gray-200 transition-all uppercase text-sm"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleFinalSave}
                            disabled={extractedFabrics.length === 0 || isSaving}
                            className="flex-[2] bg-black text-white py-4 rounded-xl font-bold tracking-wide hover:opacity-80 transition-all uppercase text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'Guardando...' : `Confirmar y Guardar (${extractedFabrics.length})`}
                        </button>
                     </div>
                     
                     <input ref={singleImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleSingleImageChange} />
                  </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default UploadModal;
