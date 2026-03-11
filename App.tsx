
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser, useAuth, useClerk, SignIn, SignUp } from '@clerk/clerk-react';
import { Layout } from './components/Layout.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { FileUploader } from './components/FileUploader.tsx';
import { AnalysisView } from './components/AnalysisView.tsx';
import { analyzeMedicalDocument } from './services/geminiService.ts';
import { AnalysisState, User, MedicalAnalysis } from './types.ts';
import { Loader2, AlertCircle, Sparkles, History, MapPin } from 'lucide-react';
import { createClerkSupabaseClient } from './lib/supabase.ts';

const App: React.FC = () => {
  const { user: clerkUser, isLoaded: isUserLoaded, isSignedIn } = useUser();
  const { getToken, isLoaded: isAuthLoaded, userId } = useAuth();
  const { signOut } = useClerk();

  // Combined loading state: 
  // 1. Wait for Auth to load (determines if we have a session)
  // 2. If signed in, wait for User data to load
  const isClerkLoaded = isAuthLoaded && (!userId || isUserLoaded);

  const [loadingTimeout, setLoadingTimeout] = useState(false);

  useEffect(() => {
    console.log('Clerk State:', { isAuthLoaded, isUserLoaded, userId, isSignedIn });
    
    if (isClerkLoaded) {
      // Reset timeout state when loaded, but do it asynchronously to avoid cascading render warning
      const resetTimer = setTimeout(() => setLoadingTimeout(false), 0);
      return () => clearTimeout(resetTimer);
    }

    const timer = setTimeout(() => {
      setLoadingTimeout(true);
    }, 8000);
    
    return () => clearTimeout(timer);
  }, [isClerkLoaded, isAuthLoaded, isUserLoaded, userId, isSignedIn]);

  const user: User | null = useMemo(() => clerkUser ? {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress || '',
    name: clerkUser.fullName || clerkUser.firstName || 'User',
    cityTier: (clerkUser.publicMetadata?.cityTier as 'Tier-1' | 'Tier-2' | 'Tier-3') || 'Tier-1'
  } : null, [clerkUser]);
  
  const [selectedCityTier, setSelectedCityTier] = useState<'Tier-1' | 'Tier-2' | 'Tier-3' | null>(null);
  const cityTier = selectedCityTier || user?.cityTier || 'Tier-1';

  const [authView, setAuthView] = useState<'landing' | 'login' | 'signup'>('landing');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#login') setAuthView('login');
      else if (hash === '#signup') setAuthView('signup');
      else if (hash === '#landing' || !hash || hash === '#') setAuthView('landing');
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Initial check
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [state, setState] = useState<AnalysisState>({
    file: null, 
    preview: null, 
    isAnalyzing: false, 
    result: null, 
    error: null
  });
  const [history, setHistory] = useState<MedicalAnalysis[]>([]);

  const getSafeToken = useCallback(async () => {
    try {
      return await getToken({ template: 'supabase' });
    } catch {
      console.warn('Clerk Supabase template not found, falling back to default token. Please create a "supabase" JWT template in your Clerk dashboard.');
      return await getToken();
    }
  }, [getToken]);

  const fetchHistory = useCallback(async (userId: string) => {
    const token = await getSafeToken();
    const supabase = createClerkSupabaseClient(token);
    
    const { data, error } = await supabase
      .from('scans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (data && !error) {
      setHistory(data.map(item => ({
        ...item.analysis_data,
        id: item.id,
        timestamp: new Date(item.created_at).getTime()
      })));
    }
  }, [getSafeToken]);

  useEffect(() => {
    const loadHistory = async () => {
      if (user) {
        await fetchHistory(user.id);
      } else {
        setHistory([]);
      }
    };
    loadHistory();
  }, [user, fetchHistory]);

  const handleLogout = async () => {
    await signOut();
    setAuthView('landing');
  };

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setState(prev => ({ 
        ...prev, 
        file, 
        preview: reader.result as string, 
        error: null, 
        result: null 
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!state.preview || !state.file) return;
    setState(prev => ({ ...prev, isAnalyzing: true, error: null }));
    try {
      const base64Data = state.preview.split(',')[1];
      const result = await analyzeMedicalDocument(base64Data, state.file.type, cityTier);
      const enriched = { 
        ...result, 
        id: Date.now().toString(), 
        timestamp: Date.now() 
      };
      setState(prev => ({ ...prev, isAnalyzing: false, result: enriched }));
      
      if (user) {
        // Save to Supabase
        const token = await getSafeToken();
        const supabase = createClerkSupabaseClient(token);
        
        const { error } = await supabase.from('scans').insert({
          user_id: user.id,
          analysis_data: enriched,
          document_type: result.documentType
        });
        
        if (!error) {
          fetchHistory(user.id);
        }
      }
    } catch (err) {
      console.error(err);
      setState(prev => ({ 
        ...prev, 
        isAnalyzing: false, 
        error: "IQ Analysis failed. Please ensure the document is clearly visible and try again." 
      }));
    }
  };

  if (!isClerkLoaded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0f2a43] text-white p-6">
        <div className="relative">
          <Loader2 className="w-12 h-12 animate-spin text-[#00a3e0]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-[#8ba888] rounded-full animate-ping" />
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <h2 className="text-xl font-bold mb-2">
            {!isAuthLoaded ? 'Initializing Secure Session' : 'Loading Your Profile'}
          </h2>
          <p className="text-slate-400 text-sm animate-pulse">
            Please wait while we connect to our secure authentication servers...
          </p>
        </div>
        
        {loadingTimeout && (
          <div className="mt-12 p-8 bg-white/5 rounded-[2rem] border border-white/10 max-w-md text-center animate-in fade-in zoom-in duration-500">
            <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-4" />
            <p className="text-slate-300 mb-6 leading-relaxed">
              This is taking longer than usual. This can happen due to a slow connection or a temporary sync delay with our identity provider.
            </p>
            
            <div className="flex flex-col space-y-3">
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-[#00a3e0] hover:bg-[#0092c9] text-white py-3 rounded-xl font-bold transition-all"
              >
                Reload Page
              </button>
              <button 
                onClick={() => signOut()}
                className="w-full bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold border border-white/10 transition-all"
              >
                Sign Out & Reset
              </button>
            </div>
            
            <div className="mt-6 pt-6 border-t border-white/5">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Debug Info</p>
              <div className="flex justify-center space-x-4 text-[10px] font-mono text-slate-500">
                <span>Auth: {isAuthLoaded ? 'READY' : 'WAIT'}</span>
                <span>User: {isUserLoaded ? 'READY' : 'WAIT'}</span>
                <span>ID: {userId ? 'YES' : 'NO'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!user && authView !== 'landing') {
    return (
      <Layout user={null} onLogout={() => {}}>
        <div className="py-12 flex justify-center">
          {authView === 'login' ? (
            <SignIn 
              routing="hash" 
              signUpUrl="#signup" 
              appearance={{
                elements: {
                  rootBox: "mx-auto",
                  card: "rounded-3xl border-slate-100 shadow-xl"
                }
              }}
            />
          ) : (
            <SignUp 
              routing="hash" 
              signInUrl="#login"
              appearance={{
                elements: {
                  rootBox: "mx-auto",
                  card: "rounded-3xl border-slate-100 shadow-xl"
                }
              }}
            />
          )}
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout user={null} onLogout={() => {}} showLanding>
        <LandingPage />
      </Layout>
    );
  }

  return (
    <Layout user={user} onLogout={handleLogout} onLogoClick={() => setState(p => ({ ...p, result: null, file: null, preview: null }))}>
      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-4 space-y-6 no-print">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-bold flex items-center mb-4 text-[#0f2a43]"><MapPin className="w-5 h-5 mr-2 text-[#00a3e0]" /> Healthcare Location</h3>
            <select 
              value={cityTier} 
              onChange={(e) => setSelectedCityTier(e.target.value as 'Tier-1' | 'Tier-2' | 'Tier-3')} 
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#00a3e0] transition-all text-[#0f2a43]"
            >
              <option value="Tier-1">Metro / Tier 1 (Mumbai, Delhi, BLR)</option>
              <option value="Tier-2">Tier 2 (Pune, Jaipur, Lucknow)</option>
              <option value="Tier-3">Tier 3 / Smaller Towns</option>
            </select>
            <p className="mt-3 text-[10px] text-slate-400 font-medium leading-relaxed">
              We use this to benchmark hospital charges and insurance expectations for your region.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <h3 className="font-bold flex items-center mb-4 text-[#0f2a43]"><History className="w-5 h-5 mr-2 text-[#00a3e0]" /> Recent Scans</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
              {history.map(h => (
                <button 
                  key={h.id} 
                  onClick={() => setState(p => ({ ...p, result: h }))} 
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${state.result?.id === h.id ? 'bg-[#e0f2fe] border-[#00a3e0]/30' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}
                >
                  <p className="text-[10px] font-bold text-[#00a3e0] uppercase tracking-tighter">{h.documentType.replace('_', ' ')}</p>
                  <p className="text-sm font-semibold truncate text-[#0f2a43]">{h.summary}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{new Date(h.timestamp || 0).toLocaleDateString()}</p>
                </button>
              ))}
              {history.length === 0 && <p className="text-xs text-slate-500 text-center py-8">Your recent analysis history will appear here.</p>}
            </div>
          </div>
        </aside>

        <main className="lg:col-span-8">
          {state.isAnalyzing ? (
            <div className="bg-white p-20 rounded-[3rem] text-center border border-slate-100 flex flex-col items-center shadow-sm">
              <Loader2 className="w-16 h-16 animate-spin text-[#00a3e0] mb-8" />
              <h2 className="text-2xl font-bold text-[#0f2a43]">Running Medical IQ Scan...</h2>
              <p className="text-slate-500 mt-4 max-w-sm">Our AI is decoding handwriting, checking costs, and simplifying jargon for you.</p>
            </div>
          ) : state.result ? (
            <div className="space-y-4">
               <button 
                onClick={() => setState(p => ({ ...p, result: null, file: null, preview: null }))}
                className="no-print text-sm font-bold text-[#00a3e0] flex items-center space-x-1 hover:text-[#0092c9]"
              >
                <span>&larr; Analyze Another Document</span>
              </button>
              <AnalysisView analysis={state.result} />
            </div>
          ) : (
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm text-center">
              <div className="w-20 h-20 bg-[#e0f2fe] rounded-3xl flex items-center justify-center mx-auto mb-8">
                <Sparkles className="w-10 h-10 text-[#00a3e0]" />
              </div>
              <h2 className="text-3xl font-bold text-[#0f2a43] mb-4">Medical Document Explainer</h2>
              <p className="text-slate-500 mb-10 max-w-md mx-auto">Upload a prescription, bill, or lab report to get a simplified explanation in plain English.</p>
              
              <FileUploader 
                onFileSelect={handleFileSelect} 
                selectedFile={state.file} 
                onClear={() => setState(p => ({ ...p, file: null, preview: null }))} 
              />
              
              {state.file && (
                <button 
                  onClick={handleAnalyze} 
                  className="w-full mt-8 bg-[#0f2a43] text-white py-5 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all flex items-center justify-center space-x-3 shadow-xl shadow-slate-200 active:scale-[0.98]"
                >
                  <Sparkles className="w-5 h-5" />
                  <span>Analyze IQ</span>
                </button>
              )}
              
              {state.error && (
                <div className="mt-6 flex items-center justify-center space-x-2 text-red-400 bg-red-900/20 p-4 rounded-2xl border border-red-900/30 animate-in fade-in zoom-in duration-300">
                  <AlertCircle className="w-5 h-5" />
                  <p className="text-sm font-bold">{state.error}</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </Layout>
  );
};

export default App;
