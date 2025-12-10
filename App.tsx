
import React, { useState, useEffect } from 'react';
import FabricCard from './components/FabricCard';
import FabricDetail from './components/FabricDetail';
import UploadModal from './components/UploadModal';
import ChatBot from './components/ChatBot';
import PinModal from './components/PinModal';
import ImageGenModal from './components/ImageGenModal';
import { INITIAL_FABRICS } from './constants';
import { Fabric, AppView } from './types';
import { 
  getFabricsFromFirestore, 
  saveFabricToFirestore, 
  saveBatchFabricsToFirestore, 
  deleteFabricFromFirestore, 
  clearFirestoreCollection,
  isOfflineMode,
  retryFirebaseConnection,
  testStorageConnection
} from './services/firebase';

// Type for Sorting
type SortOption = 'color' | 'name' | 'model' | 'supplier';

export default function App() {
  const [view, setView] = useState<AppView>('grid');
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [selectedFabricId, setSelectedFabricId] = useState<string | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isPinModalOpen, setPinModalOpen] = useState(false); // PIN Modal State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'model' | 'color' | 'wood'>('model');
  const [loading, setLoading] = useState(true);
  const [offlineStatus, setOfflineStatus] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{success: boolean; message: string} | null>(null);
  
  // Sorting State - Default "color"
  const [sortBy, setSortBy] = useState<SortOption>('color');
  const [isFilterMenuOpen, setFilterMenuOpen] = useState(false);

  // State for Color View Lightbox (Global Grid)
  const [colorLightbox, setColorLightbox] = useState<{
    isOpen: boolean;
    image: string;
    fabricId: string;
    colorName: string;
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const dbData = await getFabricsFromFirestore();
      
      // Update offline status after fetch attempt
      setOfflineStatus(isOfflineMode());

      if (dbData && dbData.length > 0) {
        // DEDUPLICATION LOGIC:
        const uniqueFabrics: Fabric[] = [];
        const seenNames = new Set<string>();

        dbData.forEach(fabric => {
            const normalizedName = fabric.name.trim().toLowerCase();
            if (!seenNames.has(normalizedName)) {
                seenNames.add(normalizedName);
                uniqueFabrics.push(fabric);
            }
        });

        setFabrics(uniqueFabrics);
      } else {
        // FALLBACK: If DB is empty, use INITIAL_FABRICS (which is now empty)
        setFabrics(INITIAL_FABRICS); 
      }
    } catch (e: any) {
      console.error("Error loading data", e?.message || "Unknown error");
      setFabrics([]); // Start empty on error
    } finally {
      setLoading(false);
    }
  };

  // Run diagnostic on mount
  useEffect(() => {
    const runDiag = async () => {
        const result = await testStorageConnection();
        setDiagnosticResult(result);
        // Hide success message after 5 seconds, keep error persistent until clicked
        if (result.success) {
            setTimeout(() => setDiagnosticResult(null), 5000);
        }
    };
    if (!isOfflineMode()) {
        runDiag();
    }
    loadData();
  }, []);

  const handleRetryConnection = async () => {
      setLoading(true);
      const success = await retryFirebaseConnection();
      if (success) {
          setOfflineStatus(false);
          await loadData();
          const result = await testStorageConnection();
          setDiagnosticResult(result);
      } else {
          alert("No se pudo conectar. Seguimos en modo local.");
      }
      setLoading(false);
  };

  const handleDiagnostic = async () => {
      const result = await testStorageConnection();
      alert(`DIAGNÓSTICO DE NUBE:\n\n${result.message}\n\nSuccess: ${result.success}`);
  };

  const handleUploadClick = () => {
      setPinModalOpen(true);
  };

  const handleFabricClick = (fabric: Fabric, specificColor?: string) => {
    if (activeTab === 'model') {
        setSelectedFabricId(fabric.id);
        setView('detail');
    } else {
        const img = specificColor && fabric.colorImages?.[specificColor] 
            ? fabric.colorImages[specificColor] 
            : fabric.mainImage;
            
        setColorLightbox({
            isOpen: true,
            image: img || '', // Handle potentially empty image for lightbox
            fabricId: fabric.id,
            colorName: specificColor || 'Unknown'
        });
    }
  };

  const handleSaveFabric = async (newFabric: Fabric) => {
    try {
      setFabrics(prev => {
          const exists = prev.some(f => f.name.toLowerCase() === newFabric.name.toLowerCase());
          if (exists) return prev;
          return [newFabric, ...prev];
      });
      await saveFabricToFirestore(newFabric);
      setOfflineStatus(isOfflineMode()); // Update status after save attempt
    } catch (e: any) {
      console.error("Error saving fabric:", e?.message || "Unknown error");
    }
  };

  const handleBulkSaveFabrics = async (newFabrics: Fabric[]) => {
    try {
      setFabrics(prev => {
          const currentNames = new Set(prev.map(f => f.name.toLowerCase()));
          const uniqueNew = newFabrics.filter(f => !currentNames.has(f.name.toLowerCase()));
          return [...uniqueNew, ...prev];
      });
      await saveBatchFabricsToFirestore(newFabrics);
      setOfflineStatus(isOfflineMode()); // Update status after save attempt
    } catch (e: any) {
      console.error("Error bulk saving:", e?.message || "Unknown error");
    }
  };

  const handleUpdateFabric = async (updatedFabric: Fabric) => {
    try {
      setFabrics(prev => prev.map(f => f.id === updatedFabric.id ? updatedFabric : f));
      await saveFabricToFirestore(updatedFabric);
      setOfflineStatus(isOfflineMode()); // Update status after save attempt
    } catch (e: any) {
      console.error("Error updating fabric:", e?.message || "Unknown error");
    }
  };

  const handleDeleteFabric = async (fabricId: string) => {
      try {
          setFabrics(prev => prev.filter(f => f.id !== fabricId));
          setView('grid');
          setSelectedFabricId(null);
          await deleteFabricFromFirestore(fabricId);
          setOfflineStatus(isOfflineMode()); // Update status after delete attempt
      } catch (e: any) {
          console.error("Error deleting fabric:", e?.message || "Unknown error");
          alert("Hubo un error al eliminar la ficha.");
      }
  };

  const handleReset = async () => {
      if(window.confirm("¿Estás seguro de que quieres borrar TODA la información? Esto reiniciará la base de datos y permitirá reconectar si la nube estaba caída.")) {
          try {
            setFabrics([]);
            await clearFirestoreCollection();
            setUploadModalOpen(false);
            setOfflineStatus(false); // Optimistically reset status
            alert("Catálogo reseteado. Recarga la página para verificar conexión.");
            window.location.reload();
          } catch (e: any) {
            console.error("Error resetting collection:", e?.message || "Unknown error");
            alert("Error al resetear la base de datos.");
          }
      }
  };

  const goToDetailFromLightbox = () => {
    if (colorLightbox) {
        setSelectedFabricId(colorLightbox.fabricId);
        setView('detail');
        setColorLightbox(null);
    }
  };

  const getColorWeight = (colorName: string): number => {
      if (!colorName) return 50;
      const name = colorName.toLowerCase();
      if (name.includes('white') || name.includes('snow') || name.includes('ivory') || name.includes('blanco') || name.includes('nieve')) return 100;
      if (name.includes('cream') || name.includes('bone') || name.includes('hueso') || name.includes('crema') || name.includes('pearl')) return 95;
      if (name.includes('natural') || name.includes('linen') || name.includes('lino') || name.includes('ecru') || name.includes('cotton')) return 90;
      if (name.includes('beige') || name.includes('sand') || name.includes('arena') || name.includes('oyster') || name.includes('flax')) return 85;
      if (name.includes('champagne') || name.includes('mist') || name.includes('fog')) return 80;
      if (name.includes('silver') || name.includes('plata') || name.includes('platinum')) return 70;
      if (name.includes('light grey') || name.includes('pale')) return 65;
      if (name.includes('grey') || name.includes('gris') || name.includes('stone') || name.includes('piedra') || name.includes('zinc') || name.includes('pewter')) return 50;
      if (name.includes('gold') || name.includes('yellow') || name.includes('mustard')) return 45;
      if (name.includes('orange') || name.includes('terra') || name.includes('brick')) return 40;
      if (name.includes('red') || name.includes('rose') || name.includes('pink') || name.includes('coral')) return 35;
      if (name.includes('green') || name.includes('olive') || name.includes('moss') || name.includes('emerald')) return 30;
      if (name.includes('blue') || name.includes('sky') || name.includes('aqua') || name.includes('teal')) return 25;
      if (name.includes('navy') || name.includes('midnight') || name.includes('indigo') || name.includes('dark')) return 15;
      if (name.includes('charcoal') || name.includes('anthracite') || name.includes('slate') || name.includes('graphite')) return 10;
      if (name.includes('black') || name.includes('negro') || name.includes('ebony') || name.includes('onyx') || name.includes('caviar')) return 0;
      return 50;
  };

  const getFilteredItems = () => {
    let items = [...fabrics];
    if (searchQuery) {
        items = items.filter(f => 
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (f.colors || []).some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }
    return items;
  };

  const getSortedColorCards = () => {
      const items = getFilteredItems();
      const allColorCards = items.flatMap((fabric) => 
          (fabric.colors || []).map((colorName) => ({
              fabric,
              colorName
          }))
      );

      allColorCards.sort((a, b) => {
          if (sortBy === 'color') {
              const weightA = getColorWeight(a.colorName);
              const weightB = getColorWeight(b.colorName);
              return weightB - weightA; 
          }
          if (sortBy === 'name') return a.colorName.localeCompare(b.colorName, 'es', { sensitivity: 'base' });
          if (sortBy === 'model') {
              const modelCompare = a.fabric.name.localeCompare(b.fabric.name, 'es', { sensitivity: 'base' });
              if (modelCompare !== 0) return modelCompare;
              return a.colorName.localeCompare(b.colorName, 'es', { sensitivity: 'base' });
          }
          if (sortBy === 'supplier') {
              const suppCompare = a.fabric.supplier.localeCompare(b.fabric.supplier, 'es', { sensitivity: 'base' });
              if (suppCompare !== 0) return suppCompare;
               return a.fabric.name.localeCompare(b.fabric.name, 'es', { sensitivity: 'base' });
          }
          return 0;
      });
      return allColorCards;
  };

  const handleGlobalNav = (direction: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!colorLightbox) return;
    
    const cards = getSortedColorCards();
    const currentIndex = cards.findIndex(c => c.fabric.id === colorLightbox.fabricId && c.colorName === colorLightbox.colorName);
    
    if (currentIndex === -1) return;

    const newIndex = (currentIndex + direction + cards.length) % cards.length;
    const newItem = cards[newIndex];
    
    const img = newItem.colorName && newItem.fabric.colorImages?.[newItem.colorName]
        ? newItem.fabric.colorImages[newItem.colorName]
        : newItem.fabric.mainImage;

    setColorLightbox({
        isOpen: true,
        image: img || '',
        fabricId: newItem.fabric.id,
        colorName: newItem.colorName
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (colorLightbox) {
            if (e.key === 'ArrowRight') handleGlobalNav(1);
            if (e.key === 'ArrowLeft') handleGlobalNav(-1);
            if (e.key === 'Escape') setColorLightbox(null);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [colorLightbox]);

  const renderGridContent = () => {
    const items = getFilteredItems();

    if (activeTab === 'wood') {
        return (
            <div className="text-center py-20 text-gray-400">
                <h3 className="font-serif text-xl italic">Colección de maderas próximamente</h3>
            </div>
        );
    }

    if (activeTab === 'model') {
        items.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
        return items.map((fabric, idx) => (
            <FabricCard 
                key={fabric.id} 
                fabric={fabric}
                mode="model"
                onClick={() => handleFabricClick(fabric)}
                index={idx}
            />
        ));
    }

    if (activeTab === 'color') {
        const sortedCards = getSortedColorCards();
        return sortedCards.map((item, idx) => (
            <FabricCard
                key={`${item.fabric.id}-${item.colorName}-${idx}`}
                fabric={item.fabric}
                mode="color"
                specificColorName={item.colorName}
                onClick={() => handleFabricClick(item.fabric, item.colorName)}
                index={idx}
            />
        ));
    }
  };

  const filteredItemCount = getFilteredItems().length;

  return (
    <div className="min-h-screen bg-[rgb(241,242,244)] text-primary font-sans selection:bg-black selection:text-white relative">
      
      {/* Diagnostic Toast */}
      {diagnosticResult && (
         <div 
            className={`fixed top-16 left-1/2 transform -translate-x-1/2 z-[200] px-6 py-3 rounded-full shadow-lg border flex items-center space-x-3 transition-all animate-fade-in-down cursor-pointer
                ${diagnosticResult.success ? 'bg-green-100 border-green-200 text-green-800' : 'bg-red-100 border-red-200 text-red-800'}
            `}
            onClick={() => setDiagnosticResult(null)}
         >
            <div className={`w-3 h-3 rounded-full ${diagnosticResult.success ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs font-bold">{diagnosticResult.message}</span>
            <span className="text-[10px] opacity-60 ml-2">(Click para cerrar)</span>
         </div>
      )}

      {/* Connection Status Indicator */}
      <div className="fixed top-4 left-4 z-50 flex items-center space-x-2">
         {offlineStatus ? (
             <div className="flex items-center space-x-2 bg-red-100 text-red-600 px-3 py-1 rounded-full border border-red-200 shadow-sm animate-pulse cursor-pointer" onClick={handleRetryConnection} title="Intentar Reconectar">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-[10px] font-bold uppercase tracking-wide">Modo Offline</span>
                <span className="text-[9px] underline ml-1">Reconectar</span>
             </div>
         ) : (
            <div 
                onClick={handleDiagnostic}
                className="flex items-center space-x-2 bg-white/80 backdrop-blur text-green-600 px-3 py-1 rounded-full border border-green-100 shadow-sm cursor-pointer hover:bg-green-50 transition-colors"
                title="Click para Diagnóstico de Subida"
            >
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-[10px] font-bold uppercase tracking-wide">Nube Conectada</span>
             </div>
         )}
      </div>

      <button 
        onClick={handleUploadClick}
        className="fixed top-4 right-4 z-50 text-gray-300 hover:text-black font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors"
        title="Subir Archivos / Gestionar"
      >
        .
      </button>

      {/* PIN Modal for Upload */}
      <PinModal 
        isOpen={isPinModalOpen} 
        onClose={() => setPinModalOpen(false)} 
        onSuccess={() => setUploadModalOpen(true)} 
      />

      {(view === 'grid' || view === 'list') && (
        <header className="pt-16 pb-12 px-6 flex flex-col items-center space-y-8 animate-fade-in-down relative">
            
            <h1 className="font-serif text-6xl md:text-8xl font-bold text-center tracking-tight text-slate-900 leading-none">
                Catálogo de telas
            </h1>
            
            <div className="flex space-x-8 md:space-x-12 border-b border-transparent">
                <button 
                    onClick={() => { setActiveTab('model'); setFilterMenuOpen(false); setView('grid'); }}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors ${
                        activeTab === 'model' && view === 'grid' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Ver modelos
                </button>
                <button 
                    onClick={() => { setActiveTab('color'); setView('grid'); }}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors ${
                        activeTab === 'color' && view === 'grid' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Ver colores
                </button>
                <button 
                    onClick={() => { setView('list'); setFilterMenuOpen(false); }}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors ${
                        view === 'list' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Historial (Lista)
                </button>
            </div>
            
            <div className="flex flex-row items-center gap-3 w-full max-w-2xl relative">
                <div className="relative flex-grow">
                  <input 
                    type="text" 
                    placeholder="Buscar..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-full py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder-gray-400 transition-shadow hover:shadow-sm shadow-sm"
                  />
                  <svg className="absolute left-4 top-3.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>

                {activeTab === 'color' && view === 'grid' && (
                    <div className="relative">
                        <button 
                            onClick={() => setFilterMenuOpen(!isFilterMenuOpen)}
                            className={`w-11 h-11 flex items-center justify-center rounded-full border transition-all ${isFilterMenuOpen ? 'bg-black text-white border-black' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            title="Filtrar colores"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="6" x2="20" y2="6"></line>
                                <line x1="4" y1="12" x2="16" y2="12"></line>
                                <line x1="4" y1="18" x2="10" y2="18"></line>
                            </svg>
                        </button>

                        {isFilterMenuOpen && (
                            <div className="absolute right-0 top-full mt-3 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 overflow-hidden animate-fade-in">
                                <div className="px-4 py-2 text-[10px] uppercase font-bold text-gray-400 tracking-wider">Ordenar Por</div>
                                <button 
                                    onClick={() => { setSortBy('color'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'color' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Color (Claro a Fuerte)</span>
                                    {sortBy === 'color' && <span className="text-black">•</span>}
                                </button>
                                <button 
                                    onClick={() => { setSortBy('name'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'name' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Nombre (A-Z)</span>
                                    {sortBy === 'name' && <span className="text-black">•</span>}
                                </button>
                                <button 
                                    onClick={() => { setSortBy('model'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'model' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Por Modelo</span>
                                    {sortBy === 'model' && <span className="text-black">•</span>}
                                </button>
                                <button 
                                    onClick={() => { setSortBy('supplier'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'supplier' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Por Proveedor</span>
                                    {sortBy === 'supplier' && <span className="text-black">•</span>}
                                </button>
                            </div>
                        )}
                        
                        {isFilterMenuOpen && (
                            <div className="fixed inset-0 z-40" onClick={() => setFilterMenuOpen(false)}></div>
                        )}
                    </div>
                )}
            </div>
        </header>
      )}

      <main>
        {view === 'grid' && (
          <div className="container mx-auto px-6 pb-20 flex flex-col items-center">
            {loading ? (
                <div className="flex justify-center items-center py-20">
                   <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
                </div>
            ) : filteredItemCount === 0 && activeTab !== 'wood' ? (
                <div className="text-center py-20 text-gray-300">
                     <p>El catálogo está vacío.</p>
                     {offlineStatus && <p className="text-xs mt-2 text-red-300">Revisa que la base de datos esté creada en Firebase Console.</p>}
                     <div className="mt-4">
                        <button 
                           onClick={handleUploadClick}
                           className="bg-black text-white px-6 py-3 rounded-full text-sm font-bold uppercase tracking-wide hover:scale-105 transition-transform"
                        >
                           Empezar a Cargar Telas
                        </button>
                     </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-5 gap-6 xl:gap-8 w-full max-w-[1920px] justify-center">
                    {renderGridContent()}
                </div>
            )}
          </div>
        )}

        {view === 'list' && (
             <div className="container mx-auto px-4 md:px-10 pb-20">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden relative">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 pl-8 text-xs font-bold uppercase text-gray-400 tracking-wider w-1/4">Modelo</th>
                                <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider w-1/4">Proveedor</th>
                                <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider w-1/4">Colección</th>
                                <th className="p-4 text-xs font-bold uppercase text-gray-400 tracking-wider text-right pr-8">Colores</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                             {getFilteredItems().sort((a,b) => a.name.localeCompare(b.name)).map((f) => (
                                 <tr 
                                    key={f.id} 
                                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                                    onClick={() => { setSelectedFabricId(f.id); setView('detail'); }}
                                >
                                     <td className="p-4 pl-8">
                                         <span className="font-serif font-bold text-slate-800 text-lg group-hover:text-black">{f.name}</span>
                                     </td>
                                     <td className="p-4">
                                         <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">{f.supplier}</span>
                                     </td>
                                     <td className="p-4">
                                         <span className="text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-500 uppercase">{f.category === 'wood' ? 'Maderas' : f.customCatalog || 'Textil'}</span>
                                     </td>
                                     <td className="p-4 pr-8 text-right">
                                         <span className="text-sm font-bold text-black">{f.colors?.length || 0}</span>
                                     </td>
                                 </tr>
                             ))}
                             {getFilteredItems().length === 0 && (
                                 <tr>
                                     <td colSpan={4} className="p-8 text-center text-gray-400 italic">No hay resultados en el historial.</td>
                                 </tr>
                             )}
                        </tbody>
                    </table>
                </div>
             </div>
        )}

        {view === 'detail' && selectedFabricId && (
          <FabricDetail 
            fabric={fabrics.find(f => f.id === selectedFabricId)!} 
            onBack={() => setView('grid')}
            onEdit={handleUpdateFabric}
            onDelete={handleDeleteFabric}
          />
        )}
        
        {view === 'generator' && (
            <ImageGenModal onClose={() => setView('grid')} />
        )}
      </main>

      {colorLightbox && (
        <div 
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center cursor-pointer p-4 md:p-8"
            onClick={() => setColorLightbox(null)}
        >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-all duration-500"></div>
            
            <div className="absolute top-10 z-[110] animate-fade-in-down flex gap-2">
                <button 
                    onClick={(e) => { e.stopPropagation(); goToDetailFromLightbox(); }}
                    className="bg-black text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl hover:bg-gray-800 transition-transform hover:scale-105 border border-white/10"
                >
                    Ver Detalle de la tela
                </button>
            </div>
            
            <button 
              onClick={(e) => handleGlobalNav(-1, e)}
              className="absolute left-2 md:left-8 text-white/80 hover:text-white hover:scale-110 transition-all p-3 z-[110] bg-black/20 rounded-full backdrop-blur-sm border border-white/10"
            >
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div 
                className="relative z-[105] bg-white shadow-2xl rounded-sm overflow-hidden flex items-center justify-center border border-white/10 
                           w-[90vw] h-[90vw] md:w-[80vh] md:h-[80vh]"
                onClick={(e) => e.stopPropagation()}
            >
                 {colorLightbox.image ? (
                     <img 
                        src={colorLightbox.image} 
                        alt={colorLightbox.colorName} 
                        className="w-full h-full object-contain"
                     />
                 ) : (
                     <div className="flex flex-col items-center justify-center text-gray-300">
                         <svg className="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                         <span className="text-xs uppercase tracking-widest">Sin Imagen</span>
                     </div>
                 )}
            </div>

            <button 
              onClick={(e) => handleGlobalNav(1, e)}
              className="absolute right-2 md:right-8 text-white/80 hover:text-white hover:scale-110 transition-all p-3 z-[110] bg-black/20 rounded-full backdrop-blur-sm border border-white/10"
            >
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
            
            <button 
                onClick={() => setColorLightbox(null)}
                className="absolute top-8 right-8 z-[110] text-white/70 hover:text-white"
            >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
      )}

      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setUploadModalOpen(false)} 
        onSave={handleSaveFabric} 
        onBulkSave={handleBulkSaveFabrics}
        onReset={handleReset}
      />

      <ChatBot />

    </div>
  );
}
