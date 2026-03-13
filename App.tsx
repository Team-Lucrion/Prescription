import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useUser, useAuth, useClerk, SignIn, SignUp } from "@clerk/clerk-react";
import { Layout } from "./components/Layout";
import { LandingPage } from "./components/LandingPage";
import { FileUploader } from "./components/FileUploader";
import { AnalysisView } from "./components/AnalysisView";
import { analyzeMedicalDocument } from "./services/geminiService";
import { AnalysisState, User, MedicalAnalysis } from "./types";
import { Loader2, AlertCircle, Sparkles, History, MapPin } from "lucide-react";
import { createClerkSupabaseClient } from "./lib/supabase";

const App: React.FC = () => {
  const { user: clerkUser, isLoaded: isUserLoaded } = useUser();
  const { getToken, isLoaded: isAuthLoaded, userId } = useAuth();
  const { signOut } = useClerk();

  const isClerkLoaded = isAuthLoaded && (!userId || isUserLoaded);

  const [loadingTimeout, setLoadingTimeout] = useState(false);

  useEffect(() => {
    if (isClerkLoaded) {
      const reset = setTimeout(() => setLoadingTimeout(false), 0);
      return () => clearTimeout(reset);
    }

    const timer = setTimeout(() => {
      setLoadingTimeout(true);
    }, 8000);

    return () => clearTimeout(timer);
  }, [isClerkLoaded]);

  const user: User | null = useMemo(() => {
    if (!clerkUser) return null;

    return {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress || "",
      name: clerkUser.fullName || clerkUser.firstName || "User",
      cityTier:
        (clerkUser.publicMetadata?.cityTier as
          | "Tier-1"
          | "Tier-2"
          | "Tier-3") || "Tier-1",
    };
  }, [clerkUser]);

  const [selectedCityTier, setSelectedCityTier] = useState<
    "Tier-1" | "Tier-2" | "Tier-3" | null
  >(null);

  const cityTier = selectedCityTier || user?.cityTier || "Tier-1";

  const [authView, setAuthView] = useState<"landing" | "login" | "signup">(
    "landing"
  );

  const [state, setState] = useState<AnalysisState>({
    file: null,
    preview: null,
    isAnalyzing: false,
    result: null,
    error: null,
  });

  const [history, setHistory] = useState<MedicalAnalysis[]>([]);

  const getSafeToken = useCallback(async () => {
    try {
      return await getToken({ template: "supabase" });
    } catch {
      return await getToken();
    }
  }, [getToken]);

  const fetchHistory = useCallback(
    async (uid: string) => {
      try {
        const token = await getSafeToken();
        const supabase = createClerkSupabaseClient(token);

        const { data, error } = await supabase
          .from("scans")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("History fetch error:", error);
          return;
        }

        if (data) {
          setHistory(
            data.map((item: any) => ({
              ...item.analysis_data,
              id: item.id,
              timestamp: new Date(item.created_at).getTime(),
            }))
          );
        }
      } catch (err) {
        console.error("History load failed:", err);
      }
    },
    [getSafeToken]
  );

  useEffect(() => {
    if (user) {
      fetchHistory(user.id);
    } else {
      setHistory([]);
    }
  }, [user, fetchHistory]);

  const handleLogout = async () => {
    await signOut();
    setAuthView("landing");
  };

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();

    reader.onload = () => {
      setState((prev) => ({
        ...prev,
        file,
        preview: reader.result as string,
        error: null,
        result: null,
      }));
    };

    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!state.preview || !state.file) return;

    setState((prev) => ({ ...prev, isAnalyzing: true, error: null }));

    try {
      const base64Data = state.preview.split(",")[1];

      const result = await analyzeMedicalDocument(
        base64Data,
        state.file.type,
        cityTier
      );

      const enriched: MedicalAnalysis = {
        ...result,
        id: Date.now().toString(),
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        isAnalyzing: false,
        result: enriched,
      }));

      if (user) {
        try {
          const token = await getSafeToken();
          const supabase = createClerkSupabaseClient(token);

          await supabase.from("scans").insert({
            user_id: user.id,
            analysis_data: enriched,
            document_type: result.documentType,
          });

          fetchHistory(user.id);
        } catch (err) {
          console.error("Save failed:", err);
        }
      }
    } catch (err: any) {
      console.error("Analysis error:", err);

      setState((prev) => ({
        ...prev,
        isAnalyzing: false,
        error:
          err?.message ||
          "Analysis failed. Please upload a clearer medical document.",
      }));
    }
  };

  if (!isClerkLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f2a43] text-white">
        <Loader2 className="w-12 h-12 animate-spin text-[#00a3e0]" />

        {loadingTimeout && (
          <button
            onClick={() => window.location.reload()}
            className="ml-6 bg-[#00a3e0] px-6 py-2 rounded-xl"
          >
            Reload
          </button>
        )}
      </div>
    );
  }

  if (!user && authView !== "landing") {
    return (
      <Layout user={null} onLogout={() => {}}>
        <div className="py-12 flex justify-center">
          {authView === "login" ? (
            <SignIn routing="hash" signUpUrl="#signup" />
          ) : (
            <SignUp routing="hash" signInUrl="#login" />
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
    <Layout
      user={user}
      onLogout={handleLogout}
      onLogoClick={() =>
        setState((p) => ({
          ...p,
          result: null,
          file: null,
          preview: null,
        }))
      }
    >
      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-4 space-y-6">

          <div className="bg-white p-6 rounded-3xl">
            <h3 className="font-bold flex items-center mb-4">
              <MapPin className="w-5 h-5 mr-2 text-[#00a3e0]" />
              Healthcare Location
            </h3>

            <select
              value={cityTier}
              onChange={(e) =>
                setSelectedCityTier(
                  e.target.value as "Tier-1" | "Tier-2" | "Tier-3"
                )
              }
              className="w-full p-3 border rounded-xl"
            >
              <option value="Tier-1">Metro</option>
              <option value="Tier-2">Tier 2</option>
              <option value="Tier-3">Tier 3</option>
            </select>
          </div>

          <div className="bg-white p-6 rounded-3xl">
            <h3 className="font-bold flex items-center mb-4">
              <History className="w-5 h-5 mr-2 text-[#00a3e0]" />
              Recent Scans
            </h3>

            {history.length === 0 && (
              <p className="text-sm text-gray-500">
                No scans yet.
              </p>
            )}

            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => setState((p) => ({ ...p, result: h }))}
                className="block w-full text-left p-3 border rounded-xl mb-2"
              >
                <p className="text-xs text-blue-500">{h.documentType}</p>
                <p className="font-semibold">{h.summary}</p>
              </button>
            ))}
          </div>

        </aside>

        <main className="lg:col-span-8">

          {state.isAnalyzing && (
            <div className="bg-white p-20 text-center rounded-3xl">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
              <p>Analyzing medical document...</p>
            </div>
          )}

          {!state.isAnalyzing && state.result && (
            <AnalysisView analysis={state.result} />
          )}

          {!state.isAnalyzing && !state.result && (
            <div className="bg-white p-10 rounded-3xl text-center">

              <FileUploader
                onFileSelect={handleFileSelect}
                selectedFile={state.file}
                onClear={() =>
                  setState((p) => ({
                    ...p,
                    file: null,
                    preview: null,
                  }))
                }
              />

              {state.file && (
                <button
                  onClick={handleAnalyze}
                  className="mt-6 bg-[#0f2a43] text-white px-8 py-4 rounded-xl"
                >
                  <Sparkles className="inline mr-2" />
                  Analyze
                </button>
              )}

              {state.error && (
                <div className="mt-4 text-red-500 flex items-center justify-center">
                  <AlertCircle className="mr-2" />
                  {state.error}
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
