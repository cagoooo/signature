import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
    isLoading: boolean;
    message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isLoading, message = "處理中..." }) => {
    return (
        <AnimatePresence>
            {isLoading && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm"
                >
                    <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-sm w-full mx-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink rounded-full blur-lg opacity-50 animate-pulse"></div>
                            <div className="relative bg-white p-4 rounded-full shadow-sm">
                                <Loader2 className="w-12 h-12 text-vibrant-blue animate-spin" />
                            </div>
                        </div>

                        <motion.p
                            key={message}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-xl font-bold text-gray-700 text-center"
                        >
                            {message}
                        </motion.p>

                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mt-2">
                            <motion.div
                                className="h-full bg-gradient-to-r from-vibrant-blue via-vibrant-purple to-vibrant-pink"
                                initial={{ x: '-100%' }}
                                animate={{ x: '100%' }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                            />
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default LoadingOverlay;
