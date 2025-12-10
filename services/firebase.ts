
import * as firebaseApp from "firebase/app";
import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  deleteDoc, 
  writeBatch,
  initializeFirestore,
  disableNetwork,
  setLogLevel,
  enableNetwork
} from "firebase/firestore";
import { 
  getStorage, 
  ref, 
  uploadString, 
  getDownloadURL 
} from "firebase/storage";
import type { QuerySnapshot, DocumentData } from "firebase/firestore";
import { Fabric } from "../types";

// Suppress unnecessary connection warnings from Firebase SDK
setLogLevel('silent');

const firebaseConfig = {
  apiKey: "AIzaSyAudyiExH_syO9MdtSzn4cDxrK0p1zjnac",
  authDomain: "creata-catalogo.firebaseapp.com",
  projectId: "creata-catalogo",
  storageBucket: "creata-catalogo.firebasestorage.app", // VERIFICA QUE ESTE NOMBRE SEA EXACTO EN TU CONSOLA DE FIREBASE -> STORAGE
  messagingSenderId: "667237641772",
  appId: "1:667237641772:web:50a3ce92c5839d49cfab89",
  measurementId: "G-RH13X81KLF"
};

// Initialize Firebase
const app = firebaseApp.initializeApp(firebaseConfig);

// Initialize Firestore
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: true 
});

// Initialize Storage
const storage = getStorage(app);

const COLLECTION_NAME = "fabrics";
const LOCAL_STORAGE_KEY = "creata_fabrics_offline_backup";

// CLEANUP
try {
    localStorage.removeItem("creata_firestore_broken");
} catch(e) {}

// SESSION-ONLY OFFLINE MODE
let globalOfflineMode = false;

// --- Local Storage Helpers ---

const getLocalFabrics = (): Fabric[] => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Error reading local storage", e);
    return [];
  }
};

