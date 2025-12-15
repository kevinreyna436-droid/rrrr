
import React, { useState, useRef, useEffect } from 'react';
import { extractFabricData, extractColorFromSwatch } from '../services/geminiService';
import { Fabric } from '../types';
import { compressImage } from '../utils/imageCompression';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (fabric: Fabric) => Promise<void> | void;
  onBulkSave?: (fabrics: Fabric[], onProgress?: (current: number, total: number) => void) => Promise<void> | void;
  onReset?: () => void;
  existingFabrics?: Fabric[]; 
}

// Helper for formatting during extraction
const toTitleCase = (str: string | undefined | null) => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSave, onBulkSave, onReset, existingFabrics = [] }) => {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [extractedFabrics, setExtractedFabrics] = useState<Partial<Fabric>[]>([]);
  
  const [currentProgress, setCurrentProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });
  const [selectedCategory, setSelectedCategory] = useState<'model' | 'wood'>('model');
  
  const singleImageInputRef = useRef<HTMLInputElement>(null);
  const [activeUpload, setActiveUpload] = useState<{ 
      fabricIndex: number; 
      type: 'main' | 'color' | 'add_color'; 
      colorName?: string; 
  } | null>(null);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (step === 'processing' || isSaving) {
        e.preventDefault();
        e.returnValue = "Progreso en curso.";
        return "Progreso en curso.";
      }
    };
    if (isOpen) window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOpen, step, isSaving]);

  if (!isOpen) return null;

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) setFiles(Array.from(e.target.files));
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) setFiles(Array.from(e.target.files));
  };
  
  const handleSingleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeUpload) {
        try {
            const file = e.target.files[0];
            const { fabricIndex, type, colorName } = activeUpload;
            const base64 = await compressImage(file, 1600, 0.75);

            setExtractedFabrics(prev => {
                const updated = [...prev];
                const fabric = { ...updated[fabricIndex] };
                if (type === 'main') fabric.mainImage = base64;
                else if (type === 'color' && colorName) {
                    fabric.colorImages = { ...fabric.colorImages, [colorName]: base64 };
                } else if (type === 'add_color') {
                    const newName = window.prompt("Nombre:", `Color ${(fabric.colors?.length || 0) + 1}`);
                    if (newName) {
                        fabric.colors = [...(fabric.colors || []), newName];
                        fabric.colorImages = { ...fabric.colorImages, [newName]: base64 };
                    }
                }
                updated[fabricIndex] = fabric;
                return updated;
            });
        } catch (err) {}
        setActiveUpload(null);
        if (singleImageInputRef.current) singleImageInputRef.current.value = '';
    }
  };

  const analyzeFileGroup = async (groupFiles: File[], groupName: string): Promise<Partial<Fabric>> => {
      const pdfFile = groupFiles.find(f => f.type === 'application/pdf');
      const imgFiles = groupFiles.filter(f => f.type.startsWith('image/'));
      let rawData: any = { name: "Unknown", supplier: "Unknown", technicalSummary: "", specs: {}, colors: [] };

      try {
        if (pdfFile) {
             // Procesar PDF con IA (Restaurado)
             const reader = new FileReader();
             await new Promise((resolve) => {
                 reader.onload = async (e) => { 
                     rawData.pdfUrl = e.target?.result;
                     try {
                        // Intentar extraer datos del PDF si es posible enviarlo
                        const b64 = (e.target?.result as string).split(',')[1];
                        const aiExtracted = await extractFabricData(b64, 'application/pdf');
                        // Merge safely
                        if (aiExtracted && aiExtracted.name !== 'Unknown') {
                            rawData = { ...rawData, ...aiExtracted };
                        }
                     } catch (err) {
                        console.warn("PDF AI Extraction failed, using fallback");
                     }
                     resolve(true); 
                 };
                 reader.readAsDataURL(pdfFile);
             });
        } 
        
        // Si no se extrajo nombre del PDF, o hay imagenes para analizar
        if ((!rawData.name || rawData.name === "Unknown") && imgFiles.length > 0) {
            const aiImg = await compressImage(imgFiles[0], 800, 0.6);
            const aiData = await extractFabricData(aiImg.split(',')[1], 'image/jpeg');
            // Mezclar datos, priorizando lo que ya tenemos si es bueno
            if (aiData) {
                rawData.name = rawData.name !== "Unknown" ? rawData.name : aiData.name;
                rawData.supplier = rawData.supplier !== "Unknown" ? rawData.supplier : aiData.supplier;
                rawData.technicalSummary = aiData.technicalSummary || rawData.technicalSummary;
                rawData.specs = { ...rawData.specs, ...aiData.specs };
            }
        }
      } catch (e) {}

      // Fallback name cleaning if IA completely failed or no API Key
      if (!rawData.name || rawData.name === "Unknown") {
         const cleanName = groupName.replace(/^(fromatex|creata)/i, '').trim();
         rawData.name = cleanName.length > 0 ? cleanName : "Sin Nombre";
      }

      // ENFORCE STYLE GUIDE FORMATTING IMMEDIATELY
      rawData.name = toTitleCase(rawData.name);
      rawData.supplier = rawData.supplier ? rawData.supplier.toUpperCase() : '';

      const colorImages: Record<string, string> = {};
      const colors = rawData.colors || [];
      
      let processed = 0;
      for (const file of imgFiles) {
          processed++;
          if (processed % 2 === 0) setCurrentProgress(`Procesando imágenes (${processed}/${imgFiles.length})...`);
          try {
              const b64 = await compressImage(file, 1000, 0.7);
              // Simple heuristic: Filename as color name, title cased
              const fName = toTitleCase(file.name.split('.')[0]);
              if (!colors.includes(fName)) colors.push(fName);
              colorImages[fName] = b64;
          } catch(e) {}
      }

      return {
          ...rawData,
          colors,
          colorImages,
          mainImage: Object.values(colorImages)[0] || '',
          category: selectedCategory
      };
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    setStep('processing');
    
    // Group files by directory
    const groups: Record<string, File[]> = {};
    files.forEach(f => {
        const key = f.webkitRelativePath ? f.webkitRelativePath.split('/')[1] : 'Lote';
        if (!groups[key]) groups[key] = [];
        groups[key].push(f);
    });

    const results: Partial<Fabric>[] = [];
    const keys = Object.keys(groups);

    for (let i = 0; i < keys.length; i++) {
        setCurrentProgress(`Analizando grupo ${i+1} de ${keys.length}...`);
        await new Promise(r => setTimeout(r, 1000)); 
        try {
            const data = await analyzeFileGroup(groups[keys[i]], keys[i]);
            results.push(data);
        } catch (e) { console.error(e); }
    }

    if (results.length > 0) {
        setExtractedFabrics(results);
        setStep('review');
    } else {
        alert("No se pudo extraer información. Por favor revisa los archivos.");
        setStep('upload');
    }
  };

  const handleFinalSave = async () => {
    if (extractedFabrics.length === 0) return;
    setIsSaving(true);
    
    try {
        const finalFabrics: Fabric[] = extractedFabrics.map(data => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            name: toTitleCase(data.name || 'Sin Nombre'), // Ensure Title Case
            supplier: (data.supplier || 'General').toUpperCase(), // Ensure Uppercase
            technicalSummary: data.technicalSummary || '',
            specs: data.specs || { composition: '', martindale: '', usage: '' },
            colors: data.colors || [],
            colorImages: data.colorImages || {},
            mainImage: data.mainImage || '',
            category: selectedCategory,
            customCatalog: data.customCatalog,
            pdfUrl: data.pdfUrl,
            createdAt: Date.now()
        }));

        if (finalFabrics.length === 1) {
            await onSave(finalFabrics[0]);
        } else if (onBulkSave) {
            await onBulkSave(finalFabrics, (c, t) => setSaveProgress({ current: c, total: t }));
        }
        
        // Success
        setTimeout(() => {
            onClose();
            setFiles([]);
            setStep('upload');
        }, 500);

    } catch (e) {
        alert("Hubo un error guardando. Intenta subir menos fotos a la vez o verifica tu internet.");
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
        {!isSaving && <button onClick={onClose} className="absolute top-4 right-4 text-gray-400">✕</button>}

        <h2 className="font-serif text-3xl mb-2 text-center">
            {step === 'review' ? 'Revisar' : 'Subir'}
        </h2>

        {step === 'upload' && !isSaving && (
             <div className="flex flex-col gap-4 overflow-y-auto">
                 <div className="flex justify-center mb-4">
                    <button onClick={() => setSelectedCategory('model')} className={`px-4 py-2 rounded-l-full ${selectedCategory === 'model' ? 'bg-black text-white' : 'bg-gray-100'}`}>Textil</button>
                    <button onClick={() => setSelectedCategory('wood')} className={`px-4 py-2 rounded-r-full ${selectedCategory === 'wood' ? 'bg-black text-white' : 'bg-gray-100'}`}>Maderas</button>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <label className="border-2 border-dashed border-gray-300 p-8 text-center rounded-xl cursor-pointer hover:bg-gray-50">
                        <span className="font-bold block">Carpeta (PC)</span>
                        <input type="file" {...({ webkitdirectory: "", directory: "" } as any)} multiple className="hidden" onChange={handleFolderChange} />
                    </label>
                    <label className="border-2 border-dashed border-blue-200 bg-blue-50/50 p-8 text-center rounded-xl cursor-pointer hover:bg-blue-50">
                        <span className="font-bold block text-blue-800">Fotos (Móvil)</span>
                        <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={handleFilesChange} />
                    </label>
                 </div>
                 {files.length > 0 && <p className="text-center text-green-600 font-bold">{files.length} archivos</p>}
                 <button onClick={processFiles} disabled={files.length===0} className="bg-black text-white py-4 rounded-xl font-bold disabled:opacity-50">PROCESAR</button>
                 {onReset && <button onClick={onReset} className="text-red-400 text-xs mt-4">BORRAR TODO</button>}
             </div>
        )}

        {step === 'processing' && (
            <div className="flex flex-col items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
                <p className="animate-pulse">Analizando con IA...</p>
                <p className="text-xs text-gray-400 mt-2">{currentProgress}</p>
            </div>
        )}

        {isSaving && (
             <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
                <p className="font-bold">Guardando en Nube...</p>
                <p className="text-xs text-gray-500 mt-2 max-w-xs">Si falla la conexión, se guardará en modo texto automáticamente.</p>
                {saveProgress.total > 1 && <p className="text-sm mt-2">{saveProgress.current} / {saveProgress.total}</p>}
             </div>
        )}

        {step === 'review' && !isSaving && (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    {extractedFabrics.map((f, i) => (
                        <div key={i} className="flex gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                             <div className="relative w-20 h-20 bg-gray-200 rounded-lg flex-shrink-0 cursor-pointer" onClick={() => triggerUpload(i, 'main')}>
                                 {f.mainImage && <img src={f.mainImage} className="w-full h-full object-cover rounded-lg" />}
                             </div>
                             <div className="flex-1">
                                 {/* SAFEGUARD: Use || '' to prevent uncontrolled input warning and crashes */}
                                 <input 
                                    value={f.name || ''} 
                                    onChange={e => { const up = [...extractedFabrics]; up[i].name = e.target.value; setExtractedFabrics(up); }} 
                                    className="font-serif font-bold text-lg bg-transparent w-full border-b border-gray-200 focus:border-black outline-none" 
                                    placeholder="Nombre Modelo (Ej: Alanis)" 
                                 />
                                 <input 
                                    value={f.supplier || ''} 
                                    onChange={e => { const up = [...extractedFabrics]; up[i].supplier = e.target.value.toUpperCase(); setExtractedFabrics(up); }} 
                                    className="text-xs uppercase tracking-widest text-gray-500 bg-transparent w-full mt-1" 
                                    placeholder="PROVEEDOR (Ej: FORMATEX)" 
                                 />
                                 <div className="flex flex-wrap gap-1 mt-2">
                                     {f.colors?.map((c, ci) => (
                                         <span key={ci} className="text-[10px] bg-white border border-gray-200 px-2 py-1 rounded-full">{c}</span>
                                     ))}
                                 </div>
                             </div>
                             <button onClick={() => setExtractedFabrics(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">✕</button>
                        </div>
                    ))}
                </div>
                <div className="flex gap-4 mt-4 pt-4 border-t">
                    <button onClick={() => { setStep('upload'); setFiles([]); }} className="flex-1 py-3 text-gray-500 font-bold">CANCELAR</button>
                    <button onClick={handleFinalSave} className="flex-[2] bg-black text-white py-3 rounded-xl font-bold shadow-lg">GUARDAR ({extractedFabrics.length})</button>
                </div>
                <input ref={singleImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleSingleImageChange} />
            </div>
        )}
      </div>
    </div>
  );
};

export default UploadModal;
