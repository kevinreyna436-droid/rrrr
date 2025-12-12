
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch, 
  enableIndexedDbPersistence 
} from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { Fabric } from "../types";
import { compressBase64 } from "../utils/imageCompression";

// --- CONFIGURACIÓN DE FIREBASE ---
// Credenciales para proyecto 'telas' (ID: proyecto-1-23086)
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

// Enable Offline Persistence
try {
    enableIndexedDbPersistence(db).catch((err) => {
        console.warn("Persistencia offline:", err.code);
    });
} catch (e) {
    console.warn("Error habilitando persistencia", e);
}

// --- Helper Functions ---

/**
 * Uploads a base64 image string to Firebase Storage.
 * FALLBACK: If Storage fails (CORS, Permissions), it compresses the image
 * to a small size and returns the Base64 to be saved in Firestore directly.
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
        console.log(`✅ IMAGEN SUBIDA A STORAGE: ${path}`);
        return url;
    } catch (e: any) {
        console.warn(`⚠️ FALLÓ STORAGE (${path}): ${e.code}. Intentando respaldo local...`);

        // FALLBACK STRATEGY:
        // Firestore has a 1MB limit per document. We must ensure this image is small.
        // We compress it to max 600px width and 0.6 quality.
        try {
            const smallBase64 = await compressBase64(base64Data);
            if (smallBase64.length < 900000) { // Safety buffer for Firestore limit
                console.log(`✅ RESPALDO EXITOSO: Imagen comprimida para guardar en BD (${Math.round(smallBase64.length/1024)}KB).`);
                return smallBase64;
            } else {
                throw new Error("IMAGE_STILL_TOO_LARGE");
            }
        } catch (resizeError) {
            console.error("❌ Falló el redimensionado de respaldo.", resizeError);
            // If we can't resize, we can't save it. Return empty or placeholder?
            // Returning empty string prevents crashing the whole save.
            return ""; 
        }
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

export const getFabricsFromFirestore = async (): Promise<Fabric[] | null> => {
  try {
    const querySnapshot: any = await timeoutPromise(8000, getDocs(collection(db, "fabrics")));
    const data = querySnapshot.docs.map((doc: any) => doc.data() as Fabric);
    console.log(`✅ CONEXIÓN EXITOSA: Se cargaron ${data.length} telas.`);
    return data;
  } catch (e: any) {
    if (e.message !== "TIMEOUT") console.error("Error leyendo telas:", e.message);
    return null;
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
        
        const uploadPromises = entries.map(async ([color, base64]) => {
            const safeColor = color.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const url = await uploadImage(`fabrics/${fabric.id}/colors/${safeColor}.jpg`, base64);
            return { color, url };
        });

        const results = await Promise.all(uploadPromises);
        results.forEach(res => {
            if (res.url) { // Only save if we got a valid string back (URL or Base64)
                newColorImages[res.color] = res.url;
            }
        });
        
        updatedFabric.colorImages = newColorImages;
    }

    // 4. Save metadata to Firestore
    await setDoc(doc(db, "fabrics", fabric.id), updatedFabric);
    console.log(`✅ GUARDADO EXITOSO EN BD: ${fabric.name}`);

  } catch (e: any) {
      console.error("CRITICAL SAVE ERROR:", e);
      if (e.code === 'resource-exhausted') throw new Error("DOC_TOO_LARGE");
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
        const testRef = ref(storage, 'diagnostics/test_connection.txt');
        await timeoutPromise(3000, uploadString(testRef, 'test_ping', 'raw'));
        await deleteObject(testRef);
        return { success: true, message: "Conexión estable." };
    } catch (e: any) {
        return { success: false, message: e.code || e.message };
    }
};