const saveLocalFabric = (fabric: Fabric) => {
  try {
    const current = getLocalFabrics();
    const index = current.findIndex(f => f.id === fabric.id);
    if (index >= 0) {
      current[index] = fabric;
    } else {
      current.unshift(fabric);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {
    console.warn("Could not save to local storage due to quota limits.");
  }
};

const deleteLocalFabric = (id: string) => {
  try {
    const current = getLocalFabrics();
    const filtered = current.filter(f => f.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error("Error deleting from local storage", e);
  }
};

const clearLocalFabrics = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
};

// --- Utils ---

const uploadImageToStorage = async (base64String: string, path: string): Promise<string> => {
    if (globalOfflineMode) return base64String;

    try {
        if (!base64String || base64String.startsWith('http')) return base64String;
        
        console.log(`[STORAGE] Iniciando subida para: ${path}`);
        const storageRef = ref(storage, path);
        
        const metadata = {
            contentType: 'image/jpeg',
        };

        // Use uploadString for robust Base64 handling
        // 'data_url' automatically parses the "data:image/jpg;base64,..." header
        await uploadString(storageRef, base64String, 'data_url', metadata);
        
        console.log(`[STORAGE] Subida completada. Obteniendo URL...`);
        const downloadURL = await getDownloadURL(storageRef);
        console.log(`[STORAGE] URL Final: ${downloadURL}`);
        return downloadURL;

    } catch (error: any) {
        console.error(`[STORAGE ERROR] Fallo en ${path}:`, error);

        // ALERT USER SPECIFICALLY ABOUT CONFIG ERRORS
        if (error.code === 'storage/unauthorized') {
            console.error("PERMISOS DENEGADOS. Revisa Firebase Rules.");
            throw new Error("Storage Permission Denied: Revisa las Reglas en Firebase Console."); 
        } else if (error.code === 'storage/object-not-found' || error.code === 'storage/bucket-not-found') {
             console.error("BUCKET NO ENCONTRADO. Revisa 'storageBucket' en firebaseConfig.");
             throw new Error("Bucket Not Found: El nombre del bucket en config no coincide con Firebase.");
        } else if (error.message && error.message.includes('CORS')) {
            console.error("ERROR CORS. Falta configurar cors.json en Google Cloud.");
            throw new Error("CORS Error: Configura CORS en Google Cloud Console.");
        } else if (error.code === 'storage/retry-limit-exceeded') {
            throw new Error("Conexión lenta o inestable. Se excedió el límite de reintentos.");
        }
        
        throw error; 
    }
};

const processFabricImagesForStorage = async (fabric: Fabric): Promise<Fabric> => {
    if (globalOfflineMode) return fabric;

    const updatedFabric = { ...fabric };
    const timestamp = Date.now();

    // Helper to safely upload or fallback
    const safeUpload = async (data: string, path: string) => {
        try {
            return await uploadImageToStorage(data, path);
        } catch (e: any) {
            console.error("Image upload failed.", e);
            // If upload fails due to configuration, we throw to stop the process
            if (e.message.includes("CORS") || e.message.includes("Permission") || e.message.includes("Bucket")) {
                throw e; 
            }
            // For network errors, we return the original base64 temporarily, 
            // BUT the batch saver will strip it to avoid "Payload too large".
            throw new Error("UploadFailed"); 
        }
    };

    try {
        if (updatedFabric.mainImage && updatedFabric.mainImage.startsWith('data:')) {
            const path = `fabrics/${updatedFabric.id}/main_${timestamp}.jpg`;
            updatedFabric.mainImage = await safeUpload(updatedFabric.mainImage, path);
        }

        if (updatedFabric.specsImage && updatedFabric.specsImage.startsWith('data:')) {
            const path = `fabrics/${updatedFabric.id}/specs_${timestamp}.jpg`;
            updatedFabric.specsImage = await safeUpload(updatedFabric.specsImage, path);
        }
        
        // Handle PDF if it's base64 (Storage it!)
        if (updatedFabric.pdfUrl && updatedFabric.pdfUrl.startsWith('data:')) {
             const path = `fabrics/${updatedFabric.id}/specs_${timestamp}.pdf`;
             // Reuse safeUpload logic but for PDF
             if (!globalOfflineMode) {
                 const storageRef = ref(storage, path);
                 await uploadString(storageRef, updatedFabric.pdfUrl, 'data_url', { contentType: 'application/pdf' });
                 updatedFabric.pdfUrl = await getDownloadURL(storageRef);
             }
        }

        if (updatedFabric.colorImages) {
            const newColorImages: Record<string, string> = {};
            for (const [colorName, base64] of Object.entries(updatedFabric.colorImages)) {
                if (base64 && base64.startsWith('data:')) {
                    const safeColorName = colorName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const path = `fabrics/${updatedFabric.id}/colors/${safeColorName}_${timestamp}.jpg`;
                    try {
                        newColorImages[colorName] = await safeUpload(base64, path);
                    } catch (e) {
                         // If one color fails, we skip it or keep base64? 
                         // To avoid crashing the whole batch, we skip the image for this color.
                         console.warn(`Skipping color image ${colorName} due to upload error`);
                         newColorImages[colorName] = ''; 
                    }
                } else {
                    newColorImages[colorName] = base64;
                }
            }
            updatedFabric.colorImages = newColorImages;
        }
    } catch (e: any) {
        if (e.message === "UploadFailed") throw e; // Pass up for handling
        console.warn("Image upload process interrupted.", e);
        throw e;
    }

    return updatedFabric;
};

const createCleanFabricObject = (source: any): Fabric => {
  if (!source || typeof source !== 'object') {
      return {
          id: 'error-' + Date.now(),
          name: 'Error',
          supplier: '',
          technicalSummary: '',
          specs: { composition: '', martindale: '', usage: '', weight: '' },
          colors: [],
          colorImages: {},
          mainImage: '',
          category: 'model'
      };
  }

  const safeString = (val: any): string => {
      try {
          if (val === null || val === undefined) return '';
          if (typeof val === 'string') return val;
          return String(val);
      } catch (e) { return ''; }
  };

  return {
    id: safeString(source.id),
    name: safeString(source.name) || 'Sin Nombre',
    supplier: safeString(source.supplier),
    technicalSummary: safeString(source.technicalSummary),
    specs: {
      composition: safeString(source?.specs?.composition),
      weight: safeString(source?.specs?.weight),
      martindale: safeString(source?.specs?.martindale),
      usage: safeString(source?.specs?.usage),
    },
    colors: Array.isArray(source.colors) ? source.colors.map(safeString).filter((s: string) => s) : [],
    colorImages: source.colorImages || {},
    pdfUrl: safeString(source.pdfUrl),
    specsImage: safeString(source.specsImage),
    customCatalog: safeString(source.customCatalog),
    category: source.category === 'wood' ? 'wood' as const : 'model' as const,
    mainImage: safeString(source.mainImage)
  };
};

// --- Exported Operations ---

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  if (globalOfflineMode) return getLocalFabrics();

  try {
    const serverPromise = getDocs(collection(db, COLLECTION_NAME));
    const timeoutPromise = new Promise<QuerySnapshot<DocumentData>>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_CONNECT')), 12000)
    );

    const snapshot = await Promise.race([serverPromise, timeoutPromise]);
    return snapshot.docs.map(doc => createCleanFabricObject(doc.data()));

  } catch (error: any) {
    console.warn("Firestore connection failed.", error?.message);
    globalOfflineMode = true;
    try { await disableNetwork(db); } catch(e) {}
    return getLocalFabrics();
  }
};

