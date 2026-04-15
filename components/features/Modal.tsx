"use client"

import { useEffect } from "react"

type ModalProps  = {
    isOpen: boolean 
    onClose: () =>  void
    children: React.ReactNode
    title?: string
}

export function Modal({isOpen, onClose, children, title}: ModalProps) {


    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if(e.key === "Escape") onClose();
        }
        if(isOpen) {
            document.addEventListener("keydown", handleEscape);
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "";
        }

    }, [isOpen, onClose])

    if(!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={title ? "modal-title" : undefined}>
            <button 
                type="button"
                onClick={onClose}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                aria-label="Close Modal"
            />

{/* modal content */}
            <div 
                className="relative w-full max-w-xl max-h-[85vh] overflow-auto rounded-xl bg-white dark:bg-zinc-900 shadow-xl border border-zinc-200 dark:border-zinc-700 flex flex-col" 
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between shrink-0 px-5 py-4 border-b border-zinc-200 dark:border-zinc-700">
                    {
                        title ? (
                            <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
                        ) : (
                            <span />
                        )
                    }
                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-auto p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100  dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
                        aria-label="Close"
                    >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                        </svg>

                    </button>
                </div>

                <div className="flex-1 p-5 overflow-auto">{children}</div>


            </div>
        </div>
    );

}