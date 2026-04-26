/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, LayoutDashboard, Settings, Youtube, Video, 
  Calendar, CheckCircle, Loader2, Sparkles, Wand2, 
  LogOut, Plus, AlertCircle, BarChart3, Clock, FileVideo, Copy,
  ArrowRight, Search, Sliders, Play, Scissors, Film, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { generateSEOData, generateEditPlan } from './services/geminiService';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'gallery' | 'upload' | 'settings'>('gallery');
  const [videos, setVideos] = useState<any[]>([]);
  const [galleryVideos, setGalleryVideos] = useState<any[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    fetchGallery();
  }, [currentView]);

  const fetchWithRetry = async (url: string, options: RequestInit = {}, retries = 5, delay = 2000): Promise<Response> => {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type");
      
      // Check if it's the warmup page
      if (contentType && contentType.includes("text/html")) {
        const text = await res.clone().text();
        if (text.includes("Please wait while your application starts") && retries > 0) {
          console.warn(`Servidor em warmup para ${url}, tentando novamente em ${delay/1000}s... (${retries} restantes)`);
          await new Promise(r => setTimeout(r, delay));
          return fetchWithRetry(url, options, retries - 1, delay);
        }
      }
      return res;
    } catch (e) {
      if (retries > 0) {
        console.warn(`Erro na rede para ${url}, tentando novamente em ${delay/1000}s... (${retries} restantes)`);
        await new Promise(r => setTimeout(r, delay));
        return fetchWithRetry(url, options, retries - 1, delay);
      }
      throw e;
    }
  };

  const initializeApp = async () => {
    await checkAuth();
    await fetchGallery();
  };

  const checkAuth = async () => {
    try {
      const res = await fetchWithRetry('/api/auth/user');
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const contentType = res.headers.get("content-type");
      if (res.ok && contentType && contentType.includes("application/json")) {
        const data = await res.json();
        setIsAuthenticated(data.authenticated);
        if (data.authenticated) {
          fetchMyVideos();
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.error("Erro ao verificar auth:", e);
      setIsAuthenticated(false);
    }
  };

  const fetchMyVideos = async () => {
    setIsLoadingVideos(true);
    try {
      const res = await fetchWithRetry('/api/youtube/videos');
      if (res.ok) {
        const data = await res.json();
        setVideos(data);
      }
    } catch (e) {
      console.error("Erro ao buscar vídeos:", e);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const fetchGallery = async () => {
    if (isLoadingGallery) return;
    setIsLoadingGallery(true);
    try {
      const res = await fetchWithRetry('/api/gallery');
      const contentType = res.headers.get("content-type");
      
      if (!res.ok) {
        let errorMsg = `Server error ${res.status}`;
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
        } catch (e) {
          errorMsg = await res.text();
        }
        throw new Error(errorMsg);
      }

      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        setGalleryVideos(data);
      } else {
        console.error("Non-JSON response from gallery");
        throw new Error("Resposta do servidor não é JSON.");
      }
    } catch (e: any) {
      console.error("Erro ao buscar galeria:", e);
    } finally {
      setIsLoadingGallery(false);
    }
  };

  const connectYouTube = async () => {
    try {
      const res = await fetch('/api/auth/url');
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Erro desconhecido no servidor' }));
        alert(`Erro: ${errorData.error || 'Não foi possível obter a URL de autenticação'}`);
        return;
      }
      
      const { url } = await res.json();
      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      
      if (!authWindow) {
        alert('Por favor, permita popups para conectar sua conta.');
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
          setIsAuthenticated(true);
          fetchMyVideos();
          window.removeEventListener('message', handleMessage);
        }
      };
      window.addEventListener('message', handleMessage);
    } catch (e) {
      console.error("Erro ao obter URL de auth:", e);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setIsAuthenticated(false);
    setVideos([]);
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onConnect={connectYouTube} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      <aside className="w-20 lg:w-64 bg-slate-900 flex flex-col z-20 border-r border-slate-800">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-10 h-10 bg-indigo-500 rounded flex items-center justify-center shadow-lg">
            <Youtube className="w-6 h-6 text-white" />
          </div>
          <span className="text-lg font-black tracking-tighter text-white hidden lg:block uppercase">
            Auto<span className="text-indigo-500">Studio</span>
          </span>
        </div>
        
        <nav className="flex-1 p-4 space-y-6 mt-6">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={currentView === 'dashboard'} 
            onClick={() => setCurrentView('dashboard')} 
          />
          <NavItem 
            icon={<Play size={20} />} 
            label="Gallery" 
            active={currentView === 'gallery'} 
            onClick={() => setCurrentView('gallery')} 
          />
          <NavItem 
            icon={<Upload size={20} />} 
            label="Upload AI" 
            active={currentView === 'upload'} 
            onClick={() => setCurrentView('upload')} 
          />
          <NavItem 
            icon={<Settings size={20} />} 
            label="API Settings" 
            active={currentView === 'settings'} 
            onClick={() => setCurrentView('settings')} 
          />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-6 px-2 lg:px-4">
            <div className="w-10 h-10 rounded bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white shadow-inner">
              A
            </div>
            <div className="text-xs hidden lg:block">
              <p className="font-bold text-slate-300">ADMIN CHANNEL</p>
              <div className="flex items-center gap-1 text-indigo-400 font-bold mt-0.5">
                <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse"></span>
                ACTIVE
              </div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 justify-center lg:justify-start lg:px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:bg-slate-800 transition-all"
          >
            <LogOut size={16} /> <span className="hidden lg:block">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-20 border-b border-slate-200 flex items-center justify-between px-8 bg-white z-10">
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase text-slate-800">
              {currentView === 'dashboard' && 'Automation Dashboard'}
              {currentView === 'gallery' && 'Video Gallery'}
              {currentView === 'upload' && 'AI Production Flow'}
              {currentView === 'settings' && 'System Configuration'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 text-[10px] font-bold uppercase border border-green-100 rounded">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              YouTube API Verified
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50">
          <AnimatePresence mode="wait">
            {currentView === 'dashboard' && (
              <DashboardView 
                key="dashboard"
                videos={videos} 
                onNew={() => setCurrentView('upload')} 
                onRefresh={fetchMyVideos}
                isLoading={isLoadingVideos} 
              />
            )}
            {currentView === 'gallery' && (
              <GalleryView 
                key="gallery"
                videos={galleryVideos}
                onNew={() => setCurrentView('upload')}
                onRefresh={fetchGallery}
              />
            )}
            {currentView === 'upload' && (
              <UploadWizard 
                key="upload"
                onComplete={(newVideo?: any) => {
                  if (newVideo) {
                    setGalleryVideos(prev => {
                      // Check if already exists (to avoid duplicates from fast fetch)
                      if (prev.some(v => v.id === newVideo.id)) return prev;
                      return [newVideo, ...prev];
                    });
                  }
                  setCurrentView('gallery');
                  fetchGallery();
                }} 
              />
            )}
            {currentView === 'settings' && (
              <SettingsView 
                key="settings"
                onLogout={handleLogout}
              />
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex flex-col lg:flex-row items-center gap-2 lg:gap-4 px-2 lg:px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all duration-300 border-r-4 ${
        active 
          ? 'text-white border-indigo-500 opacity-100' 
          : 'text-slate-500 border-transparent opacity-60 hover:opacity-100 hover:text-slate-300'
      }`}
    >
      <div className={`${active ? 'text-indigo-400' : 'text-slate-500'}`}>{icon}</div>
      <span className="hidden lg:block">{label}</span>
    </button>
  );
}

function LoginScreen({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[60%] bg-indigo-600 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[60%] bg-red-600 blur-[120px] rounded-full opacity-50"></div>
      </div>
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl w-full z-10"
      >
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-12 lg:p-16 relative shadow-2xl">
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-500"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-500"></div>
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-white flex items-center justify-center mb-10 shadow-[0_0_40px_rgba(255,255,255,0.1)]">
              <Youtube className="w-12 h-12 text-red-600" />
            </div>
            <h1 className="text-5xl lg:text-6xl font-black text-white tracking-tighter uppercase leading-none mb-2">
              Auto<span className="text-indigo-500">Studio</span>
            </h1>
            <p className="text-[10px] text-indigo-400 font-bold tracking-[0.4em] uppercase mb-12">Precision AI Media Deployment</p>
            <div className="space-y-8 w-full">
              <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-sm mx-auto">
                The most advanced video SEO automation engine. Connect your professional workspace to begin content synthesis.
              </p>
              <div className="p-6 bg-white/5 border border-white/5 text-left space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div>
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Network Configuration Required</h4>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-black/40 text-[10px] font-mono text-indigo-300 break-all border border-white/5">
                    {window.location.origin}/auth/callback
                  </code>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/auth/callback`);
                      alert('URL Copied to clipboard');
                    }}
                    className="p-3 bg-white/5 hover:bg-white/10 text-white transition-colors"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
              <button 
                onClick={onConnect}
                className="w-full bg-white text-black font-black py-5 px-8 flex items-center justify-center gap-4 transition-all hover:bg-indigo-500 hover:text-white uppercase tracking-[0.2em] text-xs group"
              >
                <Play size={20} className="fill-current" />
                Initialize YouTube Auth
                <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function GalleryView({ videos, onNew, onRefresh }: { videos: any[], onNew: () => void, onRefresh: () => void, key?: string }) {
  const [isPublishing, setIsPublishing] = useState<string | null>(null);

  const publishToYoutube = async (videoId: string) => {
    setIsPublishing(videoId);
    try {
      const res = await fetch('/api/youtube/publish-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });
      
      const data = await res.json();
      if (res.ok) {
        alert("Sucesso! Vídeo publicado no YouTube.");
        onRefresh();
      } else {
        alert(`Erro: ${data.error}`);
      }
    } catch (e) {
      console.error("Erro ao publicar:", e);
      alert("Erro de conexão ao tentar publicar.");
    } finally {
      setIsPublishing(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-10 pb-20"
    >
      <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Local Gallery</h2>
          <p className="text-[10px] text-slate-400 font-bold tracking-[0.2em] mt-1">FIRESTORE / SYNCED_CONTENT / ARCHIVE</p>
        </div>
        <button 
          onClick={onNew}
          className="bg-indigo-600 hover:bg-slate-900 text-white px-8 py-2 text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-100 flex items-center gap-2"
        >
          <Plus size={16} /> NEW PRODUCTION
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {videos.length > 0 ? (
          videos.map((video, idx) => (
            <motion.div 
              key={video.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white border border-slate-200 group hover:shadow-xl transition-all flex flex-col relative overflow-hidden"
            >
              <div className="aspect-video bg-slate-100 relative overflow-hidden">
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                ) : video.localPath ? (
                  <video 
                    src={video.localPath} 
                    className="w-full h-full object-cover" 
                    muted 
                    loop 
                    onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                    onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-300">
                    <Video size={48} />
                  </div>
                )}
                <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4 text-white p-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest border border-white/20 px-3 py-1 rounded-full mb-2">
                    {video.status === 'local' ? 'LOCAL_STORAGE' : 'WATCH_ON_YOUTUBE'}
                  </p>
                  
                  {video.youtubeId ? (
                    <a 
                      href={`https://www.youtube.com/watch?v=${video.youtubeId}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-slate-900 hover:bg-red-600 hover:text-white transition-all shadow-2xl"
                    >
                      <Play size={24} className="ml-1 fill-current" />
                    </a>
                  ) : (
                    <div className="flex flex-col gap-2 w-full px-4">
                      <button 
                         onClick={() => window.open(video.localPath, '_blank')}
                         className="w-full py-2 bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
                      >
                        Preview Local
                      </button>
                      <button 
                         onClick={() => publishToYoutube(video.id)}
                         disabled={!!isPublishing}
                         className="w-full py-2 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                      >
                        {isPublishing === video.id ? <Loader2 size={12} className="animate-spin" /> : <Youtube size={12} />}
                        Publish to YouTube
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6 space-y-3">
                <h4 className="text-sm font-black text-slate-800 line-clamp-2 uppercase tracking-tight leading-tight min-h-[2.5rem]">
                  {video.title}
                </h4>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1">PROD_ID</span>
                    <span className="text-[9px] font-bold text-slate-400 font-mono">{video.youtubeId?.substring(0, 11)}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">DEPLOYED</span>
                    <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                      <Calendar size={10} /> {video.createdAt ? new Date(video.createdAt).toLocaleDateString() : 'JUST NOW'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="h-1 w-0 bg-indigo-500 group-hover:w-full transition-all duration-500"></div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-32 flex flex-col items-center justify-center text-center bg-white border-2 border-dashed border-slate-200 rounded-xl">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <Video size={40} className="text-slate-200" />
            </div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Gallery Empty</h3>
            <p className="text-slate-400 text-sm mt-1 mb-8 uppercase tracking-widest font-bold">Start your first production to see content here</p>
            <button 
              onClick={onNew}
              className="bg-slate-900 text-white px-10 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all"
            >
              Initialize Production
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function DashboardView({ videos, onNew, isLoading, onRefresh }: { videos: any[], onNew: () => void, isLoading: boolean, onRefresh: () => void, key?: string }) {
  const featuredVideo = videos.length > 0 ? videos[0] : null;
  const remainingVideos = videos.slice(1);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-10 pb-20"
    >
      {!isLoading && featuredVideo && (
        <section className="relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-full bg-slate-900 -z-10"></div>
          <div className="absolute top-0 right-0 w-1/2 h-full bg-indigo-600/10 skew-x-12 transform translate-x-32 -z-10"></div>
          
          <div className="flex flex-col lg:flex-row items-stretch border border-slate-800 bg-slate-900/50 backdrop-blur-sm shadow-2xl">
            <div className="lg:w-2/3 relative aspect-video overflow-hidden">
               {featuredVideo.snippet?.thumbnails?.high?.url ? (
                 <img src={featuredVideo.snippet.thumbnails.high.url} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
               ) : (
                 <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                    <Video size={64} className="text-slate-700" />
                 </div>
               )}
            </div>
            <div className="lg:w-1/3 p-8 lg:p-12 flex flex-col justify-center gap-6">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4 block">LATEST PRODUCTION</span>
              <h2 className="text-2xl lg:text-3xl font-black text-white leading-tight uppercase tracking-tight">{featuredVideo.snippet?.title}</h2>
              <button className="flex items-center gap-3 text-[10px] font-black text-white uppercase tracking-widest hover:text-indigo-400 transition-colors pt-4 font-mono">/STUDIO_ACCESS <ArrowRight size={14} /></button>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Flux" value={videos.length} icon={<Video size={20} />} change="SYNCED" />
        <StatCard title="Tokens" value="1.2k" icon={<Sparkles size={20} />} change="+34%" />
        <StatCard title="Total Saved" value="48h" icon={<Clock size={20} />} change="ESTIMATED" />
        <StatCard title="SEO Avg" value="98%" icon={<BarChart3 size={20} />} change="OPTIMAL" />
      </div>

      <div className="flex flex-col lg:flex-row gap-12">
        <div className="flex-1 space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pb-6 border-b border-slate-200">
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Archive</h2>
            </div>
            <div className="flex gap-4">
              <button onClick={onRefresh} disabled={isLoading} className="bg-white border border-slate-200 p-2.5 text-slate-400 hover:text-indigo-600"><Sliders size={16} className={isLoading ? 'animate-spin' : ''} /></button>
              <button onClick={onNew} className="bg-indigo-600 text-white px-8 py-2 text-[10px] font-black uppercase tracking-widest"><Plus size={16} /> NEW</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {remainingVideos.map((video, idx) => (
              <div key={video.id?.videoId || idx} className="bg-white border border-slate-200 p-4">
                 <h4 className="text-sm font-black truncate">{video.snippet?.title}</h4>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ title, value, icon, change }: { title: string, value: string | number, icon: React.ReactNode, change: string }) {
  return (
    <div className="bg-white border border-slate-200 p-6 flex flex-col gap-4">
      <div className="flex justify-between items-center text-slate-400">{icon} <span className="text-[9px] font-black tracking-widest">{change}</span></div>
      <div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
        <h3 className="text-2xl font-black text-slate-900 mt-1">{value}</h3>
      </div>
    </div>
  );
}

function UploadWizard({ onComplete }: { onComplete: (data?: any) => void, key?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [uploadBytes, setUploadBytes] = useState<{ loaded: number, total: number }>({ loaded: 0, total: 0 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editPlan, setEditPlan] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [seoData, setSeoData] = useState({ title: '', description: '', tags: '', privacy: 'private' });
  const [editStyle, setEditStyle] = useState('none'); // 'none', 'fast', 'cinematic', 'minimal'
  const [dragActive, setDragActive] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 0]);
  const [isTrimming, setIsTrimming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const generateThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.play();
      
      video.onloadeddata = () => {
        video.currentTime = 1; // Capture at 1 second
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        // Cap thumbnail size to 1280px width to avoid massive base64 payloads
        const maxWidth = 1280;
        const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // 60% quality for better size management
        URL.revokeObjectURL(video.src);
        resolve(dataUrl);
      };
    });
  };

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const runAiOptimization = async () => {
    if (!file) return;
    setIsGenerating(true);
    
    try {
      const data = await generateSEOData(file.name, prompt);
      setSeoData({
        title: data.title || file.name,
        description: data.description || 'Vídeo automatizado via AutoStudio.',
        tags: data.tags || 'autostudio, youtube, ai',
        privacy: 'public'
      });
    } catch (e: any) {
      console.error("Erro ao gerar SEO:", e);
      alert(`Erro no assistente AI: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const applyAIEdit = async () => {
    if (!file) return;
    setIsEditing(true);
    setEditPlan(null);
    
    try {
      const data = await generateEditPlan(file.name, prompt, editStyle);
      setEditPlan(data);
      // Optionally update SEO data if AI suggests better title based on edit
      if (data.suggestedTitle) {
        setSeoData(prev => ({ ...prev, title: data.suggestedTitle }));
      }
    } catch (e: any) {
      console.error("AI Edit Error:", e);
      alert(`Erro na edição AI: ${e.message}`);
    } finally {
      setIsEditing(false);
    }
  };

  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(selectedFile));
    
    // Start thumbnail generation in parallel
    generateThumbnail(selectedFile).then(thumb => setThumbnail(thumb));
  };

  const uploadToGallery = async () => {
    if (!file) return;
    setIsPublishing(true);
    setUploadProgress(0);
    setUploadSpeed(0);
    setTimeRemaining(null);
    setUploadBytes({ loaded: 0, total: 0 });
    
    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('title', seoData.title || file.name);
      formData.append('description', seoData.description);
      formData.append('tags', seoData.tags);
      formData.append('thumbnail', thumbnail || '');

      const startTime = Date.now();
      
      const uploadPromise = new Promise<{ id: string, localPath: string, thumbnailPath: string } | boolean>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setUploadProgress(percentComplete);
            setUploadBytes({ loaded: e.loaded, total: e.total });

            const duration = (Date.now() - startTime) / 1000; // seconds
            if (duration > 0.1) {
              const speed = e.loaded / duration; // bytes per second
              setUploadSpeed(speed);
              
              const remainingBytes = e.total - e.loaded;
              const remainingTime = remainingBytes / speed;
              setTimeRemaining(remainingTime);
            }
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch (e) {
              resolve(true);
            }
          } else {
            let errorMessage = 'Erro no servidor ao salvar vídeo.';
            try {
              const errorData = JSON.parse(xhr.responseText);
              errorMessage = errorData.error || errorMessage;
            } catch (err) {
              if (xhr.status === 413) {
                errorMessage = 'O arquivo é muito grande para os limites do servidor (413). Tente um arquivo menor que 100MB.';
              } else {
                errorMessage = `Erro HTTP ${xhr.status}: Não foi possível salvar o vídeo.`;
              }
            }
            reject(new Error(errorMessage));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Erro de rede ou conexão interrompida.'));
        });

        xhr.open('POST', '/api/videos/direct-upload');
        xhr.send(formData);
      });

      const result = await uploadPromise;
      
      // Pass full metadata back for optimistic update
      if (typeof result === 'object') {
        onComplete({
          id: result.id,
          title: seoData.title || file.name,
          description: seoData.description,
          tags: seoData.tags,
          thumbnailUrl: result.thumbnailPath,
          localPath: result.localPath,
          status: 'local',
          createdAt: new Date().toISOString()
        });
      } else {
        onComplete();
      }
    } catch (e: any) {
      console.error("Upload error:", e);
      alert(e.message || "Erro durante o upload.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-4xl mx-auto"
    >
      <div className="bg-white border border-slate-200 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>
        
        <div className="p-8 lg:p-12">
          {!file ? (
            <div 
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-4 border-dashed rounded-xl p-20 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="video/*"
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} 
              />
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                <Upload className="w-10 h-10 text-indigo-600" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Drag Video Here</h3>
              <p className="text-slate-400 text-sm mt-2 font-medium italic">Optimized for content up to 100MB (Platform limit)</p>
              <div className="mt-4 flex items-center gap-2 text-[10px] text-amber-600 font-bold uppercase tracking-widest bg-amber-50 px-3 py-1 border border-amber-100">
                <AlertCircle size={12} /> Large files may trigger network timeout 413
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="flex items-center gap-6 p-6 bg-slate-50 border border-slate-100 rounded-lg">
                <div className="w-16 h-16 bg-indigo-600 flex items-center justify-center rounded">
                  <Video className="text-white" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">SELECTED_BUFFER</p>
                  <h4 className="text-sm font-black text-slate-900 truncate">{file.name}</h4>
                  <p className="text-[10px] text-slate-400 font-bold">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <button 
                  onClick={() => { setFile(null); setVideoUrl(null); }}
                  className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest"
                >
                  Remove
                </button>
              </div>

              {videoUrl && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Video Production Preview</label>
                      <div className="aspect-video bg-black rounded-lg overflow-hidden border border-slate-200 shadow-inner group relative">
                        <video 
                          src={videoUrl} 
                          controls 
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Auto-Generated Thumbnail</label>
                      <div className="aspect-video bg-slate-50 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center relative">
                        {thumbnail ? (
                          <img src={thumbnail} className="w-full h-full object-cover" alt="Auto-generated thumbnail" />
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                             <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                             <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Generating...</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 leading-tight italic">
                        The production engine has automatically captured line 1.0s as the primary keyframe for this content.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="col-span-full space-y-4 p-6 bg-indigo-50/50 border border-indigo-100 rounded-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <div className="flex items-center gap-1">
                       <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                       <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">IA_ENGINE_ACTIVE</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">AI Creative Optimizer</label>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <input 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Descreva seu vídeo (ex: Tutorial de culinária, vlog de viagem...)"
                      className="flex-1 bg-white border border-indigo-200 p-4 text-xs font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-300 rounded shadow-inner"
                    />
                    <button 
                      onClick={runAiOptimization}
                      disabled={isGenerating || !prompt}
                      className="bg-indigo-600 hover:bg-slate-900 text-white px-8 py-4 text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed min-w-[220px]"
                    >
                      {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                      {isGenerating ? 'Analyzing...' : 'Generate SEO Metadata'}
                    </button>
                  </div>
                  <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-tight italic">
                    Gemini 1.5 Pro will automatically generate Title, Description and Tags based on your prompt and file name.
                  </p>
                </div>

                <div className="col-span-full space-y-6 p-6 bg-slate-900 border border-slate-800 rounded-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-20">
                    <Film className="text-white w-24 h-24 rotate-12" />
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <Scissors className="w-4 h-4 text-amber-400" />
                    <label className="text-[10px] font-black text-amber-400 uppercase tracking-widest block">AI Smart Video Production</label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
                    <div className="md:col-span-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: 'none', label: 'Original', icon: <Video size={14} /> },
                          { id: 'fast', label: 'Fast Paced', icon: <Zap size={14} /> },
                          { id: 'cinematic', label: 'Cinematic', icon: <Film size={14} /> },
                          { id: 'minimal', label: 'Clean Cut', icon: <Scissors size={14} /> }
                        ].map((style) => (
                          <button
                            key={style.id}
                            onClick={() => setEditStyle(style.id)}
                            className={`flex flex-col items-center justify-center p-3 rounded border transition-all ${
                              editStyle === style.id 
                                ? 'bg-amber-500 border-amber-500 text-slate-900' 
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                            }`}
                          >
                            {style.icon}
                            <span className="text-[9px] font-black uppercase mt-1 tracking-tighter">{style.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <button 
                        onClick={applyAIEdit}
                        disabled={isEditing || editStyle === 'none'}
                        className="w-full h-full bg-slate-100 hover:bg-white text-slate-900 p-4 rounded text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center gap-2 disabled:opacity-30"
                      >
                        {isEditing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} className="text-indigo-600" />}
                        {isEditing ? 'Editing...' : 'Apply AI Edit'}
                      </button>
                    </div>
                  </div>

                  {editPlan && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-800/50 border border-slate-700 p-4 rounded-lg mt-4"
                    >
                      <h5 className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <CheckCircle size={12} /> AI_PRODUCTION_LOG_READY
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-[10px] text-slate-300 font-bold"><span className="text-slate-500 uppercase mr-2 text-[8px]">Operation:</span> {editPlan.operation}</p>
                          <p className="text-[10px] text-slate-300 font-bold"><span className="text-slate-500 uppercase mr-2 text-[8px]">Trim Points:</span> {editPlan.duration}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] text-slate-300 font-bold"><span className="text-slate-500 uppercase mr-2 text-[8px]">Transition:</span> {editPlan.transition}</p>
                          <p className="text-[10px] text-slate-300 font-bold italic text-amber-200">"{editPlan.summary}"</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Video Title (AI Optimized)</label>
                    <div className="relative">
                      <input 
                        value={seoData.title} 
                        onChange={(e) => setSeoData({ ...seoData, title: e.target.value })}
                        className="w-full bg-white border border-slate-200 p-4 text-xs font-bold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                        placeholder="Loading Title..."
                      />
                      {isGenerating && <Loader2 size={16} className="absolute right-4 top-4 animate-spin text-indigo-500" />}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Description</label>
                    <textarea 
                      value={seoData.description} 
                      onChange={(e) => setSeoData({ ...seoData, description: e.target.value })}
                      className="w-full bg-white border border-slate-200 p-4 text-xs font-bold min-h-[150px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="Loading Description..."
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Tags</label>
                    <input 
                      value={seoData.tags} 
                      onChange={(e) => setSeoData({ ...seoData, tags: e.target.value })}
                      className="w-full bg-white border border-slate-200 p-4 text-xs font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="tag1, tag2..."
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Privacy State</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['public', 'private'].map((p) => (
                        <button
                          key={p}
                          onClick={() => setSeoData({ ...seoData, privacy: p })}
                          className={`py-3 text-[10px] font-black uppercase tracking-widest border transition-all ${
                            seoData.privacy === p 
                              ? 'bg-slate-900 border-slate-900 text-white' 
                              : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="pt-6">
                    {isPublishing && (
                      <div className="space-y-4 mb-8 bg-slate-50 p-6 border border-slate-100 rounded-xl">
                        <div className="flex justify-between items-end">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">Transfer Progress</span>
                              <div className="h-0.5 w-8 bg-indigo-200"></div>
                            </div>
                            <div className="flex items-baseline gap-3">
                              <span className="text-4xl font-black text-slate-900 leading-none">{Math.round(uploadProgress)}%</span>
                              <span className="text-xs font-bold text-slate-400">
                                {(uploadBytes.loaded / (1024 * 1024)).toFixed(1)} / {(uploadBytes.total / (1024 * 1024)).toFixed(1)} MB
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mt-2">
                              <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">SPEED</span>
                                <span className="text-[10px] font-bold text-slate-700">{(uploadSpeed / (1024 * 1024)).toFixed(2)} MB/s</span>
                              </div>
                              <div className="w-px h-6 bg-slate-200"></div>
                              <div className="flex flex-col">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">TIME_LEFT</span>
                                <span className="text-[10px] font-bold text-slate-700">
                                  {timeRemaining !== null ? `${Math.ceil(timeRemaining)}s` : '--'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">DATA_STREAM</span>
                            <div className="flex items-center justify-end gap-1 px-3 py-1 bg-indigo-100/50 border border-indigo-200 rounded text-indigo-700">
                               <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                               <span className="text-[8px] font-black uppercase">Active</span>
                            </div>
                          </div>
                        </div>
                        <div className="relative">
                          <div className="h-4 bg-slate-200 rounded-full overflow-hidden p-1 shadow-inner">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                              className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-600 rounded-full relative shadow-[0_0_15px_rgba(79,70,229,0.5)]"
                            >
                              <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[progress-stripe_1s_linear_infinite]" />
                            </motion.div>
                          </div>
                          <div className="absolute -bottom-5 left-0 w-full flex justify-between text-[7px] font-black text-slate-300 uppercase tracking-widest">
                            <span>0%</span>
                            <span>25%</span>
                            <span>50%</span>
                            <span>75%</span>
                            <span>100%</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <button 
                      onClick={uploadToGallery}
                      disabled={isPublishing || !file || isGenerating}
                      className={`w-full py-5 flex items-center justify-center gap-4 text-xs font-black uppercase tracking-[0.2em] transition-all ${
                        isPublishing 
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                        : 'bg-indigo-600 text-white hover:bg-slate-900 shadow-xl shadow-indigo-100'
                      }`}
                    >
                      {isPublishing ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          {uploadProgress < 100 ? 'Uploading content...' : 'Finalizing Production...'}
                        </>
                      ) : (
                        <>
                          <Upload size={18} />
                          Upload to AutoStudio
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded bg-green-50 flex items-center justify-center text-green-600">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">AI_OPTIMIZATION</p>
            <p className="text-xs font-bold text-slate-800">Title & SEO Active</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded bg-indigo-50 flex items-center justify-center text-indigo-600">
            <CheckCircle size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">QUALITY_GATE</p>
            <p className="text-xs font-bold text-slate-800">4K Support Verified</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded bg-amber-50 flex items-center justify-center text-amber-600">
            <Wand2 size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">THUMBNAIL_AUTO</p>
            <p className="text-xs font-bold text-slate-800">Frame Extraction</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SettingsView({ onLogout }: { onLogout: () => void }) {
  return <button onClick={onLogout} className="bg-slate-900 text-white p-4">Logout</button>;
}
