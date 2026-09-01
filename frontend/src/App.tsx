import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  PenTool, 
  Download, 
  AlertCircle, 
  FileText, 
  ShieldCheck, 
  Eraser, 
  Send, 
  RefreshCw, 
  X,
  Eye,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Check,
  Move,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertTriangle
} from './icons';

// Configure pdf.js worker for browser rendering
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
}

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:3000';

interface DocumentItem {
  id: string;
  title: string;
  status: 'pending' | 'completed';
  signer_email: string;
  created_at: string;
  signed_at?: string;
}

const AmbientGlow = () => (
  <div className="ambient-glow-container" aria-hidden="true">
    <div className="ambient-sphere-top-right" />
    <div className="ambient-sphere-mid-left" />
    <div className="ambient-sphere-bottom-right" />
  </div>
);

const InkFlowLogo = ({ size = 32, className = '' }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
  >
    <g fill="#e11d48">
      {/* Fountain Pen Nib Outline & Arch */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M96.5 27.2c-11.2 0-20.2 8.4-22.1 19.4l-3.2 18.5c-1.2 2.3-3.2 4.1-5.7 5.2L42.8 81c-4.8 2.2-7.8 7-7.8 12.3l-9.8 61.2c-.8 5.2 2.7 10 7.9 10.8 1.6.2 3.2 0 4.7-.8l41.5-22.5c4-2.2 6.8-5.8 7.9-10.3l10.2-40.8c.8-3.1 2.8-5.7 5.6-7.2l8.8-4.8c6.8-3.7 9.8-12 6.8-19.2-3.1-7.6-11.7-12.3-20.1-12.3zm-1.8 12.5c5.3 0 10.4 2.8 12.4 7.6 1.3 3.3.3 7-2.6 8.6l-8.8 4.8c-5.5 3-9.5 8.1-11 14.1l-10.2 40.8c-.6 2.3-2 4.1-4 5.2l-33.5 18.2 6.8-42.5c.3-2.6 1.8-5 4.2-6.1l22.7-10.7c4.9-2.3 8.8-6 11.2-10.6l3.2-18.5c.8-6.1 5.3-10.7 11.6-10.7z"
      />
      {/* Breather Hole & Slit */}
      <circle cx="70" cy="115" r="7.5" />
      <path d="M67.5 119l-30 46h5l29-45z" />
      {/* Ascending Arrow */}
      <path d="M48 145c36-12 73-38 104-74l-12-3.5c-3.5-.8-4.2-5.4-1.2-7.4l39.5-26.2c3.2-2.1 7.2.7 6.4 4.5l-9.5 45.2c-.8 3.8-5.3 4.8-7.7 1.8l-8.5-10.8c-28.5 34-63 58-99.5 73.5l-1.5-3.1z" />
      {/* Lower Right Base Stroke */}
      <path d="M125 125l24-28 17 18-20 28 32 .5 5 10.5-54 .5c-5 0-9-4-9-9 0-3 1.5-6 4-8l8-10.5-7-1.5z" />
    </g>
  </svg>
);

export default function App() {
  const [, setCurrentPath] = useState(window.location.pathname);
  const [signingDocId, setSigningDocId] = useState<string | null>(null);

  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      const match = path.match(/^\/sign\/([^/]+)/);
      if (match) {
        setSigningDocId(match[1]);
      } else {
        setSigningDocId(null);
      }
    };

    handleLocationChange();
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    const match = path.match(/^\/sign\/([^/]+)/);
    setSigningDocId(match ? match[1] : null);
  };

  if (signingDocId) {
    return <InteractiveSignerPortal documentId={signingDocId} onReturnHome={() => navigate('/')} />;
  }

  return <RequesterDashboard onNavigateToSign={(id) => navigate(`/sign/${id}`)} />;
}

/* =========================================================================
   1. INTERACTIVE SIGNER PORTAL (Soft Off-White Theme & Popout Signature)
   ========================================================================= */