export const retryFirebaseConnection = async (): Promise<boolean> => {
    try {
        globalOfflineMode = false;
        await enableNetwork(db);
        await getDocs(collection(db, COLLECTION_NAME));
        return true;
    } catch (e) {
        console.error("Retry failed", e);
        globalOfflineMode = true;
        return false;
    }
};

export const testStorageConnection = async (): Promise<{success: boolean; message: string}> => {
    try {
        const storageRef = ref(storage, 'connection_check.txt');
        await uploadString(storageRef, "ping", 'raw');
        return { success: true, message: "Conexión a Storage exitosa. El sistema de archivos funciona." };
    } catch (e: any) {
        console.error("Storage Diagnostic Error:", e);
        let msg = `Error desconocido: ${e.message}`;
        if (e.message && e.message.includes('CORS')) msg = "ERROR CRÍTICO: CORS bloqueando subida. Falta configurar Google Cloud.";
        if (e.code === 'storage/unauthorized') msg = "ERROR CRÍTICO: Permisos denegados. Configura las 'Rules' de Storage a 'public'.";
        if (e.code === 'storage/object-not-found' || e.code === 'storage/bucket-not-found') msg = "ERROR CRÍTICO: No se encuentra el Bucket de almacenamiento. Verifica el nombre en firebaseConfig.";
        return { success: false, message: msg };
    }
};

export const saveFabricToFirestore = async (fabric: Fabric) => {
  let fabricToSave = { ...fabric };
  
  if (globalOfflineMode) {
      saveLocalFabric(fabricToSave);
      return;
  }

  try {
    console.log("Iniciando proceso de subida de imágenes...");
    fabricToSave = await processFabricImagesForStorage(fabric);
  } catch (error: any) {
    console.error("Error en subida de imágenes:", error);
    if (error.message.includes("CORS") || error.message.includes("Permission") || error.message.includes("Bucket")) {
        alert(`NO SE PUEDEN SUBIR FOTOS: ${error.message}`);
        throw error; 
    }
    // For single saves, we might warn but still allow saving text? 
    // Let's prompt user or just fail safe.
    if (!window.confirm("Falló la subida de algunas imágenes. ¿Guardar solo los datos de texto?")) {
        throw error;
    }
    // Clean images to allow text save
    fabricToSave.mainImage = fabricToSave.mainImage.startsWith('http') ? fabricToSave.mainImage : '';
    fabricToSave.specsImage = fabricToSave.specsImage?.startsWith('http') ? fabricToSave.specsImage : '';
    // Clear heavy base64 colors
    const cleanColors: Record<string, string> = {};
    for (const [k, v] of Object.entries(fabricToSave.colorImages || {})) {
        if (v.startsWith('http')) cleanColors[k] = v;
    }
    fabricToSave.colorImages = cleanColors;
  }

  try {
    const cleanFabric = createCleanFabricObject(fabricToSave);
    if (!cleanFabric.id) throw new Error("Invalid ID");
    
    const savePromise = setDoc(doc(db, COLLECTION_NAME, cleanFabric.id), cleanFabric, { merge: true });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SAVE')), 20000));
    
    await Promise.race([savePromise, timeoutPromise]);
    console.log("Documento guardado en base de datos.");
    
  } catch (error: any) {
    console.warn("Error guardando en Firestore:", error);
    if (error.message && error.message.includes("exceeds the maximum allowed size")) {
        alert("ERROR CRÍTICO: Payload demasiado grande. Se intentó guardar imágenes base64.");
    } else {
        saveLocalFabric(fabricToSave); 
    }
    throw error;
  }
};

