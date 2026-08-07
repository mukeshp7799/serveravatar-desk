'use client'
import React, { useEffect, useState, createContext, useContext, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ─── Module-level singleton ────────────────────────────────────────────────────
type ModalContent = React.ReactNode | null
let _setModal: (c: ModalContent) => void = () => {}

// ─── Context ─────────────────────────────────────────────────────────────────
const ModalCtx = createContext<(c: ModalContent) => void>(() => {})

export function useModal() {
  return useContext(ModalCtx)
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function ModalProvider({ children }: { children: React.ReactNode }) {
  return <ModalCtx.Provider value={_setModal}>{children}</ModalCtx.Provider>
}

// ─── Portal (default export) ─────────────────────────────────────────────────
export default function ModalPortal() {
  const [mounted, setMounted] = useState(false)
  const [content, setContent] = useState<ModalContent>(null)

  useEffect(() => {
    setMounted(true)
    _setModal = setContent
    return () => { _setModal = () => {} }
  }, [])

  if (!mounted) return null
  return createPortal(content, document.body)
}
