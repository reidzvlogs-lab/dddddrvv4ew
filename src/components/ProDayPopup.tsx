import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function ProDayPopup({ user, onClose }: { user: string, onClose: () => void }) {
  const handleClose = async () => {
    try {
      await updateDoc(doc(db, 'users', user), { showProDayPopup: false });
    } catch (e) {
      // ignore
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        className="bg-gradient-to-br from-amber-500 to-yellow-600 p-1 rounded-3xl max-w-md w-full shadow-2xl shadow-amber-500/20"
      >
        <div className="bg-zinc-950 p-8 rounded-[22px] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent pointer-events-none"></div>
          
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-6 mx-auto relative z-10">
            <Sparkles className="text-amber-400 w-8 h-8" />
          </div>
          
          <h2 className="text-3xl font-bold text-white text-center mb-2 relative z-10">ProDay Unlocked!</h2>
          <p className="text-amber-200/80 text-center mb-8 relative z-10">You've been granted exclusive access to premium features.</p>
          
          <div className="space-y-4 mb-8 relative z-10">
            <div className="flex items-center gap-3 text-white/90">
              <div className="w-2 h-2 rounded-full bg-amber-400"></div>
              <span>Advanced theming options</span>
            </div>
            <div className="flex items-center gap-3 text-white/90">
              <div className="w-2 h-2 rounded-full bg-amber-400"></div>
              <span>Custom profile pictures</span>
            </div>
            <div className="flex items-center gap-3 text-white/90">
              <div className="w-2 h-2 rounded-full bg-amber-400"></div>
              <span>Beta mode access</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-4 relative z-10">
            <button 
              onClick={handleClose}
              className="w-full bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-zinc-950 font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-amber-500/25"
            >
              Open
            </button>
            <button 
              onClick={handleClose}
              className="text-white/50 hover:text-white/80 underline text-sm transition-colors text-center"
            >
              View it later
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
