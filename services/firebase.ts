
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch, 
  enableIndexedDbPersistence 
} from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import { Fabric } from "../types";

// --- CONFIGURACIÓN DE FIREBASE ---
// Asegúrate de que esta configuración sea válida y corresponda a tu proyecto real en la consola de Firebase.
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

// Habilitar persistencia offline (cache) para lectura rápida
try { enableIndexedDbPersistence(db).catch(() => {}); } catch (e) {}

// --- Helper Functions ---

/**
 * Uploads a base64 string to Firebase Storage and returns the public URL.
 * If it's already a URL, returns it as is.
 */
const uploadImageToStorage = async (path: string, base64Data: string): Promise<string> => {
    // 1. Si ya es una URL (http...), no hacer nada.
    if (!base64Data || base64Data.startsWith('http')) return base64Data || '';
    
    // 2. Si no es una imagen válida, devolver vacío.
    if (!base64Data.includes('data:image')) return '';

    try {
        // Crear referencia en la nube
        const storageRef = ref(storage, path);
        
        // Subir
        await uploadString(storageRef, base64Data, 'data_url');
        
        // Obtener URL pública
        const url = await getDownloadURL(storageRef);
        return url;
    } catch (e: any) {
        console.error(`❌ Error subiendo imagen a ${path}:`, e);
        // Si falla la subida de imagen, devolvemos string vacío para no romper la ficha completa
        // El usuario verá la ficha sin foto, pero los datos estarán ahí.
        return ''; 
    }
};

/**
 * GUARDA UNA TELA EN LA NUBE (PROCESO ESTÁNDAR)
 * 1. Sube Foto Principal -> Obtiene URL
 * 2. Sube Fotos Colores -> Obtiene URLs
 * 3. Guarda JSON con URLs en Firestore
 */
export const saveFabricToFirestore = async (fabric: Fabric): Promise<void> => {
  console.log(`☁️ Iniciando subida para: ${fabric.name}`);
  
  // Copia profunda para no mutar el objeto original mientras procesamos
  const finalFabric = { ...fabric };

  try {
      // 1. Subir Imagen Principal
      if (finalFabric.mainImage && !finalFabric.mainImage.startsWith('http')) {
          const url = await uploadImageToStorage(`fabrics/${fabric.id}/main.jpg`, finalFabric.mainImage);
          finalFabric.mainImage = url;
      }

      // 2. Subir Imagen Ficha Técnica
      if (finalFabric.specsImage && !finalFabric.specsImage.startsWith('http')) {
          const url = await uploadImageToStorage(`fabrics/${fabric.id}/specs.jpg`, finalFabric.specsImage);
          finalFabric.specsImage = url;
      }

      // 3. Subir Imágenes de Colores (Iterar y subir una por una)
      if (finalFabric.colorImages) {
          const newColorImages: Record<string, string> = {};
          const entries = Object.entries(finalFabric.colorImages);
          
          for (const [color, base64] of entries) {
             const safeColorName = color.replace(/[^a-z0-9]/gi, '_').toLowerCase();
             const url = await uploadImageToStorage(`fabrics/${fabric.id}/colors/${safeColorName}.jpg`, base64);
             if (url) {
                 newColorImages[color] = url;
             }
          }
          finalFabric.colorImages = newColorImages;
      }

      // 4. Guardar datos en Firestore (Ahora pesa muy poco porque son solo URLs)
      await setDoc(doc(db, "fabrics", fabric.id), finalFabric);
      console.log("✅ Guardado Exitoso en Nube");

  } catch (e: any) {
      console.error("❌ Error Crítico guardando en Firestore:", e);
      throw new Error("No se pudo guardar en la nube. Verifica tu conexión.");
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
    // Sin timeout agresivo. Dejamos que Firebase intente conectar.
    const querySnapshot = await getDocs(collection(db, "fabrics"));
    return querySnapshot.docs.map((doc: any) => doc.data() as Fabric);
  } catch (e) {
    console.error("Error obteniendo datos:", e);
    throw e; // Lanzamos el error para que la UI sepa que falló la red
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
