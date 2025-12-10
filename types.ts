
export interface FabricColor {
  name: string;
  hex?: string; // Optional simulated hex
  imageUrl?: string; // If we have a specific image for the color
}

export interface Fabric {
  id: string;
  name: string;
  supplier: string;
  technicalSummary: string;
  specs: {
    composition: string;
    weight?: string;
    martindale: string;
    usage: string;
  };
  colors: string[]; // List of color names
  colorImages?: Record<string, string>; // Map color name -> base64/url image
  mainImage: string; // Base64 or URL
  pdfUrl?: string; // Simulated
  specsImage?: string; // New: Image representation of the tech sheet
  category: 'model' | 'wood';
  customCatalog?: string; // New: Manual catalog name
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  sources?: { title: string; uri: string }[];
}

export type AppView = 'grid' | 'detail' | 'upload' | 'generator' | 'list';
