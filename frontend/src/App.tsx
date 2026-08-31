import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  FileUp, 
  PenTool, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  ShieldCheck, 
  Eraser, 
  Sparkles, 
  Clock, 
  Server, 
  Mail, 
  Send, 
  ExternalLink, 
  RefreshCw, 
  Lock, 
  X,
  Eye,
  Layers,
  ArrowLeft,
  ChevronRight,
  Check
} from 'lucide-react';

const API_BASE = 'http://localhost:3000';

interface UploadedDocumentItem {
  id: string;
  fileName: string;
  signUrl: string;
}

interface UploadResponse {
  success: boolean;
  count: number;
  documents: UploadedDocumentItem[];
  emailPreview: {
    to: string;
    from: string;
    subject: string;
    body: string;
    link: string;
    documents?: UploadedDocumentItem[];
    dispatchedAt: string;
  };
}

interface DocumentItem {
  id: string;
  title: string;
  status: 'pending' | 'completed';
  signer_email: string;
  created_at: string;
  signed_at?: string;
}

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
   1. INTERACTIVE SIGNER PORTAL (Minimalist & Professional PDF Studio)
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

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

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

  // Canvas Setup
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [loading, isCompleted]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  };

  const handleSubmitSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) {
      setSubmitError('Please enter your full legal name.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    let signatureImage: string | undefined = undefined;
    if (canvasRef.current && hasDrawn) {
      signatureImage = canvasRef.current.toDataURL('image/png');
    }

    try {
      const res = await fetch(`${API_BASE}/api/sign/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          signerName: signerName.trim(),
          signatureImage
        }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
        setIsCompleted(true);
        setPdfTimestamp(Date.now()); // trigger iframe reload to show stamped PDF
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
      <div style={{ minHeight: '100vh', backgroundColor: '#090c14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 16px', color: '#3b82f6' }} />
          <h2 style={{ fontSize: '15px', fontWeight: 500, color: '#f8fafc', letterSpacing: '-0.2px' }}>Loading Document Workspace...</h2>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#090c14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '440px', width: '100%', backgroundColor: '#101420', borderRadius: '12px', border: '1px solid #1e2638', padding: '32px', textAlign: 'center' }}>
          <AlertCircle size={40} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>Unable to Open Document</h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '24px', lineHeight: 1.5 }}>{error || 'Document not found.'}</p>
          <button onClick={onReturnHome} style={{ padding: '8px 16px', backgroundColor: '#171d2e', color: '#f8fafc', border: '1px solid #2a354c', borderRadius: '6px', fontSize: '13px' }}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const pdfUrl = `${API_BASE}/api/document/${documentId}/file?t=${pdfTimestamp}`;

  return (
    <div style={{ height: '100vh', backgroundColor: '#090c14', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Refined Top Navigation Bar */}
      <header style={{ height: '52px', backgroundColor: '#101420', borderBottom: '1px solid #1e2638', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onReturnHome} style={{ background: 'none', border: 'none', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px' }}>
            <ArrowLeft size={15} /> Dashboard
          </button>
          <div style={{ height: '14px', width: '1px', backgroundColor: '#1e2638' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} color="#3b82f6" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
            <Lock size={12} color="#10b981" />
            <span>256-Bit Encrypted</span>
          </div>
          <span style={{
            fontSize: '11px',
            padding: '3px 10px',
            borderRadius: '20px',
            fontWeight: 600,
            backgroundColor: isCompleted ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
            color: isCompleted ? '#34d399' : '#60a5fa',
            border: isCompleted ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(59,130,246,0.25)'
          }}>
            {isCompleted ? '✓ Completed' : 'Action Required'}
          </span>
        </div>
      </header>

      {/* Main Workspace (Split View) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* LEFT: EMBEDDED PDF VIEWER */}
        <div style={{ flex: '1 1 65%', height: '100%', backgroundColor: '#070a0f', position: 'relative', borderRight: '1px solid #1e2638' }}>
          <div style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '6px', backgroundColor: 'rgba(16,20,32,0.85)', backdropFilter: 'blur(8px)', border: '1px solid #1e2638', fontSize: '11px', color: '#94a3b8' }}>
            <Eye size={13} color="#3b82f6" /> Document Viewer
          </div>

          <iframe
            src={pdfUrl}
            title={doc.title}
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#101420' }}
          />
        </div>

        {/* RIGHT: REFINED SIGNING STUDIO */}
        <div style={{ flex: '0 0 380px', width: '380px', height: '100%', backgroundColor: '#101420', display: 'flex', flexDirection: 'column', overflowY: 'auto' }} className="custom-scrollbar">
          
          {!isCompleted ? (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#3b82f6', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>
                  <PenTool size={13} /> Digital Signature
                </div>
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: 0, letterSpacing: '-0.2px' }}>
                  Execute Document
                </h2>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Review terms on the left, then apply your signature below.
                </p>
              </div>

              <form onSubmit={handleSubmitSignature} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Signer Legal Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }}>
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
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#171d2e',
                      border: '1px solid #1e2638',
                      color: '#f8fafc',
                      fontSize: '13px'
                    }}
                  />
                </div>

                {/* Drawn Signature Canvas */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#cbd5e1' }}>
                      Draw Signature
                    </label>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', backgroundColor: '#171d2e', border: '1px solid #1e2638', borderRadius: '4px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}
                    >
                      <Eraser size={11} /> Clear
                    </button>
                  </div>
                  
                  <div style={{ position: 'relative', border: '1px solid #1e2638', borderRadius: '6px', backgroundColor: '#171d2e', overflow: 'hidden' }}>
                    <canvas
                      ref={canvasRef}
                      width={332}
                      height={110}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      style={{ width: '100%', height: '110px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                    />
                    {!hasDrawn && (
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', color: '#64748b', fontSize: '11px' }}>
                        Draw signature here
                      </div>
                    )}
                  </div>
                </div>

                {/* Stamping Preview Box */}
                <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#0c101a', border: '1px solid #1e2638' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={12} color="#3b82f6" /> Document Overlay Preview:
                  </div>
                  <div style={{ padding: '8px 10px', backgroundColor: '#101420', borderRadius: '4px', borderLeft: '2px solid #3b82f6' }}>
                    <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600, marginBottom: '2px' }}>
                      {hasDrawn ? '✓ Drawn Signature Attached' : '[Signature Stroke]'}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>Signed by: {signerName || '(Your Name)'}</div>
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Date: {new Date().toLocaleDateString()}</div>
                  </div>
                </div>

                {/* Error Banner */}
                {submitError && (
                  <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Primary Action */}
                <button
                  type="submit"
                  disabled={isSubmitting || !signerName.trim()}
                  style={{
                    padding: '11px 16px',
                    borderRadius: '6px',
                    backgroundColor: isSubmitting || !signerName.trim() ? '#1e2638' : '#2563eb',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    cursor: isSubmitting || !signerName.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Send size={14} />
                  {isSubmitting ? 'Sealing Document...' : 'Sign & Submit Document'}
                </button>
              </form>
            </div>
          ) : (
            /* Completed Screen */
            <div style={{ padding: '32px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: '14px' }}>
                <Check size={24} />
              </div>

              <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#f8fafc', marginBottom: '6px' }}>
                Document Executed
              </h2>
              <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '20px' }}>
                Your signature has been embedded into <strong style={{ color: '#f8fafc' }}>{doc.title}</strong> and saved to the registry.
              </p>

              <div style={{ width: '100%', backgroundColor: '#171d2e', border: '1px solid #1e2638', borderRadius: '6px', padding: '12px', textAlign: 'left', marginBottom: '20px', fontSize: '11px' }}>
                <div style={{ color: '#34d399', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={13} /> Verified Audit Entry
                </div>
                <div style={{ color: '#cbd5e1' }}>• Signer: {signerName || doc.signer_email}</div>
                <div style={{ color: '#cbd5e1' }}>• Timestamp: {new Date().toLocaleString()}</div>
                <div style={{ color: '#cbd5e1' }}>• Status: Sealed & Archived</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                <a
                  href={`${API_BASE}/api/download/${documentId}`}
                  download={`signed-${doc.title}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  <Download size={14} /> Download Signed PDF
                </a>
                <button
                  onClick={onReturnHome}
                  style={{
                    padding: '9px 14px',
                    backgroundColor: '#171d2e',
                    color: '#94a3b8',
                    border: '1px solid #1e2638',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   2. REQUESTER DASHBOARD (Unified Minimalist Workflow Card)
   ========================================================================= */
function RequesterDashboard({ onNavigateToSign }: { onNavigateToSign: (docId: string) => void }) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [signerEmail, setSignerEmail] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [recentDispatch, setRecentDispatch] = useState<UploadResponse | null>(null);
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
      setUploadError(`Unsupported file format in "${invalid.name}". BlockSign only accepts PDF files (.pdf).`);
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
        setRecentDispatch(data);
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
        if (recentDispatch?.documents.some(d => d.id === docId)) {
          setRecentDispatch(prev => prev ? { ...prev, documents: prev.documents.filter(d => d.id !== docId) } : null);
        }
      } else {
        alert('Failed to remove document.');
      }
    } catch {
      alert('Error connecting to backend server.');
    }
  };

  const [isSeeding, setIsSeeding] = useState(false);
  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch(`${API_BASE}/api/seed`, { method: 'POST' });
      if (res.ok) {
        fetchDocuments();
      }
    } catch {
      alert('Error seeding sample documents.');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '40px 20px 80px' }}>
      
      {/* Minimal Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#171d2e', border: '1px solid #1e2638', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#f8fafc', letterSpacing: '-0.3px' }}>
              BlockSign
            </h1>
            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
              Digital Signature & Execution Engine
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '16px', backgroundColor: '#101420', border: '1px solid #1e2638', fontSize: '12px', color: '#94a3b8' }}>
          <Server size={13} color="#10b981" />
          <span>Elysia Engine Online</span>
        </div>
      </header>

      {/* UNIFIED WORKFLOW CONTAINER */}
      <div style={{ backgroundColor: '#101420', borderRadius: '12px', border: '1px solid #1e2638', padding: '24px', marginBottom: '28px' }}>
        
        <div style={{ marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.2px' }}>
            <FileUp size={18} color="#3b82f6" /> Upload & Dispatch Documents
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
            Attach PDF contracts and specify the signer to generate secure execution links.
          </p>
        </div>

        <form onSubmit={handleUploadAndDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Dropzone */}
          <div>
            <div style={{ border: '1px dashed #2a354c', borderRadius: '8px', padding: '20px', textAlign: 'center', backgroundColor: '#0c101a', position: 'relative', transition: 'border-color 0.2s ease' }}>
              <input 
                type="file" 
                accept="application/pdf"
                multiple
                onChange={handleFilesSelected}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
              />
              <Layers size={24} color="#3b82f6" style={{ margin: '0 auto 6px' }} />
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0', margin: 0 }}>
                Choose PDF documents or drag and drop
              </p>
              <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Batch upload supported (PDF format only)
              </p>
            </div>

            {/* Selected Files Badge List */}
            {selectedFiles.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 600 }}>
                  {selectedFiles.length} document(s) selected:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '100px', overflowY: 'auto' }} className="custom-scrollbar">
                  {selectedFiles.map((f, index) => (
                    <div 
                      key={index} 
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        backgroundColor: '#171d2e',
                        border: '1px solid #1e2638',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#f8fafc'
                      }}
                    >
                      <FileText size={11} color="#3b82f6" />
                      <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span style={{ color: '#64748b', fontSize: '10px' }}>({(f.size / 1024).toFixed(0)}KB)</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedFile(index)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Signer Email Input */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }}>
              Target Signer Email Address
            </label>
            <input 
              type="email"
              value={signerEmail}
              onChange={e => setSignerEmail(e.target.value)}
              placeholder="recipient@enterprise.com"
              required
              style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', backgroundColor: '#171d2e', border: '1px solid #1e2638', color: '#f8fafc', fontSize: '13px' }}
            />
          </div>

          {uploadError && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
              <span>{uploadError}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="submit"
              disabled={isUploading || selectedFiles.length === 0 || !signerEmail.trim()}
              style={{
                padding: '9px 18px',
                borderRadius: '6px',
                backgroundColor: isUploading || selectedFiles.length === 0 || !signerEmail.trim() ? '#1e2638' : '#2563eb',
                color: '#fff',
                fontWeight: 600,
                fontSize: '13px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: isUploading || selectedFiles.length === 0 || !signerEmail.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              <Send size={13} />
              {isUploading ? 'Dispatching...' : `Dispatch ${selectedFiles.length > 1 ? `(${selectedFiles.length}) Documents` : 'for Signature'}`}
            </button>
          </div>
        </form>

        {/* Minimal Dispatched Notification Banner */}
        {recentDispatch && (
          <div style={{ marginTop: '20px', padding: '14px', borderRadius: '8px', backgroundColor: '#0c101a', border: '1px solid #2a354c' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '12px', fontWeight: 600 }}>
                <Mail size={14} /> Dispatched to {recentDispatch.emailPreview.to}
              </div>
              <span style={{ fontSize: '11px', color: '#64748b' }}>{recentDispatch.count} Document(s)</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {recentDispatch.documents.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', backgroundColor: '#171d2e', borderRadius: '4px', border: '1px solid #1e2638' }}>
                  <span style={{ color: '#f8fafc', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.fileName}</span>
                  <button
                    onClick={() => onNavigateToSign(item.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', backgroundColor: '#2563eb', color: '#fff', borderRadius: '4px', border: 'none', fontSize: '11px', fontWeight: 600 }}
                  >
                    <ExternalLink size={11} /> Open Signer View
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Execution Tracker & Documents List */}
      <div style={{ backgroundColor: '#101420', borderRadius: '12px', border: '1px solid #1e2638', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: 0, letterSpacing: '-0.2px' }}>
                Documents & Execution Status
              </h2>
              {documents.length > 0 && (
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#171d2e', border: '1px solid #1e2638', color: '#93c5fd', fontWeight: 600 }}>
                  {documents.length} items • Scrollable
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '3px 0 0' }}>
              Real-time audit log of dispatched and executed contracts.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={handleSeedData}
              disabled={isSeeding}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                backgroundColor: '#171d2e',
                border: '1px solid #1e2638',
                borderRadius: '6px',
                color: '#93c5fd',
                fontSize: '11px'
              }}
            >
              <Sparkles size={12} /> {isSeeding ? 'Seeding...' : '+ Add 20 Samples'}
            </button>
            <button
              onClick={fetchDocuments}
              disabled={loadingDocs}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                backgroundColor: '#171d2e',
                border: '1px solid #1e2638',
                borderRadius: '6px',
                color: '#cbd5e1',
                fontSize: '11px'
              }}
            >
              <RefreshCw size={12} className={loadingDocs ? 'animate-spin' : ''} /> {loadingDocs ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b', fontSize: '13px' }}>
            No documents dispatched yet. Upload a PDF file above to begin.
          </div>
        ) : (
          <div 
            className="custom-scrollbar"
            style={{ 
              overflowX: 'auto',
              overflowY: 'auto',
              maxHeight: '440px',
              border: '1px solid #1e2638',
              borderRadius: '6px',
              position: 'relative'
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#101420', zIndex: 10, borderBottom: '1px solid #1e2638' }}>
                <tr style={{ color: '#64748b' }}>
                  <th style={{ padding: '10px 12px', backgroundColor: '#101420', fontWeight: 600 }}>Document Name</th>
                  <th style={{ padding: '10px 12px', backgroundColor: '#101420', fontWeight: 600 }}>Target Signer</th>
                  <th style={{ padding: '10px 12px', backgroundColor: '#101420', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 12px', backgroundColor: '#101420', fontWeight: 600 }}>Created</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', backgroundColor: '#101420', fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(d => {
                  const isDone = d.status === 'completed';
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #151a2a', transition: 'background-color 0.15s ease' }}>
                      <td style={{ padding: '11px 12px', fontWeight: 500, color: '#f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileText size={14} color={isDone ? '#34d399' : '#60a5fa'} />
                          <span style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 12px', color: '#94a3b8' }}>{d.signer_email}</td>
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: isDone ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                          color: isDone ? '#34d399' : '#fbbf24',
                          border: isDone ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(245,158,11,0.25)'
                        }}>
                          {isDone ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                          {isDone ? 'Signed & Returned' : 'Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px', color: '#64748b' }}>
                        {d.created_at ? new Date(d.created_at).toLocaleDateString() : 'Recent'}
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          {isDone ? (
                            <a
                              href={`${API_BASE}/api/download/${d.id}`}
                              download={`signed-${d.title}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                backgroundColor: '#10b981',
                                color: '#fff',
                                borderRadius: '4px',
                                textDecoration: 'none',
                                fontSize: '11px',
                                fontWeight: 500
                              }}
                            >
                              <Download size={12} /> Download PDF
                            </a>
                          ) : (
                            <button
                              onClick={() => onNavigateToSign(d.id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '4px 10px',
                                backgroundColor: '#171d2e',
                                border: '1px solid #1e2638',
                                borderRadius: '4px',
                                color: '#93c5fd',
                                fontSize: '11px',
                                fontWeight: 500
                              }}
                            >
                              Sign <ChevronRight size={11} />
                            </button>
                          )}

                          {/* Close/Remove Document Button */}
                          <button
                            onClick={(e) => handleDeleteDocument(d.id, e)}
                            title="Remove document"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px 6px',
                              backgroundColor: '#171d2e',
                              border: '1px solid #1e2638',
                              borderRadius: '4px',
                              color: '#64748b',
                              cursor: 'pointer',
                              fontSize: '11px',
                              gap: '3px'
                            }}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
