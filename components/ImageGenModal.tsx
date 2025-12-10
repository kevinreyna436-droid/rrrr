import React, { useState } from 'react';
import { generateFabricDesign } from '../services/geminiService';

interface ImageGenModalProps {
  onClose: () => void;
}

const ImageGenModal: React.FC<ImageGenModalProps> = ({ onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [size, setSize] = useState('1K');
  const [loading, setLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    setResultImage(null);
    try {
      const img = await generateFabricDesign(prompt, aspectRatio, size);
      setResultImage(img);
    } catch (e) {
      alert("Failed to generate image.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-3xl overflow-hidden flex flex-col md:flex-row shadow-2xl">
        
        {/* Left: Controls */}
        <div className="w-full md:w-1/3 p-8 border-r border-gray-100 overflow-y-auto bg-gray-50">
          <button onClick={onClose} className="mb-6 text-gray-400 hover:text-black font-medium flex items-center">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg> Back
          </button>
          <h2 className="font-serif text-3xl mb-6">Design Studio</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Prompt</label>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A velvet texture with golden floral embroidery..."
                className="w-full h-32 p-4 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black resize-none"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Aspect Ratio</label>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="w-full p-3 rounded-lg border border-gray-200">
                  <option value="1:1">1:1 (Square)</option>
                  <option value="3:4">3:4 (Portrait)</option>
                  <option value="4:3">4:3 (Landscape)</option>
                  <option value="16:9">16:9 (Wide)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-400 mb-2">Resolution</label>
                <select value={size} onChange={(e) => setSize(e.target.value)} className="w-full p-3 rounded-lg border border-gray-200">
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
              </div>
            </div>

            <button 
              onClick={handleGenerate}
              disabled={loading || !prompt}
              className="w-full bg-black text-white py-4 rounded-xl font-bold tracking-wide hover:opacity-80 disabled:opacity-50 transition-all"
            >
              {loading ? 'Generating...' : 'Create Fabric'}
            </button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 bg-gray-900 flex items-center justify-center p-8 relative">
           {loading ? (
             <div className="text-white text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                <p className="font-serif animate-pulse">Weaving digital threads...</p>
             </div>
           ) : resultImage ? (
             <img src={resultImage} alt="Generated" className="max-w-full max-h-full rounded-lg shadow-2xl" />
           ) : (
             <div className="text-gray-500 text-center">
               <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
               <p>Enter a prompt to start designing</p>
             </div>
           )}
           
           {resultImage && (
             <div className="absolute bottom-8 text-white bg-black/50 px-4 py-2 rounded-full text-sm">
                Generated with Gemini 3 Pro
             </div>
           )}
        </div>

      </div>
    </div>
  );
};

export default ImageGenModal;