export const saveBatchFabricsToFirestore = async (
    fabrics: Fabric[], 
    onProgress?: (current: number, total: number) => void
) => {
  if (globalOfflineMode) {
      fabrics.forEach(f => saveLocalFabric(f));
      if (onProgress) onProgress(fabrics.length, fabrics.length);
      return;
  }
  
  // STEP 1: Process Images for ALL fabrics
  const processedFabrics: Fabric[] = [];
  
  console.log(`Iniciando carga masiva de ${fabrics.length} elementos...`);
  
  for (let i = 0; i < fabrics.length; i++) {
      if (onProgress) onProgress(i, fabrics.length); 
      
      const fabric = fabrics[i];
      try {
          const processed = await processFabricImagesForStorage(fabric);
          processedFabrics.push(processed);
          console.log(`Imágenes procesadas para ${i+1}/${fabrics.length}: ${fabric.name}`);
      } catch (e: any) {
          console.error(`Fallo procesando imágenes para ${fabric.name}`, e);
          
          // CRITICAL FIX: If storage upload fails, DO NOT push the original fabric with Base64.
          // This causes the "Payload size exceeds limit" error in Firestore.
          // Instead, strip the images and save only text + technical data.
          const strippedFabric = { ...fabric };
          
          // Keep existing URLs if any, but remove Base64
          strippedFabric.mainImage = strippedFabric.mainImage?.startsWith('http') ? strippedFabric.mainImage : '';
          strippedFabric.specsImage = strippedFabric.specsImage?.startsWith('http') ? strippedFabric.specsImage : '';
          strippedFabric.pdfUrl = strippedFabric.pdfUrl?.startsWith('http') ? strippedFabric.pdfUrl : '';

          const cleanColors: Record<string, string> = {};
          if (strippedFabric.colorImages) {
              for (const [k, v] of Object.entries(strippedFabric.colorImages)) {
                  if (v && v.startsWith('http')) cleanColors[k] = v;
              }
          }
          strippedFabric.colorImages = cleanColors;
          
          // Append error note
          strippedFabric.technicalSummary = (strippedFabric.technicalSummary || '') + " [NOTA SISTEMA: Error subiendo imágenes a la nube]";
          
          processedFabrics.push(strippedFabric);
      }
  }

  // STEP 2: Batch Save to Firestore
  // Reduced Batch Size to avoid 10MB limit
  const BATCH_SIZE = 50; 
  const chunks = [];
  
  for (let i = 0; i < processedFabrics.length; i += BATCH_SIZE) {
      chunks.push(processedFabrics.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const fabric of chunk) {
           const cleanFabric = createCleanFabricObject(fabric);
           const ref = doc(db, COLLECTION_NAME, cleanFabric.id);
           batch.set(ref, cleanFabric, { merge: true });
      }
      try {
          await batch.commit();
          console.log("Lote guardado correctamente.");
      } catch (e) {
          console.error("Batch save failed", e);
          // If batch fails, try saving locally
          chunk.forEach(f => saveLocalFabric(f));
      }
  }
  
  if (onProgress) onProgress(fabrics.length, fabrics.length);
};

export const deleteFabricFromFirestore = async (fabricId: string) => {
  if (globalOfflineMode) {
      deleteLocalFabric(fabricId);
      return;
  }
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, fabricId));
  } catch (error) {
    deleteLocalFabric(fabricId);
  }
};

export const clearFirestoreCollection = async () => {
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  if (globalOfflineMode) {
      globalOfflineMode = false;
      try { await enableNetwork(db); } catch(e) {}
  }
  try {
    const snap = await getDocs(collection(db, COLLECTION_NAME));
    const batch = writeBatch(db);
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  } catch (error) {}
};

export const isOfflineMode = () => globalOfflineMode;
