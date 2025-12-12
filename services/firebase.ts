
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch, 
  enableIndexedDbPersistence 
} from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { Fabric } from "../types";

// --- CONFIGURACIÓN DE FIREBASE ---
// Credenciales actualizadas para el proyecto 'telas' (ID: proyecto-1-23086)
const firebaseConfig = {
  apiKey: "AIzaSyCzdQwkC--MboeRXeq8DjzyJkIfZoITKro",
  authDomain: "proyecto-1-23086.firebaseapp.com",
  projectId: "proyecto-1-23086",
  storageBucket: "proyecto-1-23086.firebasestorage.app",
  messagingSenderId: "521750292128",
  appId: "1:521750292128:web:aeef06815de16e67564bc5",
  measurementId: "G-QG3JVEL7F5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Enable Offline Persistence with Better Error Handling
try {
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn("⚠️ AVISO: Tienes la app abierta en varias pestañas. La persistencia offline solo funciona en una a la vez.");
        } else if (err.code === 'unimplemented') {
            console.warn("⚠️ AVISO: Tu navegador no soporta el modo offline avanzado.");
        }
    });
} catch (e) {
    console.warn("Error habilitando persistencia", e);
}

// --- Helper Functions ---

/**
 * Uploads a base64 image string to Firebase Storage and returns the download URL.
 */
const uploadImage = async (path: string, base64Data: string): Promise<string> => {
    // If it's already a URL or empty, return as is
    if (!base64Data || base64Data.startsWith('http')) return base64Data;
    
    // Sanity check
    if (!base64Data.includes('base64,')) return base64Data;

    try {
        const storageRef = ref(storage, path);
        await uploadString(storageRef, base64Data, 'data_url');
        const url = await getDownloadURL(storageRef);
        console.log(`✅ IMAGEN SUBIDA: ${path}`);
        return url;
    } catch (e: any) {
        console.error(`❌ Error subiendo imagen a Storage (${path}):`, e.code, e.message);

        if (e.code === 'storage/unauthorized') {
            throw new Error("PERMISSION_DENIED_STORAGE");
        } else if (e.code === 'storage/retry-limit-exceeded' || e.code === 'storage/canceled') {
            throw new Error("NETWORK_ERROR_STORAGE");
        }

        // CRITICAL CHECK:
        // If Storage fails, we might try to save Base64 to Firestore.
        // But Firestore has a 1MB limit per document.
        // If the image is large (> 500KB approx to be safe along with other data), 
        // saving to Firestore WILL FAIL and crash the operation.
        if (base64Data.length > 500000) { 
            console.error("⚠️ La imagen es demasiado grande para guardar localmente sin Storage.");
            throw new Error("STORAGE_FAILED_IMAGE_TOO_LARGE");
        }

        console.warn(`⚠️ Subida fallida (¿Offline?): ${path}. Se intentará guardar localmente (Baja resolución).`);
        return base64Data;
    }
};

// --- Firestore Operations ---

// Utility to race a promise against a timeout
const timeoutPromise = (ms: number, promise: Promise<any>) => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("TIMEOUT"));
    }, ms);
    promise.then(
      (res) => {
        clearTimeout(timeoutId);
        resolve(res);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
};

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    // Increased timeout to 8000ms (8s) to prevent false positives on slow mobile connections
    const querySnapshot: any = await timeoutPromise(8000, getDocs(collection(db, "fabrics")));
    
    const data = querySnapshot.docs.map((doc: any) => doc.data() as Fabric);
    console.log(`✅ CONEXIÓN EXITOSA: Se cargaron ${data.length} telas de la nube.`);
    return data;
  } catch (e: any) {
    if (e.message === "TIMEOUT") {
        console.warn("⚠️ Conexión lenta: Mostrando modo demo/offline temporalmente.");
    } else if (e.code === 'permission-denied') {
        console.error("⛔ ERROR DE PERMISOS: No puedes leer la base de datos.");
    } else if (e.code === 'unavailable') {
        console.log("⚠️ MODO OFFLINE: Cargando datos guardados en el dispositivo...");
    } else {
        console.error("Error leyendo telas:", e.message);
    }
    return [];
  }
};

