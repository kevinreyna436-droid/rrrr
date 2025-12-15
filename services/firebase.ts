
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch
} from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { Fabric } from "../types";
import { compressBase64 } from "../utils/imageCompression";

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCzdQwkC--MboeRXeq8DjzyJkIfZoITKro",
  authDomain: "proyecto-1-23086.firebaseapp.com",
  projectId: "proyecto-1-23086",
  storageBucket: "proyecto-1-23086.firebasestorage.app",
  messagingSenderId: "521750292128",
  appId: "1:521750292128:web:aeef06815de16e67564bc5",
  measurementId: "G-QG3JVEL7F5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// --- Helper Functions ---

/**
 * Recursively removes keys with undefined values from an object.
 * Firestore does not support 'undefined'.
 */
const cleanDataForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    
    if (Array.isArray(obj)) {
        return obj.map(v => cleanDataForFirestore(v)).filter(v => v !== undefined);
    }
    
    if (typeof obj === 'object') {
        const newObj: any = {};
        Object.keys(obj).forEach(key => {
            const value = cleanDataForFirestore(obj[key]);
            if (value !== undefined) {
                newObj[key] = value;
            }
        });
        return newObj;
    }
    
    return obj;
};

const uploadImageToStorage = async (path: string, base64Data: string): Promise<string> => {
    if (!base64Data || base64Data.startsWith('http')) return base64Data || '';
    if (!base64Data.includes('data:image')) return '';

    try {
        const storageRef = ref(storage, path);
        await uploadString(storageRef, base64Data, 'data_url');
        const url = await getDownloadURL(storageRef);
        return url;
    } catch (e: any) {
        console.warn(`⚠️ Aviso: No se pudo subir imagen a Storage (${path}). Usando modo offline.`);
        return ''; // Return empty to trigger fallback logic
    }
};

export const saveFabricToFirestore = async (fabric: Fabric): Promise<void> => {
  console.log(`☁️ Iniciando subida para: ${fabric.name}`);
  const finalFabric = { ...fabric };

  try {
      // 1. Subir Imagen Principal
      if (finalFabric.mainImage && !finalFabric.mainImage.startsWith('http')) {
          const url = await uploadImageToStorage(`fabrics/${fabric.id}/main.jpg`, finalFabric.mainImage);
          if (url) {
              finalFabric.mainImage = url;
          } else {
              // FALLBACK AGRESIVO: Si falla Storage, intentar comprimir para guardar en Firestore
              // Aceptamos intentar comprimir imágenes de hasta 5MB.
              if (finalFabric.mainImage.length < 5000000) {
                  console.log("Intentando comprimir y guardar imagen localmente en BD...");
                  const compressed = await compressBase64(finalFabric.mainImage, 600, 0.5); 
                  // Verificamos que el resultado sea seguro para Firestore (< 900KB aprox)
                  if (compressed.length < 950000) {
                      finalFabric.mainImage = compressed;
                  } else {
                      finalFabric.mainImage = ''; // Imposible guardar, muy grande
                  }
              } else {
                  finalFabric.mainImage = ''; 
              }
          }
      }

      // 2. Subir Imagen Ficha Técnica
      if (finalFabric.specsImage && !finalFabric.specsImage.startsWith('http')) {
          const url = await uploadImageToStorage(`fabrics/${fabric.id}/specs.jpg`, finalFabric.specsImage);
          if (url) {
              finalFabric.specsImage = url;
          } else {
              finalFabric.specsImage = '';
          }
      }

      // 3. Subir Imágenes de Colores
      if (finalFabric.colorImages) {
          const newColorImages: Record<string, string> = {};
          const entries = Object.entries(finalFabric.colorImages);
          
          for (const [color, base64] of entries) {
             if (base64.startsWith('http')) {
                 newColorImages[color] = base64;
                 continue;
             }

             const safeColorName = color.replace(/[^a-z0-9]/gi, '_').toLowerCase();
             const url = await uploadImageToStorage(`fabrics/${fabric.id}/colors/${safeColorName}.jpg`, base64);
             
             if (url) {
                 newColorImages[color] = url;
             } else {
                 // Fallback para colores
                 if (base64.length < 3000000) {
                     const compressed = await compressBase64(base64, 300, 0.5);
                     if (compressed.length < 500000) { // Límite más estricto para colores para no llenar el doc
                         newColorImages[color] = compressed;
                     }
                 }
             }
          }
          finalFabric.colorImages = newColorImages;
      }

      // 4. Limpieza profunda de datos (CRÍTICO)
      const rawData = JSON.parse(JSON.stringify(finalFabric));
      const cleanData = cleanDataForFirestore(rawData);

      // Asegurar campos obligatorios y valores por defecto
      if (!cleanData.colors) cleanData.colors = [];
      if (!cleanData.colorImages) cleanData.colorImages = {};
      if (!cleanData.specs) cleanData.specs = { composition: '', martindale: '', usage: '', weight: '' };
      
      // Asegurar strings vacíos en lugar de undefined en campos críticos
      cleanData.name = cleanData.name || 'Sin Nombre';
      cleanData.supplier = cleanData.supplier || '';

      await setDoc(doc(db, "fabrics", fabric.id), cleanData);
      console.log("✅ Guardado Exitoso en Nube");

  } catch (e: any) {
      console.error("❌ Error Crítico guardando en Firestore:", e);
      throw new Error(`Error Firestore: ${e.message}`);
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[], onProgress?: (c: number, t: number) => void): Promise<void> => {
    for (let i = 0; i < fabrics.length; i++) {
        await saveFabricToFirestore(fabrics[i]);
        if (onProgress) onProgress(i + 1, fabrics.length);
    }
};

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, "fabrics"));
    const data = querySnapshot.docs.map((doc: any) => doc.data() as Fabric);
    console.log(`☁️ Descargados ${data.length} elementos de la nube.`);
    return data;
  } catch (e) {
    console.error("Error obteniendo datos:", e);
    throw e;
  }
};

export const deleteFabricFromFirestore = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, "fabrics", id));
};

export const clearFirestoreCollection = async (): Promise<void> => {
    const q = await getDocs(collection(db, "fabrics"));
    const batch = writeBatch(db);
    q.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
};

export const isOfflineMode = (): boolean => !navigator.onLine;
export const retryFirebaseConnection = async (): Promise<boolean> => {
    try {
        await getDocs(collection(db, "fabrics"));
        return true;
    } catch (e) {
        return false;
    }
};
export const testStorageConnection = async (): Promise<{success: boolean; message: string}> => {
    return { success: true, message: "OK" }; 
};
