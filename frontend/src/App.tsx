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
  ArrowRight,
  X
} from 'lucide-react';

const API_BASE = 'http://localhost:3000';

interface EmailPreview {
  to: string;
  from: string;
  subject: string;
  body: string;
  link: string;
  dispatchedAt: string;
}

interface UploadResponse {
  success: boolean;
  documentId: string;
  fileName: string;
  signUrl: string;
  emailPreview: EmailPreview;
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
  // Simple router based on window.location
  const [, setCurrentPath] = useState(window.location.pathname);
  const [signingDocId, setSigningDocId] = useState<string | null>(null);

  // Sync route
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

  // If on /sign/:id, render ONLY the dedicated Signer Portal
  if (signingDocId) {
    return <SignerPortal documentId={signingDocId} onReturnHome={() => navigate('/')} />;
  }

  // Otherwise, render the Requester Management Dashboard
  return <RequesterDashboard onNavigateToSign={(id) => navigate(`/sign/${id}`)} />;
}

/* =========================================================================
   1. SIGNER PORTAL (Recipient-only focused signing view)
   ========================================================================= */
function SignerPortal({ documentId, onReturnHome }: { documentId: string; onReturnHome: () => void }) {
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [signerName, setSignerName] = useState('');
  const [signMode, setSignMode] = useState<'type' | 'draw'>('type');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Fetch document details on load
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
          // Pre-fill name suggestion from email
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

  // Setup Canvas
  useEffect(() => {
    if (signMode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [signMode]);

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

  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmitSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) {
      setSubmitError('Please enter your full legal name.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`${API_BASE}/api/sign/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: signerName.trim() }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => '');
        data = { error: text || `Server error (${res.status})` };
      }

      if (res.ok && data?.success) {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 }
        });
        setIsCompleted(true);
      } else {
        setSubmitError(data?.error || `Failed to sign document: server returned status ${res.status}`);
      }
    } catch (err: any) {
      setSubmitError(`Network error connecting to backend (${err?.message || 'Connection refused'}). Please verify the server is running.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0b0f19', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      
      {/* Top Brand Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', color: '#94a3b8', fontSize: '13px' }}>
        <Lock size={15} color="#3b82f6" />
        <span>BlockSign Secure Signer Portal • 256-Bit Encrypted Session</span>
      </div>

      <div style={{ width: '100%', maxWidth: '640px', backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f293d', padding: '36px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
        
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
            <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p>Loading document session...</p>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '20px', color: '#f8fafc', marginBottom: '8px' }}>Unable to Access Document</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px' }}>{error}</p>
            <button onClick={onReturnHome} style={{ padding: '10px 20px', backgroundColor: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: '8px' }}>
              Return to Dashboard
            </button>
          </div>
        )}

        {!loading && !error && doc && !isCompleted && (
          <div>
            {/* Header */}
            <div style={{ borderBottom: '1px solid #1f293d', paddingBottom: '20px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#3b82f6', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                <PenTool size={16} /> Signature Required
              </div>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', margin: '0 0 6px' }}>
                {doc.title}
              </h1>
              <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
                Sent to: <strong style={{ color: '#cbd5e1' }}>{doc.signer_email}</strong>
              </p>
            </div>

            {/* Signing Form */}
            <form onSubmit={handleSubmitSignature} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#cbd5e1', marginBottom: '8px' }}>
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
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '15px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Signature Input Mode */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#cbd5e1', marginBottom: '8px' }}>
                  Choose Signature Method
                </label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                  <button
                    type="button"
                    onClick={() => setSignMode('type')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: signMode === 'type' ? '#2563eb' : '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid ' + (signMode === 'type' ? '#3b82f6' : '#334155'),
                      fontSize: '14px',
                      fontWeight: 500
                    }}
                  >
                    Type Signature
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignMode('draw')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: signMode === 'draw' ? '#2563eb' : '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid ' + (signMode === 'draw' ? '#3b82f6' : '#334155'),
                      fontSize: '14px',
                      fontWeight: 500
                    }}
                  >
                    Draw Signature
                  </button>
                </div>

                {signMode === 'type' ? (
                  <div style={{ padding: '20px', borderRadius: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', textAlign: 'center' }}>
                    <div className="signature-font-caveat" style={{ fontSize: '32px', color: '#60a5fa', minHeight: '44px' }}>
                      {signerName || 'Signature Preview'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Generated Cursive Handwriting Stamp</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ position: 'relative', border: '1px solid #334155', borderRadius: '8px', backgroundColor: '#1e293b', overflow: 'hidden' }}>
                      <canvas 
                        ref={canvasRef}
                        width={560}
                        height={140}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        style={{ width: '100%', height: '140px', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                      />
                      {!hasDrawn && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', color: '#64748b', fontSize: '13px' }}>
                          Draw your signature here
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button 
                        type="button" 
                        onClick={clearCanvas}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', backgroundColor: '#334155', border: 'none', borderRadius: '4px', color: '#cbd5e1', fontSize: '12px' }}
                      >
                        <Eraser size={12} /> Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* PDF Stamping Stamp Preview */}
              <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px dashed #3b82f6' }}>
                <div style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={13} /> Official Signature Verification Badge (Page 1):
                </div>
                <div style={{ padding: '10px 14px', backgroundColor: '#1e293b', borderRadius: '6px', borderLeft: '3px solid #3b82f6' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6' }}>[VERIFIED] Digitally Signed with BlockSign</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginTop: '2px' }}>Signed by: {signerName || '(Your name)'}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Date: {new Date().toLocaleString()} • Ref: {documentId.slice(0, 8)}</div>
                </div>
              </div>

              {/* Error Banner */}
              {submitError && (
                <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Single Submit & Return Button */}
              <button
                type="submit"
                disabled={isSubmitting || !signerName.trim()}
                style={{
                  marginTop: '4px',
                  padding: '16px 28px',
                  borderRadius: '8px',
                  backgroundColor: isSubmitting || !signerName.trim() ? '#334155' : '#2563eb',
                  color: '#ffffff',
                  fontSize: '16px',
                  fontWeight: 600,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 16px rgba(37,99,235,0.4)',
                  cursor: isSubmitting || !signerName.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                <Send size={18} />
                {isSubmitting ? 'Sealing & Returning Document...' : 'Submit & Return to Sender'}
              </button>
            </form>
          </div>
        )}

        {/* Confirmation Screen */}
        {!loading && isCompleted && doc && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.15)', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', margin: '0 auto 16px' }}>
              <CheckCircle2 size={36} />
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
              Document Signed & Returned!
            </h2>
            <p style={{ fontSize: '15px', color: '#94a3b8', maxWidth: '480px', margin: '0 auto 24px', lineHeight: 1.5 }}>
              Your electronic signature has been stamped onto <strong style={{ color: '#f8fafc' }}>{doc.title}</strong> and the completed package has been delivered directly back to the requester.
            </p>

            <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '16px', textAlign: 'left', marginBottom: '24px', fontSize: '13px' }}>
              <div style={{ color: '#34d399', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={16} /> Audit Trail Certificate
              </div>
              <div style={{ color: '#cbd5e1' }}>• Document: {doc.title}</div>
              <div style={{ color: '#cbd5e1' }}>• Signer: {signerName || doc.signer_email}</div>
              <div style={{ color: '#cbd5e1' }}>• Timestamp: {new Date().toLocaleString()}</div>
              <div style={{ color: '#cbd5e1' }}>• Status: Verified & Completed</div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <a
                href={`${API_BASE}/api/download/${documentId}`}
                download={`signed-${doc.title}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                <Download size={16} /> Download Signed Copy
              </a>
              <button
                onClick={onReturnHome}
                style={{
                  padding: '12px 20px',
                  backgroundColor: '#1e293b',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              >
                Go to Requester Dashboard
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* =========================================================================
   2. REQUESTER DASHBOARD (Upload, Dispatch Preview, and Live Tracker)
   ========================================================================= */
function RequesterDashboard({ onNavigateToSign }: { onNavigateToSign: (docId: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [signerEmail, setSignerEmail] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [recentDispatch, setRecentDispatch] = useState<UploadResponse | null>(null);
  
  // Documents Activity List
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

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

  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleUploadAndDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!file) {
      setUploadError('Please select a PDF file.');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError(`Unsupported file format ("${file.name}"). BlockSign requires standard PDF documents (.pdf). Please save your document as a PDF and try again.`);
      return;
    }

    if (!signerEmail.trim()) {
      setUploadError('Please enter the signer email address.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
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
        setFile(null);
        setSignerEmail('');
        fetchDocuments();
      } else {
        setUploadError(data.error || 'Failed to upload document.');
      }
    } catch (err) {
      setUploadError('Error connecting to backend server.');
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  const handleDeleteDocument = async (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/api/document/${docId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== docId));
        if (recentDispatch?.documentId === docId) {
          setRecentDispatch(null);
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
    <div style={{ maxWidth: '1020px', margin: '0 auto', padding: '36px 20px 60px' }}>
      
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
              Requester Dispatch & E-Signature Hub
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '20px', backgroundColor: '#1e293b', border: '1px solid #334155', fontSize: '13px' }}>
          <Server size={14} color="#10b981" />
          <span style={{ color: '#cbd5e1' }}>Elysia Engine Online</span>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: recentDispatch ? '1fr 1fr' : '1fr', gap: '24px', marginBottom: '36px' }}>
        
        {/* Upload & Dispatch Card */}
        <div style={{ backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #1f293d', padding: '28px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileUp size={20} color="#3b82f6" /> Upload & Request Signature
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>
              Select a PDF and specify the recipient to dispatch an email signing invitation.
            </p>
          </div>

          <form onSubmit={handleUploadAndDispatch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }}>
                PDF Contract / Document
              </label>
              <div style={{ border: '2px dashed #334155', borderRadius: '10px', padding: '20px', textAlign: 'center', backgroundColor: '#1e293b', position: 'relative' }}>
                <input 
                  type="file" 
                  accept="application/pdf" 
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                />
                <FileText size={28} color="#3b82f6" style={{ margin: '0 auto 8px' }} />
                {file ? (
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>{file.name}</p>
                ) : (
                  <p style={{ fontSize: '13px', color: '#94a3b8' }}>Click to select PDF or drag & drop</p>
                )}
              </div>
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
              disabled={isUploading || !file || !signerEmail.trim()}
              style={{
                marginTop: '6px',
                padding: '12px 20px',
                borderRadius: '8px',
                backgroundColor: isUploading || !file || !signerEmail.trim() ? '#334155' : '#2563eb',
                color: '#fff',
                fontWeight: 600,
                fontSize: '14px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: file ? '0 4px 14px rgba(37,99,235,0.35)' : 'none',
                cursor: isUploading || !file || !signerEmail.trim() ? 'not-allowed' : 'pointer'
              }}
            >
              <Send size={16} />
              {isUploading ? 'Dispatching...' : 'Dispatch for Signature'}
            </button>
          </form>
        </div>

        {/* Simulated Email Dispatch Card (shows when a document is newly sent) */}
        {recentDispatch && (
          <div style={{ backgroundColor: '#111827', borderRadius: '16px', border: '1px solid #3b82f6', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontSize: '13px', fontWeight: 600 }}>
                <Mail size={18} /> Outgoing Email Dispatched
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Mock Inbox Preview</span>
            </div>

            <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '16px', border: '1px solid #334155', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                <span style={{ color: '#94a3b8' }}>To: </span>
                <strong style={{ color: '#f8fafc' }}>{recentDispatch.emailPreview.to}</strong>
              </div>
              <div style={{ borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                <span style={{ color: '#94a3b8' }}>Subject: </span>
                <span style={{ color: '#93c5fd', fontWeight: 500 }}>{recentDispatch.emailPreview.subject}</span>
              </div>
              <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.4, margin: '8px 0' }}>
                {recentDispatch.emailPreview.body}
              </p>

              <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => onNavigateToSign(recentDispatch.documentId)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px 14px',
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  <ExternalLink size={14} /> Open Signer View
                </button>
                <button
                  onClick={() => copyToClipboard(recentDispatch.signUrl, recentDispatch.documentId)}
                  style={{
                    padding: '10px 14px',
                    backgroundColor: '#334155',
                    color: '#f8fafc',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '13px'
                  }}
                >
                  {copiedLink === recentDispatch.documentId ? 'Copied!' : 'Copy Link'}
                </button>
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
            No documents dispatched yet. Upload a PDF above to begin.
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
                            <>
                              <button
                                onClick={() => onNavigateToSign(d.id)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '6px 10px',
                                  backgroundColor: '#1e293b',
                                  border: '1px solid #334155',
                                  borderRadius: '6px',
                                  color: '#93c5fd',
                                  fontSize: '12px'
                                }}
                              >
                                Sign Now <ArrowRight size={12} />
                              </button>
                              <button
                                onClick={() => copyToClipboard(`http://localhost:5173/sign/${d.id}`, d.id)}
                                style={{
                                  padding: '6px 10px',
                                  backgroundColor: '#1e293b',
                                  border: '1px solid #334155',
                                  borderRadius: '6px',
                                  color: '#94a3b8',
                                  fontSize: '12px'
                                }}
                              >
                                {copiedLink === d.id ? 'Copied' : 'Copy Link'}
                              </button>
                            </>
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
