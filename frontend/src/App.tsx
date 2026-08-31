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
  ChevronRight
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
   1. INTERACTIVE SIGNER PORTAL (Embedded PDF Viewer + Interactive Toolbar)
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
        ctx.strokeStyle = '#2563eb';
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
          particleCount: 90,
          spread: 80,
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
      <div style={{ minHeight: '100vh', backgroundColor: '#0b0f19', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={36} className="animate-spin" style={{ margin: '0 auto 16px', color: '#3b82f6' }} />
          <h2 style={{ fontSize: '18px', color: '#f8fafc' }}>Loading Document Workspace...</h2>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0b0f19', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ maxWidth: '480px', width: '100%', backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f293d', padding: '36px', textAlign: 'center' }}>
          <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '20px', color: '#f8fafc', marginBottom: '8px' }}>Unable to Open Document</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>{error || 'Document not found.'}</p>
          <button onClick={onReturnHome} style={{ padding: '10px 20px', backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px' }}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const pdfUrl = `${API_BASE}/api/document/${documentId}/file?t=${pdfTimestamp}`;

  return (
    <div style={{ height: '100vh', backgroundColor: '#0b0f19', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Top Bar */}
      <header style={{ height: '56px', backgroundColor: '#111827', borderBottom: '1px solid #1f293d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onReturnHome} style={{ background: 'none', border: 'none', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
            <ArrowLeft size={16} /> Dashboard
          </button>
          <div style={{ height: '16px', width: '1px', backgroundColor: '#334155' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="#3b82f6" />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>{doc.title}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#94a3b8' }}>
            <Lock size={13} color="#10b981" />
            <span>256-Bit Encrypted Session</span>
          </div>
          <span style={{
            fontSize: '12px',
            padding: '3px 10px',
            borderRadius: '12px',
            fontWeight: 600,
            backgroundColor: isCompleted ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
            color: isCompleted ? '#34d399' : '#60a5fa',
            border: isCompleted ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(59,130,246,0.3)'
          }}>
            {isCompleted ? '✓ Completed & Sealed' : 'Action Required'}
          </span>
        </div>
      </header>

      {/* Main Workspace (Split-screen PDF Viewer + Floating Signing Studio) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* LEFT: EMBEDDED REAL PDF VIEWER */}
        <div style={{ flex: '1 1 60%', height: '100%', backgroundColor: '#0e131f', position: 'relative', borderRight: '1px solid #1f293d' }}>
          <div style={{ position: 'absolute', top: '12px', left: '16px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', backgroundColor: 'rgba(17,24,39,0.9)', backdropFilter: 'blur(8px)', border: '1px solid #1f293d', fontSize: '12px', color: '#cbd5e1' }}>
            <Eye size={14} color="#3b82f6" /> Live PDF Preview
          </div>

          <iframe
            src={pdfUrl}
            title={doc.title}
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#1e293b' }}
          />
        </div>

        {/* RIGHT: INTERACTIVE SIGNING TOOLBAR / CONTROLS */}
        <div style={{ flex: '0 0 420px', width: '420px', height: '100%', backgroundColor: '#111827', display: 'flex', flexDirection: 'column', overflowY: 'auto' }} className="custom-scrollbar">
          
          {!isCompleted ? (
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  <PenTool size={15} /> Apply Digital Signature
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Review & Sign Document
                </h2>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                  Review the PDF on the left, then apply your signature below to execute.
                </p>
              </div>

              <form onSubmit={handleSubmitSignature} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                
                {/* Signer Legal Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }}>
                    Full Legal Name
                  </label>
                  <input
                    type="text"
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    placeholder="Enter your legal name"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Drawn Signature Pad */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#cbd5e1' }}>
                      Draw Signature
                    </label>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}
                    >
                      <Eraser size={12} /> Clear
                    </button>
                  </div>
                  
                  <div style={{ position: 'relative', border: '1px solid #334155', borderRadius: '8px', backgroundColor: '#1e293b', overflow: 'hidden' }}>
                    <canvas
                      ref={canvasRef}
                      width={360}
                      height={120}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      style={{ width: '100%', height: '120px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                    />
                    {!hasDrawn && (
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', color: '#64748b', fontSize: '12px' }}>
                        Draw your signature here
                      </div>
                    )}
                  </div>
                </div>

                {/* Stamping Preview Box */}
                <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px dashed #3b82f6' }}>
                  <div style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={13} /> Document Signature Overlay Preview:
                  </div>
                  <div style={{ padding: '10px 12px', backgroundColor: '#1e293b', borderRadius: '6px', borderLeft: '3px solid #3b82f6' }}>
                    <div style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600, marginBottom: '2px' }}>
                      {hasDrawn ? '✓ Drawn Signature Captured' : '[Drawn Signature Image]'}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>Signed by: {signerName || '(Your name)'}</div>
                    <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>Date: {new Date().toLocaleString()}</div>
                  </div>
                </div>

                {/* Error Banner */}
                {submitError && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0 }} />
                    <span>{submitError}</span>
                  </div>
                )}

                {/* Primary Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || !signerName.trim()}
                  style={{
                    padding: '14px 20px',
                    borderRadius: '8px',
                    backgroundColor: isSubmitting || !signerName.trim() ? '#334155' : '#2563eb',
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: 600,
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
                    cursor: isSubmitting || !signerName.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Send size={16} />
                  {isSubmitting ? 'Sealing Document...' : 'Sign & Return to Sender'}
                </button>
              </form>
            </div>
          ) : (
            /* Completed Screen */
            <div style={{ padding: '36px 28px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.15)', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: '16px' }}>
                <CheckCircle2 size={32} />
              </div>

              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
                Document Executed!
              </h2>
              <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '24px' }}>
                Your signature has been stamped onto <strong style={{ color: '#f8fafc' }}>{doc.title}</strong> and delivered back to the requester.
              </p>

              <div style={{ width: '100%', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '14px', textAlign: 'left', marginBottom: '24px', fontSize: '12px' }}>
                <div style={{ color: '#34d399', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={14} /> Execution Certificate
                </div>
                <div style={{ color: '#cbd5e1' }}>• Signer: {signerName || doc.signer_email}</div>
                <div style={{ color: '#cbd5e1' }}>• Sealed At: {new Date().toLocaleString()}</div>
                <div style={{ color: '#cbd5e1' }}>• Status: Sealed & Archived</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                <a
                  href={`${API_BASE}/api/download/${documentId}`}
                  download={`signed-${doc.title}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 18px',
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                >
                  <Download size={16} /> Download Signed PDF
                </a>
                <button
                  onClick={onReturnHome}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: '#1e293b',
                    color: '#94a3b8',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '13px'
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
   2. REQUESTER DASHBOARD (Multi-File Batch Upload & Document Tracker)
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
    <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '36px 20px 60px' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 14px rgba(37,99,235,0.4)' }}>
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              BlockSign
            </h1>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Batch E-Signature & Document Execution Platform
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: '13px' }}>
          <Server size={14} color="#10b981" />
          <span style={{ color: '#cbd5e1' }}>Elysia Engine Online</span>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
        </div>
      </header>

      {/* Main Upload Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: recentDispatch ? '1fr 1fr' : '1fr', gap: '24px', marginBottom: '36px' }}>
        
        {/* Upload & Dispatch Card */}
        <div style={{ backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f293d', padding: '28px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileUp size={20} color="#3b82f6" /> Batch Upload & Request Signatures
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>
              Select one or multiple PDF documents to generate individual signing links.
            </p>
          </div>

          <form onSubmit={handleUploadAndDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* MULTI-FILE INPUT DROPZONE */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }}>
                PDF Contracts (Multi-File Selection Supported)
              </label>
              <div style={{ border: '2px dashed #334155', borderRadius: '10px', padding: '22px', textAlign: 'center', backgroundColor: '#1e293b', position: 'relative' }}>
                <input 
                  type="file" 
                  accept="application/pdf"
                  multiple
                  onChange={handleFilesSelected}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                />
                <Layers size={28} color="#3b82f6" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0' }}>
                  Click to browse multiple PDFs or drag & drop
                </p>
                <p style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Supports multiple files simultaneously
                </p>
              </div>

              {/* Selected Files Badge List */}
              {selectedFiles.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12px', color: '#93c5fd', fontWeight: 600 }}>
                    {selectedFiles.length} file(s) queued for upload:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto' }} className="custom-scrollbar">
                    {selectedFiles.map((f, index) => (
                      <div 
                        key={index} 
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: '#f8fafc'
                        }}
                      >
                        <FileText size={12} color="#3b82f6" />
                        <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ color: '#64748b', fontSize: '10px' }}>({(f.size / 1024).toFixed(0)}KB)</span>
                        <button
                          type="button"
                          onClick={() => removeSelectedFile(index)}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }}>
                Signer Recipient Email
              </label>
              <input 
                type="email"
                value={signerEmail}
                onChange={e => setSignerEmail(e.target.value)}
                placeholder="signer@company.com"
                required
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f8fafc', fontSize: '14px', outline: 'none' }}
              />
            </div>

            {uploadError && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
                <span>{uploadError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isUploading || selectedFiles.length === 0 || !signerEmail.trim()}
              style={{
                marginTop: '6px',
                padding: '12px 20px',
                borderRadius: '8px',
                backgroundColor: isUploading || selectedFiles.length === 0 || !signerEmail.trim() ? '#334155' : '#2563eb',
                color: '#fff',
                fontWeight: 600,
                fontSize: '14px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: selectedFiles.length > 0 ? '0 4px 14px rgba(37,99,235,0.35)' : 'none',
                cursor: isUploading || selectedFiles.length === 0 || !signerEmail.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              <Send size={16} />
              {isUploading ? 'Dispatching Batch...' : `Dispatch ${selectedFiles.length > 1 ? `${selectedFiles.length} Documents` : 'for Signature'}`}
            </button>
          </form>
        </div>

        {/* Multi-Document Dispatched Card Preview */}
        {recentDispatch && (
          <div style={{ backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #3b82f6', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontSize: '13px', fontWeight: 600 }}>
                <Mail size={18} /> Outgoing Email Dispatched ({recentDispatch.count} Document{recentDispatch.count > 1 ? 's' : ''})
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Mock Inbox Preview</span>
            </div>

            <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '16px', border: '1px solid #334155', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                <span style={{ color: '#94a3b8' }}>To: </span>
                <strong style={{ color: '#f8fafc' }}>{recentDispatch.emailPreview.to}</strong>
              </div>
              <div style={{ borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                <span style={{ color: '#94a3b8' }}>Subject: </span>
                <span style={{ color: '#93c5fd', fontWeight: 500 }}>{recentDispatch.emailPreview.subject}</span>
              </div>
              
              <div style={{ fontSize: '12px', color: '#cbd5e1', margin: '4px 0' }}>
                Individual Document Signing Links:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }} className="custom-scrollbar">
                {recentDispatch.documents.map((item, idx) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                      <span style={{ color: '#3b82f6', fontWeight: 700, fontSize: '11px' }}>#{idx + 1}</span>
                      <span style={{ color: '#f8fafc', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{item.fileName}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => onNavigateToSign(item.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', backgroundColor: '#2563eb', color: '#fff', borderRadius: '4px', border: 'none', fontSize: '11px', fontWeight: 600 }}
                      >
                        <ExternalLink size={12} /> Sign Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Live Documents Tracker Table */}
      <div style={{ backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f293d', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                Documents & Execution Status
              </h2>
              {documents.length > 0 && (
                <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#93c5fd', fontWeight: 600 }}>
                  {documents.length} documents {documents.length > 10 ? '• Scrollable' : ''}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>
              Track signatures and download returned documents in real time.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSeedData}
              disabled={isSeeding}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#93c5fd',
                fontSize: '12px'
              }}
            >
              <Sparkles size={13} /> {isSeeding ? 'Seeding...' : '+ Add 20 Samples'}
            </button>
            <button
              onClick={fetchDocuments}
              disabled={loadingDocs}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#cbd5e1',
                fontSize: '12px'
              }}
            >
              <RefreshCw size={13} className={loadingDocs ? 'animate-spin' : ''} /> {loadingDocs ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748b', fontSize: '14px' }}>
            No documents dispatched yet. Upload PDF files above to begin.
          </div>
        ) : (
          <div 
            className="custom-scrollbar"
            style={{ 
              overflowX: 'auto',
              overflowY: documents.length > 10 ? 'auto' : 'visible',
              maxHeight: documents.length > 10 ? '540px' : 'none',
              paddingRight: documents.length > 10 ? '4px' : '0',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#111827', zIndex: 10 }}>
                <tr style={{ borderBottom: '1px solid #1f293d', color: '#94a3b8' }}>
                  <th style={{ padding: '12px 14px', backgroundColor: '#111827' }}>Document Name</th>
                  <th style={{ padding: '12px 14px', backgroundColor: '#111827' }}>Target Signer</th>
                  <th style={{ padding: '12px 14px', backgroundColor: '#111827' }}>Status</th>
                  <th style={{ padding: '12px 14px', backgroundColor: '#111827' }}>Created</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right', backgroundColor: '#111827' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(d => {
                  const isDone = d.status === 'completed';
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #1f293d' }}>
                      <td style={{ padding: '14px', fontWeight: 600, color: '#f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={16} color={isDone ? '#34d399' : '#60a5fa'} />
                          {d.title}
                        </div>
                      </td>
                      <td style={{ padding: '14px', color: '#cbd5e1' }}>{d.signer_email}</td>
                      <td style={{ padding: '14px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: isDone ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                          color: isDone ? '#34d399' : '#fbbf24',
                          border: isDone ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)'
                        }}>
                          {isDone ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                          {isDone ? 'Signed & Returned' : 'Pending Signature'}
                        </span>
                      </td>
                      <td style={{ padding: '14px', color: '#94a3b8' }}>
                        {d.created_at ? new Date(d.created_at).toLocaleDateString() : 'Recent'}
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          {isDone ? (
                            <a
                              href={`${API_BASE}/api/download/${d.id}`}
                              download={`signed-${d.title}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                backgroundColor: '#10b981',
                                color: '#fff',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontSize: '12px',
                                fontWeight: 600
                              }}
                            >
                              <Download size={13} /> Download Signed PDF
                            </a>
                          ) : (
                            <button
                              onClick={() => onNavigateToSign(d.id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 12px',
                                backgroundColor: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '6px',
                                color: '#93c5fd',
                                fontSize: '12px'
                              }}
                            >
                              Sign <ChevronRight size={12} />
                            </button>
                          )}

                          {/* Close/Remove Document Button */}
                          <button
                            onClick={(e) => handleDeleteDocument(d.id, e)}
                            title="Close and remove document"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '6px 8px',
                              backgroundColor: '#1e293b',
                              border: '1px solid #334155',
                              borderRadius: '6px',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              fontSize: '12px',
                              gap: '4px',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
                              e.currentTarget.style.color = '#ef4444';
                              e.currentTarget.style.borderColor = '#ef4444';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#1e293b';
                              e.currentTarget.style.color = '#94a3b8';
                              e.currentTarget.style.borderColor = '#334155';
                            }}
                          >
                            <X size={13} /> Close
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
