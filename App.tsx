
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
type SortOption = 'newest' | 'color' | 'name' | 'model' | 'supplier';

export default function App() {
  const [view, setView] = useState<AppView>('grid');
  
  // STRATEGY CHANGE: Start with Demo Data immediately so the user sees something instantly.
  // We will replace this if DB data loads successfully.
  const [fabrics, setFabrics] = useState<Fabric[]>(INITIAL_FABRICS);
  const [isDemoMode, setIsDemoMode] = useState(true);
  
  const [selectedFabricId, setSelectedFabricId] = useState<string | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isPinModalOpen, setPinModalOpen] = useState(false); // PIN Modal State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'model' | 'color' | 'wood'>('model');
  const [loading, setLoading] = useState(true); // Still show a small spinner, but data is visible underneath if we wanted
  const [offlineStatus, setOfflineStatus] = useState(false);
  
  // Toast Notification State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  
  // Sorting State - Default "newest" for immediate feedback
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [isFilterMenuOpen, setFilterMenuOpen] = useState(false);

  // State for Color View Lightbox (Global Grid)
  const [colorLightbox, setColorLightbox] = useState<{
    isOpen: boolean;
    image: string;
    fabricId: string;
    colorName: string;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    // We don't set fabrics to empty [] here, we keep INITIAL_FABRICS until we know better
    setLoading(true);
    try {
      const dbData = await getFabricsFromFirestore();
      
      // Update offline status after fetch attempt
      setOfflineStatus(isOfflineMode());

      if (dbData && dbData.length > 0) {
        // DEDUPLICATION LOGIC:
        const seenNames = new Set<string>();
        const loadedFabrics: Fabric[] = [];

        dbData.forEach(fabric => {
            // Safety check for critical fields
            if (!fabric.name) return;
            
            const normalizedName = fabric.name.trim().toLowerCase();
            if (!seenNames.has(normalizedName)) {
                seenNames.add(normalizedName);
                loadedFabrics.push(fabric);
            }
        });
        
        // Only override if we actually got valid data
        if (loadedFabrics.length > 0) {
            setFabrics(loadedFabrics);
            setIsDemoMode(false);
        }
      } else {
        // DB is empty, stick with INITIAL_FABRICS (already set)
        console.log("DB Empty, showing Demo Data");
        setIsDemoMode(true); 
      }

      // DEEP LINK CHECK: After loading data, check if URL has an ID
      const params = new URLSearchParams(window.location.search);
      const linkedId = params.get('fabricId');
      
      if (linkedId) {
          const currentList = dbData && dbData.length > 0 ? dbData : INITIAL_FABRICS;
          const found = currentList.find(f => f.id === linkedId);

          if (found) {
              setSelectedFabricId(linkedId);
              setView('detail');
          } else {
              showToast("La ficha del enlace no existe.", 'error');
          }
      }

    } catch (e: any) {
      console.error("Error loading data", e?.message || "Unknown error");
      // Don't show toast immediately to avoid annoying user on first load if it's just offline
      // setFabrics(INITIAL_FABRICS); // Keep demo data
      setIsDemoMode(true);
    } finally {
      setLoading(false);
    }
  };

  // Run diagnostic on mount & Handle Browser Back Button
  useEffect(() => {
    // Initial Load Sequence
    const init = async () => {
        await loadData();
        
        // Only run connection test if we are NOT in demo mode (meaning we think we have data) 
        // OR if we want to debug why it failed.
        // We run it silently to update status icon.
        const diag = await testStorageConnection();
        if (!diag.success && !diag.message.includes("Offline")) {
             console.warn("Storage check failed:", diag.message);
        }
    };
    init();
    
    // Offline/Online listeners
    window.addEventListener('online', () => { setOfflineStatus(false); loadData(); }); // Reload on reconnect
    window.addEventListener('offline', () => setOfflineStatus(true));

    // Handle Browser Back/Forward buttons
    const handlePopState = () => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('fabricId');
        if (id) {
            setSelectedFabricId(id);
            setView('detail');
        } else {
            setView('grid');
            setSelectedFabricId(null);
        }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
        window.removeEventListener('online', () => setOfflineStatus(false));
        window.removeEventListener('offline', () => setOfflineStatus(true));
        window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleRetryConnection = async () => {
      setLoading(true);
      const success = await retryFirebaseConnection();
      if (success) {
          setOfflineStatus(false);
          await loadData();
          showToast("Conexión restablecida", 'success');
      } else {
          showToast("No se pudo conectar. Seguimos en modo offline.", 'error');
      }
      setLoading(false);
  };

  const handleCloudRefresh = async () => {
      setLoading(true);
      await loadData();
      showToast("Sincronizado con la nube", 'success');
  };

  const handleUploadClick = () => {
      setPinModalOpen(true);
  };

  const handleFabricClick = (fabric: Fabric, specificColor?: string) => {
    if (activeTab === 'model' || activeTab === 'wood') {
        setSelectedFabricId(fabric.id);
        setView('detail');
        
        // DEEP LINKING: Update URL without reloading
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('fabricId', fabric.id);
        window.history.pushState({}, '', newUrl);

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

  // Logic to return to grid and clear URL
  const handleBackToGrid = () => {
      setView('grid');
      setSelectedFabricId(null);
      
      // DEEP LINKING: Remove param from URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('fabricId');
      window.history.pushState({}, '', newUrl.pathname + newUrl.search);
  };

  const handleSaveFabric = async (newFabric: Fabric) => {
    try {
      // Optimistic Update
      setFabrics(prev => {
          // If we were in demo mode, clear demo data and start with real data
          if (isDemoMode) return [newFabric];
          return [newFabric, ...prev];
      });
      setIsDemoMode(false); // Disable demo mode immediately on first upload

      await saveFabricToFirestore(newFabric);
      setOfflineStatus(isOfflineMode()); 
      showToast("Ficha guardada en la nube correctamente.", 'success');
      setSortBy('newest'); // Auto-switch to newest so user sees it
    } catch (e: any) {
      console.error("Error saving fabric:", e?.message || "Unknown error");
      showToast("Guardado localmente (Error Nube). Se subirá al reconectar.", 'info');
    }
  };

  const handleBulkSaveFabrics = async (newFabrics: Fabric[], onProgress?: (c: number, t: number) => void) => {
    try {
      await saveBatchFabricsToFirestore(newFabrics, onProgress);
      // Reload to ensure full sync and clear demo mode
      await loadData();
      setOfflineStatus(isOfflineMode()); 
      showToast(`${newFabrics.length} fichas guardadas correctamente.`, 'success');
      setSortBy('newest'); // Auto-switch to newest
    } catch (e: any) {
      console.error("Error bulk saving:", e?.message || "Unknown error");
      showToast("Error en carga masiva. Revisa tu conexión.", 'error');
      await loadData();
    }
  };

  const handleUpdateFabric = async (updatedFabric: Fabric) => {
    try {
      setFabrics(prev => prev.map(f => f.id === updatedFabric.id ? updatedFabric : f));
      await saveFabricToFirestore(updatedFabric);
      setOfflineStatus(isOfflineMode()); 
      showToast("Cambios guardados exitosamente.", 'success');
    } catch (e: any) {
      console.error("Error updating fabric:", e?.message || "Unknown error");
      showToast("Guardado local (Error Nube).", 'info');
    }
  };

  const handleDeleteFabric = async (fabricId: string) => {
      try {
          // If in demo mode, just remove locally
          if (isDemoMode) {
             setFabrics(prev => prev.filter(f => f.id !== fabricId));
             handleBackToGrid();
             showToast("Ficha de demo eliminada.", 'success');
             return;
          }

          setFabrics(prev => prev.filter(f => f.id !== fabricId));
          handleBackToGrid(); // Clear view and URL
          await deleteFabricFromFirestore(fabricId);
          setOfflineStatus(isOfflineMode()); 
          showToast("Ficha eliminada de la nube.", 'success');
      } catch (e: any) {
          console.error("Error deleting fabric:", e?.message || "Unknown error");
          showToast("Error al eliminar la ficha.", 'error');
      }
  };

  const handleReset = async () => {
      if(window.confirm("¿Estás seguro de que quieres borrar TODA la información de la nube? ESTA ACCIÓN NO SE PUEDE DESHACER.")) {
          try {
            setFabrics([]);
            await clearFirestoreCollection();
            setUploadModalOpen(false);
            setOfflineStatus(false); 
            showToast("Base de datos reseteada por completo.", 'success');
            setTimeout(() => window.location.reload(), 1500);
          } catch (e: any) {
            console.error("Error resetting collection:", e?.message || "Unknown error");
            showToast("Error al resetear la base de datos.", 'error');
          }
      }
  };

  const goToDetailFromLightbox = () => {
    if (colorLightbox) {
        const fabricId = colorLightbox.fabricId;
        setSelectedFabricId(fabricId);
        setView('detail');
        setColorLightbox(null);
        
        // Update URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('fabricId', fabricId);
        window.history.pushState({}, '', newUrl);
    }
  };

  const getColorWeight = (colorName: string): number => {
      if (!colorName) return 50;
      const name = colorName.toLowerCase();
      // ... (color weight logic kept same) ...
      if (name.includes('white') || name.includes('blanco')) return 100;
      if (name.includes('beige') || name.includes('sand')) return 85;
      if (name.includes('grey') || name.includes('gris')) return 50;
      if (name.includes('black') || name.includes('negro')) return 0;
      return 50;
  };

  const getFilteredItems = () => {
    if (!fabrics) return []; // Safety check
    let items = [...fabrics];
    if (searchQuery) {
        items = items.filter(f => 
            (f.name && f.name.toLowerCase().includes(searchQuery.toLowerCase())) || 
            (f.colors || []).some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }
    return items;
  };

  const getSortedColorCards = () => {
      const items = getFilteredItems().filter(f => f.category !== 'wood');
      
      const allColorCards = items.flatMap((fabric) => 
          (fabric.colors || []).map((colorName) => ({
              fabric,
              colorName
          }))
      );

      allColorCards.sort((a, b) => {
          if (sortBy === 'newest') {
             return (b.fabric.createdAt || 0) - (a.fabric.createdAt || 0);
          }
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
    
    // Safety check if items is somehow undefined
    if (!items) return null;

    if (activeTab === 'wood') {
        const woodItems = items.filter(f => f.category === 'wood');
        woodItems.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
        
        if (woodItems.length === 0) {
            return (
                <div className="col-span-full text-center py-20 text-gray-400">
                    <h3 className="font-serif text-xl italic">No hay maderas cargadas.</h3>
                    {isDemoMode && (
                        <p className="text-xs text-gray-400 mt-2">La demo solo muestra 2 telas y 1 madera. ¡Sube tus propias fotos!</p>
                    )}
                </div>
            );
        }

        return woodItems.map((fabric, idx) => (
            <FabricCard 
                key={fabric.id} 
                fabric={fabric}
                mode="model"
                onClick={() => handleFabricClick(fabric)}
                index={idx}
            />
        ));
    }

    if (activeTab === 'model') {
        const textileItems = items.filter(f => f.category !== 'wood');
        
        if (sortBy === 'newest') {
             textileItems.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        } else {
             textileItems.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
        }
        
        if (textileItems.length === 0) {
            return (
                 <div className="col-span-full text-center py-20 text-gray-400">
                    <h3 className="font-serif text-xl italic">No hay telas cargadas.</h3>
                </div>
            );
        }

        return textileItems.map((fabric, idx) => (
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
      
      {/* Toast Notification */}
      {toast && (
         <div 
            className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[200] px-6 py-4 rounded-xl shadow-2xl border flex items-center space-x-3 transition-all animate-fade-in-down cursor-pointer min-w-[300px] justify-center
                ${toast.type === 'success' ? 'bg-black text-white border-gray-800' : 
                  toast.type === 'error' ? 'bg-red-500 text-white border-red-600' : 
                  'bg-white text-black border-gray-200'}
            `}
            onClick={() => setToast(null)}
         >
            <span className="text-sm font-bold">{toast.message}</span>
         </div>
      )}

      {/* Top Right Controls */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-4">
          
          {/* Status Indicator */}
          {offlineStatus ? (
             <div className="flex items-center space-x-2 bg-red-100 text-red-600 px-3 py-1 rounded-full border border-red-200 shadow-sm animate-pulse cursor-pointer" onClick={handleRetryConnection} title="Intentar Reconectar">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-[10px] font-bold uppercase tracking-wide">Offline</span>
             </div>
         ) : (
            <div 
                onClick={handleCloudRefresh}
                className="flex items-center space-x-2 bg-white/50 backdrop-blur-md px-3 py-1 rounded-full border border-gray-200 shadow-sm cursor-pointer hover:bg-white transition-all"
                title="Conectado (Click para refrescar)"
            >
                 <div className={`w-2 h-2 rounded-full ${isDemoMode ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                 <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                     {loading ? 'Cargando...' : (isDemoMode ? 'Modo Demo' : 'En Línea')}
                 </span>
            </div>
         )}

          <button 
            onClick={handleUploadClick}
            className="text-gray-300 hover:text-black font-bold text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white transition-colors"
          >
            .
          </button>
      </div>

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
            
            <div className="flex space-x-8 md:space-x-12 border-b border-transparent overflow-x-auto w-full justify-center hide-scrollbar">
                <button 
                    onClick={() => { setActiveTab('model'); setFilterMenuOpen(false); setView('grid'); }}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors whitespace-nowrap ${
                        activeTab === 'model' && view === 'grid' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Ver modelos
                </button>
                <button 
                    onClick={() => { setActiveTab('color'); setView('grid'); }}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors whitespace-nowrap ${
                        activeTab === 'color' && view === 'grid' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Ver colores
                </button>
                <button 
                    onClick={() => { setActiveTab('wood'); setView('grid'); }}
                    className={`pb-2 text-sm font-medium tracking-wide uppercase transition-colors whitespace-nowrap ${
                        activeTab === 'wood' && view === 'grid' ? 'text-black border-b-2 border-black' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    Maderas
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

                {view === 'grid' && activeTab !== 'wood' && (
                    <div className="relative">
                        <button 
                            onClick={() => setFilterMenuOpen(!isFilterMenuOpen)}
                            className={`w-11 h-11 flex items-center justify-center rounded-full border transition-all ${isFilterMenuOpen ? 'bg-black text-white border-black' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            title="Filtrar y Ordenar"
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
                                    onClick={() => { setSortBy('newest'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'newest' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Más Recientes</span>
                                    {sortBy === 'newest' && <span className="text-black">•</span>}
                                </button>
                                <button 
                                    onClick={() => { setSortBy('color'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'color' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Color (Claro a Fuerte)</span>
                                </button>
                                <button 
                                    onClick={() => { setSortBy('name'); setFilterMenuOpen(false); }}
                                    className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${sortBy === 'name' ? 'text-black font-bold bg-gray-50' : 'text-gray-600'}`}
                                >
                                    <span>Nombre (A-Z)</span>
                                </button>
                            </div>
                        )}
                        {isFilterMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setFilterMenuOpen(false)}></div>}
                    </div>
                )}
            </div>
        </header>
      )}

      <main>
        {view === 'grid' && (
          <div className="container mx-auto px-6 pb-20 flex flex-col items-center">
            {filteredItemCount === 0 ? (
                <div className="text-center py-20 text-gray-300">
                     <p>El catálogo está vacío.</p>
                     <div className="mt-4">
                        <button 
                           onClick={handleUploadClick}
                           className="bg-black text-white px-6 py-3 rounded-full text-sm font-bold uppercase tracking-wide hover:scale-105 transition-transform"
                        >
                           Empezar a Cargar
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
                                         <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${f.category === 'wood' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>{f.category === 'wood' ? 'Maderas' : f.customCatalog || 'Textil'}</span>
                                     </td>
                                     <td className="p-4 pr-8 text-right">
                                         <span className="text-sm font-bold text-black">{f.colors?.length || 0}</span>
                                     </td>
                                 </tr>
                             ))}
                        </tbody>
                    </table>
                </div>
             </div>
        )}

        {view === 'detail' && selectedFabricId && (
          <FabricDetail 
            fabric={fabrics.find(f => f.id === selectedFabricId)!} 
            onBack={handleBackToGrid}
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
        existingFabrics={fabrics} 
      />

      <ChatBot />

    </div>
  );
}