export const saveFabricToFirestore = async (fabric: Fabric): Promise<void> => {
  const updatedFabric = { ...fabric };

  try {
    // 1. Upload Main Image
    if (updatedFabric.mainImage) {
        updatedFabric.mainImage = await uploadImage(`fabrics/${fabric.id}/main.jpg`, updatedFabric.mainImage);
    }

    // 2. Upload Specs Image
    if (updatedFabric.specsImage) {
        updatedFabric.specsImage = await uploadImage(`fabrics/${fabric.id}/specs.jpg`, updatedFabric.specsImage);
    }

    // 3. Upload Color Images
    if (updatedFabric.colorImages) {
        const newColorImages: Record<string, string> = {};
        const entries = Object.entries(updatedFabric.colorImages);
        
        // Upload in parallel for speed
        const uploadPromises = entries.map(async ([color, base64]) => {
            // Sanitize color name for path
            const safeColor = color.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const url = await uploadImage(`fabrics/${fabric.id}/colors/${safeColor}.jpg`, base64);
            return { color, url };
        });

        const results = await Promise.all(uploadPromises);
        results.forEach(res => {
            newColorImages[res.color] = res.url;
        });
        
        updatedFabric.colorImages = newColorImages;
    }

    // 4. Save metadata to Firestore
    await setDoc(doc(db, "fabrics", fabric.id), updatedFabric);
    console.log(`✅ GUARDADO EXITOSO: ${fabric.name}`);

  } catch (e: any) {
      if (e.code === 'permission-denied') {
          throw new Error("PERMISSION_DENIED_DB");
      }
      if (e.message === "PERMISSION_DENIED_STORAGE") {
          throw new Error("PERMISSION_DENIED_STORAGE");
      }
      if (e.message === "STORAGE_FAILED_IMAGE_TOO_LARGE") {
          throw new Error("STORAGE_FAILED_IMAGE_TOO_LARGE");
      }
      // Firestore document size limit error usually looks like this
      if (e.code === 'resource-exhausted' || e.message.includes('exceeds the maximum size')) {
           throw new Error("DOC_TOO_LARGE");
      }
      throw e;
  }
};

export const saveBatchFabricsToFirestore = async (fabrics: Fabric[], onProgress?: (c: number, t: number) => void): Promise<void> => {
    const total = fabrics.length;
    for (let i = 0; i < total; i++) {
        await saveFabricToFirestore(fabrics[i]);
        if (onProgress) onProgress(i + 1, total);
    }
};

export const deleteFabricFromFirestore = async (id: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, "fabrics", id));
        console.log(`🗑️ Tela eliminada: ${id}`);
    } catch (e: any) {
        console.error("Error eliminando tela:", e.message);
        throw e;
    }
};

export const clearFirestoreCollection = async (): Promise<void> => {
    try {
        const q = await getDocs(collection(db, "fabrics"));
        const batch = writeBatch(db);
        q.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log("⚠️ BASE DE DATOS RESETEADA");
    } catch (e: any) {
        console.error("Error reseteando colección:", e.message);
        throw e;
    }
};

// --- Connection Diagnostics ---

export const isOfflineMode = (): boolean => {
    return !navigator.onLine;
};

export const retryFirebaseConnection = async (): Promise<boolean> => {
    return navigator.onLine;
};

export const testStorageConnection = async (): Promise<{success: boolean; message: string}> => {
    try {
        // Race condition check: fast timeout for diagnostics
        const testRef = ref(storage, 'diagnostics/test_connection.txt');
        await timeoutPromise(3000, uploadString(testRef, 'test_ping', 'raw'));
        await deleteObject(testRef);
        return { success: true, message: "Conectado a la Nube correctamente." };
    } catch (e: any) {
        if (e.message === 'TIMEOUT') {
             return { success: false, message: "Conexión lenta: Modo Offline activo." };
        }
        if (e.code === 'storage/unauthorized') {
             return { success: false, message: "ERROR CRÍTICO: Permisos denegados en la base de datos." };
        }
        if (e.code === 'unavailable') {
            return { success: false, message: "Modo Offline (Sin Internet) - Tus datos se guardarán localmente." };
        }
        // Generic 404 on project bucket often means config is wrong
        if (e.code === 'storage/object-not-found' || e.code === 'storage/bucket-not-found') {
             return { success: false, message: "ERROR CONFIG: No se encuentra el Bucket de Storage. Revisa firebaseConfig." };
        }
        return { success: false, message: "Aviso de conexión: " + e.message };
    }
};
