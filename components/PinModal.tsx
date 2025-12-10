import React, { useState, useEffect } from 'react';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PinModal: React.FC<PinModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === '3942') {
        setTimeout(() => {
            onSuccess();
            onClose();
        }, 200);
      } else {
        setError(true);
        setTimeout(() => {
            setPin('');
            setError(false);
        }, 500);
      }
    }
  }, [pin, onSuccess, onClose]);

  if (!isOpen) return null;

  const handleNumClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white w-72 rounded-3xl shadow-2xl overflow-hidden flex flex-col p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-300 hover:text-black"
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="text-center mb-6 mt-2">
            <h3 className="font-serif text-xl font-bold text-slate-900">Seguridad</h3>
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Ingresa la contraseña</p>
        </div>

        {/* PIN Display */}
        <div className="flex justify-center space-x-3 mb-8 h-8">
            {[0, 1, 2, 3].map((i) => (
                <div 
                    key={i} 
                    className={`w-4 h-4 rounded-full border border-gray-300 transition-all duration-200 ${
                        i < pin.length 
                            ? error ? 'bg-red-500 border-red-500' : 'bg-black border-black' 
                            : 'bg-transparent'
                    }`}
                />
            ))}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 justify-items-center">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                    key={num}
                    onClick={() => handleNumClick(num.toString())}
                    className="w-14 h-14 rounded-full bg-gray-50 text-xl font-bold text-slate-700 hover:bg-gray-200 hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-sm"
                >
                    {num}
                </button>
            ))}
            
            {/* Empty space for alignment */}
            <div className="w-14 h-14"></div> 
            
            <button
                onClick={() => handleNumClick('0')}
                className="w-14 h-14 rounded-full bg-gray-50 text-xl font-bold text-slate-700 hover:bg-gray-200 hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-sm"
            >
                0
            </button>

            <button
                onClick={handleBackspace}
                className="w-14 h-14 rounded-full text-gray-400 hover:text-black hover:bg-gray-100 flex items-center justify-center transition-all"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>
            </button>
        </div>
      </div>
    </div>
  );
};

export default PinModal;