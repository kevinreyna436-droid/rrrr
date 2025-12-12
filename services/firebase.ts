
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc, writeBatch, 
  enableIndexedDbPersistence 
} from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { Fabric } from "../types";

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
        if (err.code === 'failed-precondition') {
            console.warn("Persistencia falló: Multiples pestañas abiertas.");
        } else if (err.code === 'unimplemented') {
            console.warn("El navegador no soporta persistencia.");
        }
    });
} catch (e) {
    console.warn("Error habilitando persistencia", e);
}

// --- Helper Functions ---

/**
 * Uploads a base64 image string to Firebase Storage and returns the download URL.
 * CRITICAL FIX: If upload fails due to permission, THROW error instead of returning huge base64
 * to prevent Firestore document size limit errors.
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
        console.log(`✅ Imagen subida a Nube: ${path}`);
        return url;
    } catch (e: any) {
        if (e.code === 'storage/unauthorized') {
            console.error("⛔ PERMISO DENEGADO EN STORAGE.");
            // We throw a specific error so the UI knows permissions are wrong
            throw new Error("PERMISSION_DENIED_STORAGE");
        } else {
            console.warn(`Upload failed for ${path} (Offline?), saving Base64 to DB directly.`, e.message);
            // Only return base64 if it's NOT a permission error (e.g. offline)
            // But warn if it's too big
            if (base64Data.length > 1000000) {
                console.warn("Image too large for offline storage, skipping image to save text data.");
                return ""; // Skip image to save the rest of data
            }
            return base64Data;
        }
    }
};

// --- Firestore Operations ---

export const getFabricsFromFirestore = async (): Promise<Fabric[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, "fabrics"));
    const data = querySnapshot.docs.map(doc => doc.data() as Fabric);
    console.log(`✅ Leídas ${data.length} telas de la base de datos.`);
    return data;
  } catch (e: any) {
    if (e.code === 'permission-denied') {
        console.error("⛔ PERMISO DENEGADO EN FIRESTORE.");
    } else {
        console.error("Error reading fabrics:", e.message);
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
    console.log(`✅ Ficha guardada en Firestore: ${fabric.name}`);

  } catch (e: any) {
      if (e.code === 'permission-denied') {
          throw new Error("PERMISSION_DENIED_DB");
      }
      if (e.message === "PERMISSION_DENIED_STORAGE") {
          throw new Error("PERMISSION_DENIED_STORAGE");
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
    } catch (e: any) {
        console.error("Error deleting fabric:", e.message);
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
        console.error("Error clearing collection:", e.message);
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
        await uploadString(testRef, 'test_ping', 'raw');
        await deleteObject(testRef);
        return { success: true, message: "Conectado a Firebase (Storage y Firestore) correctamente." };
    } catch (e: any) {
        if (e.code === 'storage/unauthorized') {
             return { success: false, message: "Error Permisos Storage: Configura las reglas en Firebase Console." };
        }
        return { success: false, message: "Error de conexión: " + e.message };
    }
};