function InteractiveSignerPortal({ documentId, onReturnHome }: { documentId: string; onReturnHome: () => void }) {
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [signerName, setSignerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [pdfTimestamp, setPdfTimestamp] = useState(Date.now());
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Signature state & popout modal
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signatureImageData, setSignatureImageData] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isModalDrawing, setIsModalDrawing] = useState(false);
  const [hasModalDrawn, setHasModalDrawn] = useState(false);

  // PDF Rendering State
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDocProxy, setPdfDocProxy] = useState<any>(null);
  const [numPages, setNumPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPagePtDimensions, setPdfPagePtDimensions] = useState<{ width: number; height: number }>({ width: 595.28, height: 841.89 });
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number; scale: number }>({ width: 620, height: 877, scale: 1.04 });
  const [pdfLoading, setPdfLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Interactive Signature Placement Position (in CSS Display Pixels relative to PDF Canvas top-left)
  const [stampPos, setStampPos] = useState<{ x: number; y: number }>({ x: 45, y: 700 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });

  // Standard stamp dimensions in PDF points (width: 140pt, height: 60pt)
  const STAMP_WIDTH_PT = 140;
  const STAMP_HEIGHT_PT = 60;

  // Display dimensions of the signature placement box
  const stampDisplayWidth = Math.round(STAMP_WIDTH_PT * displaySize.scale);
  const stampDisplayHeight = Math.round(STAMP_HEIGHT_PT * displaySize.scale);

  // Calculate PDF point coordinates (origin: bottom-left of PDF page)
  const getPdfCoordinates = useCallback(() => {
    const scale = displaySize.scale > 0 ? displaySize.scale : 1;
    const pdfX = Math.round(stampPos.x / scale);
    // In PDF coordinates, Y=0 is bottom
    const pdfY = Math.round(pdfPagePtDimensions.height - (stampPos.y / scale) - STAMP_HEIGHT_PT);
    return {
      x: Math.max(10, Math.min(Math.round(pdfPagePtDimensions.width - STAMP_WIDTH_PT - 10), pdfX)),
      y: Math.max(10, Math.min(Math.round(pdfPagePtDimensions.height - STAMP_HEIGHT_PT - 10), pdfY))
    };
  }, [stampPos, displaySize.scale, pdfPagePtDimensions]);

  // Fetch document details
  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/document/${documentId}`)
      .then(res => {
        if (!res.ok) throw new Error('Document not found or invalid signing link.');
        return res.json();
      })
      .then(data => {
        setDoc(data.document);
        if (data.document.status === 'completed') {
          setIsCompleted(true);
        } else if (data.document.signer_email) {
          const nameGuess = data.document.signer_email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          setSignerName(nameGuess);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Error loading document');
        setLoading(false);
      });
  }, [documentId]);

  // Load PDF Document with pdfjs
  useEffect(() => {
    let isMounted = true;
    setPdfLoading(true);

    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: `${API_BASE}/api/document/${documentId}/file?t=${pdfTimestamp}`
        });
        const loadedPdf = await loadingTask.promise;
        if (!isMounted) return;
        setPdfDocProxy(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setPdfLoading(false);
      } catch (err) {
        console.warn('PDF.js loading fallback:', err);
        if (isMounted) setPdfLoading(false);
      }
    };

    loadPdf();
    return () => {
      isMounted = false;
    };
  }, [documentId, pdfTimestamp]);

  // Render Current PDF Page onto Canvas
  const renderPdfPage = useCallback(async () => {
    if (!pdfDocProxy || !pdfCanvasRef.current || !pdfContainerRef.current) return;

    try {
      const page = await pdfDocProxy.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      setPdfPagePtDimensions({ width: unscaledViewport.width, height: unscaledViewport.height });

      // Determine display size based on container width and zoom level
      const containerWidth = pdfContainerRef.current.clientWidth || 700;
      const targetDisplayWidth = Math.min(Math.max(480, (containerWidth - 60) * zoomLevel), 860 * zoomLevel);
      const scale = targetDisplayWidth / unscaledViewport.width;
      const targetDisplayHeight = unscaledViewport.height * scale;

      setDisplaySize({ width: targetDisplayWidth, height: targetDisplayHeight, scale });

      // High-DPI Canvas Rendering
      const pixelRatio = window.devicePixelRatio || 1.5;
      const canvas = pdfCanvasRef.current;
      canvas.width = targetDisplayWidth * pixelRatio;
      canvas.height = targetDisplayHeight * pixelRatio;
      canvas.style.width = `${targetDisplayWidth}px`;
      canvas.style.height = `${targetDisplayHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        const scaledViewport = page.getViewport({ scale });
        const renderContext = {
          canvasContext: ctx,
          viewport: scaledViewport
        };
        await page.render(renderContext).promise;
      }

      // Initialize default stamp position near bottom-left if not set or out of bounds
      setStampPos(prev => {
        const defaultX = Math.round(50 * scale);
        const defaultY = Math.round(targetDisplayHeight - (STAMP_HEIGHT_PT + 40) * scale);
        if (prev.x === 45 && prev.y === 700) {
          return { x: defaultX, y: defaultY };
        }
        return {
          x: Math.max(0, Math.min(targetDisplayWidth - Math.round(STAMP_WIDTH_PT * scale), prev.x)),
          y: Math.max(0, Math.min(targetDisplayHeight - Math.round(STAMP_HEIGHT_PT * scale), prev.y))
        };
      });
    } catch (renderErr) {
      console.warn('Error rendering PDF page:', renderErr);
    }
  }, [pdfDocProxy, currentPage, zoomLevel]);

  useEffect(() => {
    renderPdfPage();
  }, [renderPdfPage]);

  // Window resize observer to re-render PDF canvas
  useEffect(() => {
    const handleResize = () => {
      renderPdfPage();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderPdfPage]);

  // Setup modal canvas when opened
  useEffect(() => {
    if (showSignatureModal && modalCanvasRef.current) {
      const canvas = modalCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000000'; // Black signature ink
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // If existing signature exists, draw it in modal
        if (signatureImageData) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, (canvas.width - img.width) / 2, (canvas.height - img.height) / 2);
            setHasModalDrawn(true);
          };
          img.src = signatureImageData;
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setHasModalDrawn(false);
        }
      }
    }
  }, [showSignatureModal, signatureImageData]);

  const clearCanvas = () => {
    setHasDrawn(false);
    setSignatureImageData(null);
  };

  // Modal Canvas Drawing Handlers (Spacious Drawing Canvas)
  const startModalDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsModalDrawing(true);
    setHasModalDrawn(true);
  };

  const drawModal = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isModalDrawing) return;
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopModalDrawing = () => {
    setIsModalDrawing(false);
  };

  const clearModalCanvas = () => {
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasModalDrawn(false);
    }
  };

  const handleApplyModalSignature = () => {
    if (!modalCanvasRef.current || !hasModalDrawn) {
      setShowSignatureModal(false);
      return;
    }
    const dataUrl = modalCanvasRef.current.toDataURL('image/png');
    setSignatureImageData(dataUrl);
    setHasDrawn(true);
    setShowSignatureModal(false);
  };

  // Drag & Drop & Click Handling on PDF Page Wrapper
  const handlePdfPageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging || isCompleted) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const newX = Math.max(0, Math.min(displaySize.width - stampDisplayWidth, clickX - stampDisplayWidth / 2));
    const newY = Math.max(0, Math.min(displaySize.height - stampDisplayHeight, clickY - stampDisplayHeight / 2));

    setStampPos({ x: Math.round(newX), y: Math.round(newY) });
  };

  const startStampDrag = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (isCompleted) return;
    e.stopPropagation();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = {
      mouseX: clientX,
      mouseY: clientY,
      startX: stampPos.x,
      startY: stampPos.y
    };
  };

  // Document-wide drag move and drag end listeners
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - dragStartRef.current.mouseX;
      const deltaY = clientY - dragStartRef.current.mouseY;

      const nextX = Math.max(0, Math.min(displaySize.width - stampDisplayWidth, dragStartRef.current.startX + deltaX));
      const nextY = Math.max(0, Math.min(displaySize.height - stampDisplayHeight, dragStartRef.current.startY + deltaY));

      setStampPos({ x: Math.round(nextX), y: Math.round(nextY) });
    };

    const handleEnd = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, displaySize, stampDisplayWidth, stampDisplayHeight]);

  const handleSubmitSignature = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) {
      setSubmitError('Please enter your full legal name.');
      return;
    }
    setSubmitError(null);
    setShowWarningModal(true);
  };

  const handleConfirmExecution = async () => {
    setShowWarningModal(false);
    setIsSubmitting(true);
    setSubmitError(null);

    const signatureImage: string | undefined = signatureImageData || undefined;
    const coords = getPdfCoordinates();

    try {
      const res = await fetch(`${API_BASE}/api/sign/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          signerName: signerName.trim(),
          signatureImage,
          x: coords.x,
          y: coords.y,
          pageNumber: currentPage
        }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setIsCompleted(true);
        setPdfTimestamp(Date.now()); // trigger canvas re-render with signed PDF
      } else {
        setSubmitError(data?.error || 'Failed to sign document.');
      }
    } catch (err: any) {
      setSubmitError(`Connection error (${err?.message || 'Server unreachable'}).`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 16px', color: '#2563eb' }} />
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.2px' }}>Loading Document Workspace...</h2>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '440px', width: '100%', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', padding: '32px', textAlign: 'center' }}>
          <AlertCircle size={40} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>Unable to Open Document</h2>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px', lineHeight: 1.5 }}>{error || 'Document not found.'}</p>
          <button onClick={onReturnHome} style={{ padding: '8px 16px', backgroundColor: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentPdfCoords = getPdfCoordinates();

  return (
    <div style={{ height: '100vh', backgroundColor: '#fafbfc', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <AmbientGlow />
      
      {/* Refined Top Navigation Bar */}
      <header className="signing-header-nav" style={{ height: '56px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0, zIndex: 30, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={onReturnHome} 
            className="pill-btn-secondary"
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            <ArrowLeft size={13} /> Dashboard
          </button>
          <div style={{ height: '16px', width: '1px', backgroundColor: '#e2e8f0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} color="#e11d48" />
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
          </div>
        </div>
      </header>

      {/* Main Workspace (Split View) */}
      <div className="signing-workspace-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        
        {/* LEFT: VISUAL PDF CANVAS & INTERACTIVE SIGNATURE PLACEMENT */}
        <div 
          ref={pdfContainerRef}
          className="signing-pdf-pane"
          style={{ 
            flex: '1 1 65%', 
            height: '100%', 
            backgroundColor: '#f8fafc', 
            position: 'relative', 
            borderRight: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Document Viewer Control Toolbar */}
          <div style={{ 
            height: '46px', 
            backgroundColor: '#ffffff', 
            borderBottom: '1px solid #e2e8f0', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            padding: '0 16px', 
            zIndex: 20, 
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569' }}>
              <Eye size={14} color="#e11d48" />
              <span style={{ fontWeight: 600, color: '#0f172a' }}>Interactive Viewer</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Multi-Page Navigation */}
              {numPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#f8fafc', padding: '2px 6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <button 
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    style={{ background: 'none', border: 'none', color: currentPage <= 1 ? '#cbd5e1' : '#475569', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: '11px', color: '#475569', padding: '0 4px', fontWeight: 500 }}>
                    Page {currentPage} of {numPages}
                  </span>
                  <button 
                    disabled={currentPage >= numPages}
                    onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                    style={{ background: 'none', border: 'none', color: currentPage >= numPages ? '#cbd5e1' : '#475569', cursor: currentPage >= numPages ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              {/* Zoom Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: '#f8fafc', padding: '2px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <button
                  onClick={() => setZoomLevel(z => Math.max(0.7, +(z - 0.1).toFixed(1)))}
                  style={{ background: 'none', border: 'none', color: '#475569', padding: '3px 6px', cursor: 'pointer', borderRadius: '4px' }}
                  title="Zoom Out"
                >
                  <ZoomOut size={12} />
                </button>
                <span style={{ fontSize: '11px', color: '#0f172a', minWidth: '34px', textAlign: 'center', fontWeight: 500 }}>
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel(z => Math.min(1.5, +(z + 0.1).toFixed(1)))}
                  style={{ background: 'none', border: 'none', color: '#475569', padding: '3px 6px', cursor: 'pointer', borderRadius: '4px' }}
                  title="Zoom In"
                >
                  <ZoomIn size={12} />
                </button>
                <button
                  onClick={() => setZoomLevel(1.0)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', padding: '3px 6px', cursor: 'pointer', borderRadius: '4px' }}
                  title="Reset Zoom"
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            </div>
          </div>

          {/* PDF Page Canvas Scrollable Viewport */}
          <div 
            style={{ 
              flex: 1, 
              overflow: 'auto', 
              padding: '24px', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'flex-start',
              backgroundImage: 'radial-gradient(circle at 50% 50%, #e2e8f0 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}
            className="custom-scrollbar"
          >
            {pdfLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#64748b' }}>
                <RefreshCw size={24} className="animate-spin" style={{ color: '#2563eb', marginBottom: '10px' }} />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Rendering PDF Document...</span>
              </div>
            ) : (
              /* Interactive PDF Page Container */
              <div
                onClick={handlePdfPageClick}
                style={{
                  position: 'relative',
                  width: `${displaySize.width}px`,
                  height: `${displaySize.height}px`,
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                  cursor: isCompleted ? 'default' : 'crosshair',
                  userSelect: 'none',
                  flexShrink: 0
                }}
              >
                {/* Visual Canvas Rendering of PDF */}
                <canvas
                  ref={pdfCanvasRef}
                  style={{
                    display: 'block',
                    borderRadius: '6px',
                    width: `${displaySize.width}px`,
                    height: `${displaySize.height}px`
                  }}
                />

                {/* DRAGGABLE & CLICKABLE SIGNATURE PLACEMENT BOX (Soft Off-White Style) */}
                {!isCompleted && (
                  <div
                    onMouseDown={startStampDrag}
                    onTouchStart={startStampDrag}
                    style={{
                      position: 'absolute',
                      left: `${stampPos.x}px`,
                      top: `${stampPos.y}px`,
                      width: `${stampDisplayWidth}px`,
                      height: `${stampDisplayHeight}px`,
                      backgroundColor: 'rgba(255, 255, 255, 0.96)',
                      border: isDragging ? '2px solid #e11d48' : '1.5px solid #f43f5e',
                      borderRadius: '8px',
                      boxShadow: isDragging ? '0 10px 28px rgba(244, 63, 94, 0.35), 0 0 12px rgba(244, 63, 94, 0.2)' : '0 4px 16px rgba(244, 63, 94, 0.2)',
                      backdropFilter: 'blur(6px)',
                      cursor: isDragging ? 'grabbing' : 'grab',
                      zIndex: 25,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: '6px 9px',
                      boxSizing: 'border-box',
                      transition: isDragging ? 'none' : 'box-shadow 0.15s ease'
                    }}
                  >
                    {/* Floating Coordinate Tooltip */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '-24px',
                        left: '0',
                        backgroundColor: '#ffffff',
                        border: '1px solid #f43f5e',
                        borderRadius: '9999px',
                        padding: '1px 8px',
                        fontSize: '9.5px',
                        fontWeight: 600,
                        color: '#e11d48',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        boxShadow: '0 2px 8px rgba(244, 63, 94, 0.15)'
                      }}
                    >
                      📍 X: {currentPdfCoords.x} pt, Y: {currentPdfCoords.y} pt
                    </div>

                    {/* Drag Handle Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #ffe4e6', paddingBottom: '3px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#e11d48', fontSize: '9px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                        <Move size={10} /> Signature Area
                      </div>
                      <span style={{ fontSize: '8.5px', color: '#64748b' }}>Drag or click page</span>
                    </div>

                    {/* Signature Preview Content inside Stamp (BLACK INK) */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '2px 0' }}>
                      {signatureImageData ? (
                        <img 
                          src={signatureImageData} 
                          alt="Signature Stroke" 
                          style={{ maxHeight: '28px', maxWidth: '100%', objectFit: 'contain' }} 
                        />
                      ) : (
                        <div style={{ fontSize: '10px', fontStyle: 'italic', color: '#94a3b8' }}>
                          ✍️ [Signature Area]
                        </div>
                      )}
                    </div>

                    {/* Signer Name Label */}
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderTop: '1px solid #ffe4e6', paddingTop: '2px', textAlign: 'center' }}>
                      {signerName || 'Your Name'}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: REFINED SIGNING STUDIO */}
        <div className="signing-studio-sidebar custom-scrollbar" style={{ flex: '0 0 390px', width: '390px', height: '100%', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', overflowY: 'auto', borderLeft: '1px solid #e2e8f0' }}>
          
          {!isCompleted ? (
            <div style={{ padding: '26px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
                  Execute Document
                </h2>
                <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '4px' }}>
                  Position your signature, draw in black ink, and seal the document.
                </p>
              </div>

              <form onSubmit={handleSubmitSignature} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Signer Legal Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Full Legal Name
                  </label>
                  <input
                    type="text"
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    placeholder="e.g. Alexander Vance"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '13px'
                    }}
                  />
                </div>

                {/* Signature Box (Automatically opens enlarged drawing modal on click) */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      Signature <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 400 }}>(Black ink)</span>
                    </label>
                    {hasDrawn && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearCanvas();
                        }}
                        className="pill-btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                      >
                        <Eraser size={11} /> Clear
                      </button>
                    )}
                  </div>
                  
                  {/* Clickable Signature Box */}
                  <div 
                    onClick={() => setShowSignatureModal(true)}
                    style={{ 
                      position: 'relative', 
                      border: signatureImageData ? '1.5px solid #f43f5e' : '1.5px dashed #fecdd3', 
                      borderRadius: '12px', 
                      backgroundColor: signatureImageData ? '#ffffff' : '#fffafb', 
                      height: '110px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease',
                      padding: '8px'
                    }}
                    onMouseEnter={e => {
                      if (!signatureImageData) {
                        e.currentTarget.style.borderColor = '#f43f5e';
                        e.currentTarget.style.backgroundColor = '#fff5f7';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!signatureImageData) {
                        e.currentTarget.style.borderColor = '#fecdd3';
                        e.currentTarget.style.backgroundColor = '#fffafb';
                      }
                    }}
                  >
                    {signatureImageData ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <img 
                          src={signatureImageData} 
                          alt="Drawn Signature" 
                          style={{ maxHeight: '65px', maxWidth: '90%', objectFit: 'contain' }} 
                        />
                        <span style={{ fontSize: '10px', color: '#e11d48', fontWeight: 600, marginTop: '4px' }}>
                          Click to redraw signature
                        </span>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: 'rgba(244, 63, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e11d48' }}>
                          <PenTool size={16} />
                        </div>
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}>
                          Click to draw signature
                        </span>
                        <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                          Opens spacious drawing pad
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Permanent Action Warning Callout */}
                <div style={{ padding: '10px 14px', borderRadius: '10px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', color: '#92400e', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '7px', lineHeight: 1.4 }}>
                  <AlertTriangle size={14} color="#d97706" style={{ flexShrink: 0 }} />
                  <span><strong>Permanent Action:</strong> Document cannot be edited once submitted.</span>
                </div>

                {/* Error Banner */}
                {submitError && (
                  <div style={{ padding: '9px 14px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Primary Action */}
                <button
                  type="submit"
                  disabled={isSubmitting || !signerName.trim()}
                  className="pill-btn-primary"
                  style={{ width: '100%', padding: '12px 20px', fontSize: '13px' }}
                >
                  <Send size={14} />
                  {isSubmitting ? 'Sealing Document...' : 'Sign & Stamp Document'}
                </button>
              </form>
            </div>
          ) : (
            /* Completed Screen */
            <div style={{ padding: '32px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: '14px' }}>
                <Check size={26} />
              </div>

              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                Document Executed
              </h2>
              <p style={{ fontSize: '12.5px', color: '#64748b', lineHeight: 1.5, marginBottom: '20px' }}>
                Your signature has been embedded into <strong style={{ color: '#0f172a' }}>{doc.title}</strong> at your chosen position.
              </p>

              <div style={{ width: '100%', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', textAlign: 'left', marginBottom: '20px', fontSize: '11.5px' }}>
                <div style={{ color: '#059669', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <ShieldCheck size={14} /> Execution Summary
                </div>
                <div style={{ color: '#334155', marginBottom: '3px' }}>• Signer: {signerName || doc.signer_email}</div>
                <div style={{ color: '#334155', marginBottom: '3px' }}>• Coordinates: X: {currentPdfCoords.x} pt, Y: {currentPdfCoords.y} pt</div>
                <div style={{ color: '#334155', marginBottom: '3px' }}>• Timestamp: {new Date().toLocaleString()}</div>
                <div style={{ color: '#334155' }}>• Status: Sealed & Stamped</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                <a
                  href={`${API_BASE}/api/download/${documentId}`}
                  download={`signed-${doc.title}`}
                  className="pill-btn-primary"
                  style={{
                    padding: '12px 18px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                    textDecoration: 'none',
                    fontSize: '13px'
                  }}
                >
                  <Download size={14} /> Download Signed PDF
                </a>
                <button
                  onClick={onReturnHome}
                  className="pill-btn-secondary"
                  style={{ padding: '10px 18px', fontSize: '12.5px' }}
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* =========================================================================
          POPOUT / ENLARGED SIGNATURE DRAWING MODAL
          ========================================================================= */}
      {showSignatureModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px'
        }}>
          <div className="modal-dialog-box saas-card" style={{
            maxWidth: '700px',
            width: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '20px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fafbfc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: 'rgba(244, 63, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e11d48' }}>
                  <PenTool size={16} />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    Draw Your Signature
                  </h3>
                  <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0 }}>
                    Use your mouse or touch screen to draw your signature in black ink below.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSignatureModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Canvas Body */}
            <div style={{ padding: '24px', backgroundColor: '#ffffff' }}>
              <div style={{
                position: 'relative',
                border: '1.5px solid #cbd5e1',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                overflow: 'hidden',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
              }}>
                <canvas
                  ref={modalCanvasRef}
                  width={656}
                  height={240}
                  onMouseDown={startModalDrawing}
                  onMouseMove={drawModal}
                  onMouseUp={stopModalDrawing}
                  onMouseLeave={stopModalDrawing}
                  onTouchStart={startModalDrawing}
                  onTouchMove={drawModal}
                  onTouchEnd={stopModalDrawing}
                  style={{ width: '100%', height: '240px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                />

                {/* Thicker Signature Baseline Guide */}
                <div style={{ position: 'absolute', bottom: '40px', left: '40px', right: '40px', height: '2px', borderBottom: '2px dashed #fb7185', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: '46px', left: '40px', fontSize: '11.5px', color: '#e11d48', fontWeight: 700, pointerEvents: 'none' }}>
                  ✕ Sign on the line
                </div>

                {!hasModalDrawn && (
                  <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', color: '#94a3b8', fontSize: '13px', pointerEvents: 'none' }}>
                    ✍️ Draw your signature here with mouse or pen
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', backgroundColor: '#fafbfc', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={clearModalCanvas}
                className="pill-btn-secondary"
                style={{ padding: '7px 16px', fontSize: '12px' }}
              >
                <Eraser size={13} /> Clear Canvas
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowSignatureModal(false)}
                  className="pill-btn-secondary"
                  style={{ padding: '7px 16px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyModalSignature}
                  className="pill-btn-primary"
                  style={{ padding: '7px 20px', fontSize: '12.5px' }}
                >
                  <Check size={14} /> Apply Signature
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONFIRMATION & PERMANENCE WARNING MODAL
          ========================================================================= */}
      {showWarningModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '20px'
        }}>
          <div className="modal-dialog-box saas-card" style={{
            maxWidth: '500px',
            width: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '20px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '18px 24px', borderBottom: '1px solid #fed7aa', backgroundColor: '#fff7ed' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: 'rgba(217, 119, 6, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', flexShrink: 0 }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#9a3412', margin: 0 }}>
                  Confirm Permanent Execution
                </h3>
                <p style={{ fontSize: '12px', color: '#c2410c', margin: '2px 0 0' }}>
                  Please review carefully before sealing.
                </p>
              </div>
            </div>

            {/* Warning Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', fontSize: '12.5px', lineHeight: 1.5 }}>
                ⚠️ <strong>Cannot be edited or undone:</strong> Once submitted, your signature and legal name will be permanently stamped into this PDF. You will <strong>not be able to edit or modify</strong> this submission afterwards.
              </div>

              {/* Summary of Data to be stamped */}
              <div style={{ backgroundColor: '#fafbfc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                  Submission Summary:
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a' }}>
                  <span style={{ color: '#64748b' }}>Signer Legal Name:</span>
                  <strong>{signerName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a' }}>
                  <span style={{ color: '#64748b' }}>Signature Stroke:</span>
                  <span style={{ color: signatureImageData ? '#16a34a' : '#ea580c', fontWeight: 600 }}>
                    {signatureImageData ? '✓ Attached (Black Ink)' : 'Name Stamp Only'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a' }}>
                  <span style={{ color: '#64748b' }}>Document:</span>
                  <span style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a' }}>
                  <span style={{ color: '#64748b' }}>Placement:</span>
                  <span>Page {currentPage} (X: {currentPdfCoords.x} pt, Y: {currentPdfCoords.y} pt)</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', padding: '16px 24px', backgroundColor: '#fafbfc', borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => setShowWarningModal(false)}
                className="pill-btn-secondary"
                style={{ padding: '8px 18px', fontSize: '12.5px' }}
              >
                Go Back & Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmExecution}
                className="pill-btn-primary"
                style={{
                  padding: '9px 20px',
                  fontSize: '12.5px',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)'
                }}
              >
                <Send size={13} /> Confirm & Sign Document
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* =========================================================================
   2. REQUESTER DASHBOARD (Soft Off-White Minimalist Card View)
   ========================================================================= */
function RequesterDashboard({ onNavigateToSign }: { onNavigateToSign: (docId: string) => void }) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [signerEmail, setSignerEmail] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Documents Activity List
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Fetch document list
  const fetchDocuments = () => {
    setLoadingDocs(true);
    fetch(`${API_BASE}/api/documents`)
      .then(res => res.json())
      .then(data => {
        if (data.documents) setDocuments(data.documents);
        setLoadingDocs(false);
      })
      .catch(() => setLoadingDocs(false));
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const fileList = Array.from(e.target.files);
    
    // Check if any non-pdf
    const invalid = fileList.find(f => !f.name.toLowerCase().endsWith('.pdf'));
    if (invalid) {
      setUploadError(`Unsupported file format in "${invalid.name}". InkFlow only accepts PDF files (.pdf).`);
      return;
    }

    setUploadError(null);
    setSelectedFiles(prev => [...prev, ...fileList]);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadAndDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (selectedFiles.length === 0) {
      setUploadError('Please select at least one PDF file to upload.');
      return;
    }

    if (!signerEmail.trim()) {
      setUploadError('Please enter the signer email address.');
      return;
    }

    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append('files', file);
    });
    formData.append('signerEmail', signerEmail.trim());

    setIsUploading(true);
    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedFiles([]);
        setSignerEmail('');
        fetchDocuments();
      } else {
        setUploadError(data.error || 'Failed to upload documents.');
      }
    } catch (err) {
      setUploadError('Error connecting to backend server.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/api/document/${docId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
      } else {
        alert('Failed to remove document.');
      }
    } catch {
      alert('Error connecting to backend server.');
    }
  };

  return (
    <div className="dashboard-wrapper" style={{ maxWidth: '980px', margin: '0 auto', padding: '48px 20px 80px', position: 'relative', zIndex: 1 }}>
      <AmbientGlow />

      {/* Modern High-End SaaS Header */}
      <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
          <InkFlowLogo size={38} />
          <h1 style={{ fontSize: '32px', fontWeight: 800, margin: 0, color: '#0f172a', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
            Ink<span className="gradient-text-accent">Flow</span>
          </h1>
        </div>
        <p style={{ fontSize: '14px', color: '#64748b', margin: '8px 0 0', fontWeight: 400, maxWidth: '440px' }}>
          Execute and manage secure digital contracts with precision and zero friction.
        </p>
      </header>

      {/* UNIFIED WORKFLOW CONTAINER */}
      <div className="saas-card" style={{ padding: '30px', marginBottom: '30px' }}>
        
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.2px' }}>
            Upload & Dispatch Documents
          </h2>
        </div>

        <form onSubmit={handleUploadAndDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Dropzone */}
          <div>
            <div 
              style={{ 
                border: '1.5px dashed #fecdd3', 
                borderRadius: '14px', 
                padding: '28px 20px', 
                textAlign: 'center', 
                backgroundColor: '#fffafb', 
                position: 'relative', 
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
            >
              <input 
                type="file" 
                accept="application/pdf"
                multiple
                onChange={handleFilesSelected}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
              />
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                Choose PDF documents or drag & drop
              </p>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                Supports multi-document batch signing (.pdf)
              </p>
            </div>

            {/* Selected Files Badge List */}
            {selectedFiles.length > 0 && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '11.5px', color: '#e11d48', fontWeight: 600 }}>
                  {selectedFiles.length} document(s) ready to dispatch:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '100px', overflowY: 'auto' }} className="custom-scrollbar">
                  {selectedFiles.map((f, index) => (
                    <div 
                      key={index} 
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        backgroundColor: '#fff1f2',
                        border: '1px solid #fecdd3',
                        borderRadius: '9999px',
                        fontSize: '11.5px',
                        color: '#9f1239'
                      }}
                    >
                      <FileText size={12} color="#e11d48" />
                      <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.name}</span>
                      <span style={{ color: '#be123c', fontSize: '10.5px' }}>({(f.size / 1024).toFixed(0)}KB)</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedFile(index)}
                        style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Signer Email Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Signer Email Address
            </label>
            <input 
              type="email" 
              value={signerEmail}
              onChange={e => setSignerEmail(e.target.value)}
              placeholder="signer@enterprise.com"
              required
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '13px' }}
            />
          </div>

          {uploadError && (
            <div style={{ padding: '9px 14px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
              <span>{uploadError}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={isUploading || selectedFiles.length === 0 || !signerEmail.trim()}
              className="pill-btn-primary"
              style={{ padding: '11px 24px', fontSize: '13px' }}
            >
              <Send size={13} />
              {isUploading ? 'Dispatching...' : `Dispatch ${selectedFiles.length > 1 ? `(${selectedFiles.length}) Documents` : 'for Signature'}`}
            </button>
          </div>
        </form>

      </div>

      {/* Execution Tracker & Documents List */}
      <div className="saas-card" style={{ padding: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.2px' }}>
                DashBoard
              </h2>
              <span className="pill-badge" style={{ fontSize: '11px', padding: '2px 9px' }}>
                {documents.length} items
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={fetchDocuments}
              disabled={loadingDocs}
              className="pill-btn-secondary"
            >
              <RefreshCw size={13} className={loadingDocs ? 'animate-spin' : ''} /> {loadingDocs ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Fixed Permanent Scrollable Dashboard Table Container (Size Never Changes) */}
        <div className="dashboard-fixed-table-box custom-scrollbar">
          <table style={{ width: '100%', minWidth: '580px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fafbfc', zIndex: 10, borderBottom: '1px solid #e2e8f0' }}>
              <tr style={{ color: '#64748b' }}>
                <th style={{ padding: '12px 14px', backgroundColor: '#fafbfc', fontWeight: 600 }}>Document Name</th>
                <th style={{ padding: '12px 14px', backgroundColor: '#fafbfc', fontWeight: 600 }}>Signer Email</th>
                <th style={{ padding: '12px 14px', backgroundColor: '#fafbfc', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 14px', backgroundColor: '#fafbfc', fontWeight: 600 }}>Created</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', backgroundColor: '#fafbfc', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '80px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        <FileText size={20} />
                      </div>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#475569' }}>
                        No documents in dashboard
                      </span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                        Upload and dispatch PDF contracts above to track execution
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                documents.map((docItem) => (
                  <tr 
                    key={docItem.id}
                    style={{ 
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background-color 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fff5f7'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '11px 14px', color: '#0f172a', fontWeight: 500, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileText size={13} color="#e11d48" />
                        <span>{docItem.title}</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', color: '#475569' }}>
                      {docItem.signer_email}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {docItem.status === 'completed' ? (
                        <span className="pill-badge" style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#059669', borderColor: 'rgba(16,185,129,0.25)', fontSize: '10.5px', padding: '2px 8px' }}>
                          ✓ Executed
                        </span>
                      ) : (
                        <span className="pill-badge" style={{ fontSize: '10.5px', padding: '2px 8px' }}>
                          Pending
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', color: '#64748b', fontSize: '11.5px' }}>
                      {new Date(docItem.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                        {docItem.status === 'completed' ? (
                          <a
                            href={`${API_BASE}/api/download/${docItem.id}`}
                            download
                            className="pill-btn-secondary"
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              color: '#059669',
                              borderColor: '#bbf7d0',
                              backgroundColor: '#f0fdf4'
                            }}
                          >
                            <Download size={11} /> PDF
                          </a>
                        ) : (
                          <button
                            onClick={() => onNavigateToSign(docItem.id)}
                            className="pill-btn-primary"
                            style={{
                              padding: '4px 12px',
                              fontSize: '11px',
                              boxShadow: 'none'
                            }}
                          >
                            <PenTool size={11} /> Sign
                          </button>
                        )}

                        {/* Close / Remove Document Button */}
                        <button
                          onClick={(e) => handleDeleteDocument(docItem.id, e)}
                          title="Close / Remove Document"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '5px 7px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '9999px',
                            color: '#64748b',
                            cursor: 'pointer',
                            fontSize: '11px',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = '#fee2e2';
                            e.currentTarget.style.borderColor = '#fca5a5';
                            e.currentTarget.style.color = '#dc2626';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = '#ffffff';
                            e.currentTarget.style.borderColor = '#cbd5e1';
                            e.currentTarget.style.color = '#64748b';
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
