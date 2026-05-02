import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Save, 
  Upload, 
  Layers, 
  Sliders, 
  Image as ImageIcon,
  LogOut,
  LogIn,
  RotateCcw,
  Download
} from 'lucide-react';
import { auth, signInWithGoogle, signOut, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Filter, getFilters, saveFilter, deleteFilter } from './services/filterService';
import { analyzeImage, AIAnalysis } from './services/aiService';
import { Stage, Layer, Image as KonvaImage, Rect, Text as KonvaText } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Sparkles, Brain, Type as TypeIcon } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fill: string;
}

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  size = 'md',
  disabled
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'accent' | 'ai';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}) => {
  const base = "inline-flex items-center justify-center font-mono transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-[10px] h-8 px-4 rounded-none border";
  
  const variants = {
    primary: "bg-brand-accent text-black border-brand-accent hover:bg-amber-400",
    secondary: "bg-brand-surface text-brand-text border-brand-border hover:bg-[#1A1A1A]",
    outline: "bg-transparent text-brand-text border-brand-border hover:border-brand-accent",
    ghost: "bg-transparent text-gray-500 border-transparent hover:text-brand-text",
    accent: "bg-orange-600/20 text-brand-accent border-orange-600/40 hover:bg-orange-600/30",
    ai: "bg-indigo-600/20 text-indigo-400 border-indigo-600/40 hover:bg-indigo-600/30"
  };

  return (
    <button 
      onClick={onClick} 
      className={cn(base, variants[variant], className)}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

const Slider = ({ 
  label, 
  value, 
  min, 
  max, 
  onChange,
  step = 1
}: { 
  label: string; 
  value: number; 
  min: number; 
  max: number; 
  onChange: (val: number) => void;
  step?: number;
}) => (
  <div className="space-y-2 py-3">
    <div className="flex justify-between items-center text-[10px] font-mono text-gray-500 uppercase">
      <span>{label}</span>
      <span className="text-brand-accent">{value.toFixed(label === 'Brightness' ? 2 : 0)}</span>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      step={step}
      value={value} 
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1 bg-brand-border rounded-lg appearance-none cursor-pointer accent-brand-accent"
    />
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Image State
  const [mainImageUrl, setMainImageUrl] = useState<string | null>(null);
  const [mainImage] = useImage(mainImageUrl || '');
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const imageRef = useRef<any>(null);

  // Filter State
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [hue, setHue] = useState(0);
  const [name, setName] = useState('New Filter');

  const [savedFilters, setSavedFilters] = useState<Filter[]>([]);
  const [activeTab, setActiveTab] = useState<'adjust' | 'filters' | 'ai'>('adjust');

  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (user) {
      loadFilters();
    }
  }, [user]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (imageRef.current && mainImage) {
      // Ensure image is loaded and has dimensions before caching
      if (mainImage.width > 0 && mainImage.height > 0) {
        imageRef.current.cache();
      }
    }
  }, [mainImage, brightness, contrast, saturation, hue]);

  const loadFilters = async () => {
    const filters = await getFilters();
    if (filters) setSavedFilters(filters);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMainImageUrl(reader.result as string);
        setAiAnalysis(null);
        setTextLayers([]);
      };
      reader.readAsDataURL(file);
    }
  };

  const addTextLayer = (initialText: string = 'Double click to edit') => {
    const newLayer: TextLayer = {
      id: Math.random().toString(36).substr(2, 9),
      text: initialText,
      x: stageSize.width / 2 - 50,
      y: stageSize.height / 2 - 20,
      fontSize: 24,
      fill: '#ffffff'
    };
    setTextLayers([...textLayers, newLayer]);
  };

  const handleTextUpdate = (id: string, updates: Partial<TextLayer>) => {
    setTextLayers(textLayers.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const handleSaveFilter = async () => {
    if (!user) return;
    try {
      await saveFilter({
        name,
        brightness,
        contrast,
        saturation,
        hue
      });
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#E0E0E0', '#000000']
      });
      loadFilters();
    } catch (err) {
      alert("Failed to save filter. Check console for details.");
    }
  };

  const applySavedFilter = (f: Filter) => {
    setBrightness(f.brightness);
    setContrast(f.contrast);
    setSaturation(f.saturation);
    setHue(f.hue);
    setName(f.name);
  };

  const resetAdjustments = () => {
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setHue(0);
  };

  const handleAIAnalysis = async () => {
    if (!mainImageUrl) return;
    setIsAnalyzing(true);
    try {
      const base64 = mainImageUrl.split(',')[1];
      const mimeType = mainImageUrl.split(';')[0].split(':')[1];
      const analysis = await analyzeImage(base64, mimeType);
      setAiAnalysis(analysis);
      setActiveTab('ai');
      confetti({
        particleCount: 50,
        spread: 40,
        origin: { x: 0.8, y: 0.8 },
        colors: ['#818cf8', '#E0E0E0']
      });
    } catch (err) {
      console.error(err);
      alert("AI Analysis failed. Check console.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownload = () => {
    if (stageRef.current) {
      const uri = stageRef.current.toDataURL();
      const link = document.createElement('a');
      link.download = 'edited-photo.png';
      link.href = uri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const calculateImageScale = () => {
    if (!mainImage) return 1;
    const padding = 40;
    const maxWidth = stageSize.width - padding;
    const maxHeight = stageSize.height - padding;
    const ratio = Math.min(maxWidth / mainImage.width, maxHeight / mainImage.height);
    return ratio;
  };

  if (loading) return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-brand-bg text-brand-text font-mono">
      <div className="w-12 h-12 border-2 border-brand-accent/20 border-t-brand-accent animate-spin rounded-full mb-4"></div>
      <span className="text-[10px] tracking-widest uppercase animate-pulse">Initializing Material Core...</span>
    </div>
  );

  return (
    <div className="h-screen w-full flex flex-col bg-brand-bg overflow-hidden selection:bg-brand-accent/30 selection:text-brand-accent">
      {/* Navigation */}
      <nav className="h-14 border-b border-brand-border flex items-center justify-between px-6 bg-brand-surface z-50">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <span className="font-black tracking-tighter text-xl text-white leading-none">
              MATERIA<span className="text-brand-accent underline underline-offset-4 decoration-1 font-light italic">LAB</span>
            </span>
            <span className="text-[8px] font-mono text-gray-600 tracking-[0.3em] uppercase mt-1">Experimental Canvas v1.0.4</span>
          </div>
          
          <div className="hidden md:flex gap-6 text-[9px] font-mono uppercase tracking-widest text-gray-500">
            <span className="text-brand-accent border-b border-brand-accent/30 pb-1">Workspace</span>
            <span className="hover:text-brand-text cursor-pointer transition-colors pb-1">Registry</span>
            <span className="hover:text-brand-text cursor-pointer transition-colors pb-1">Simulations</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex h-8 bg-black border border-brand-border rounded px-3 items-center gap-4 text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-green-500/80">RENDER_ENGINE: READY</span>
            </div>
            <span className="text-gray-600 block sm:hidden md:block">|</span>
            <span className="text-gray-500 hidden md:block">LATENCY: 14MS</span>
          </div>
          
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end mr-2">
                <span className="text-[10px] font-mono text-white leading-none">{user.displayName || 'Authorized User'}</span>
                <span className="text-[8px] font-mono text-gray-600 uppercase mt-0.5">{user.email}</span>
              </div>
              <Button variant="ghost" className="h-8 w-8 px-0" onClick={signOut}>
                <LogOut size={14} className="text-gray-400 hover:text-brand-accent" />
              </Button>
            </div>
          ) : (
            <Button variant="primary" onClick={signInWithGoogle}>
              <LogIn size={14} className="mr-2" />
              Auth Access
            </Button>
          )}
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Materials/Layers */}
        <aside className="w-64 border-r border-brand-border bg-brand-surface flex flex-col hidden lg:flex">
          <div className="p-4 border-b border-brand-border">
            <h3 className="text-[10px] font-mono uppercase text-gray-500 mb-4 flex items-center gap-2">
              <Layers size={12} className="text-brand-accent" />
              Material library
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'OAK_GRAIN', color: '#3e2723', type: 'Wood' },
                { name: 'BRUTAL_CONCRETE', color: '#455a64', type: 'Stone' },
                { name: 'OXIDE_RUST', color: '#bf360c', type: 'Oxide' },
                { name: 'BRUSHED_ALU', color: '#9e9e9e', type: 'Metal' }
              ].map((mat, i) => (
                <div 
                  key={i} 
                  className="group relative aspect-square bg-brand-bg border border-brand-border hover:border-brand-accent cursor-pointer p-1.5 transition-all"
                >
                  <div className="w-full h-full bg-brand-border/10 flex items-center justify-center relative overflow-hidden">
                    <div 
                      className="absolute inset-0 opacity-20" 
                      style={{ backgroundColor: mat.color, mixBlendMode: 'overlay' }}
                    />
                    <div className="w-full h-full" style={{ 
                      backgroundImage: `radial-gradient(${mat.color} 1px, transparent 0)`, 
                      backgroundSize: '4px 4px' 
                    }} />
                    <span className="absolute bottom-1 left-1 text-[7px] bg-black/80 px-1 font-mono text-gray-400 group-hover:text-brand-accent">
                      {mat.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
            <div className="space-y-6">
              <div className="space-y-2">
                <span className="text-[9px] text-gray-600 uppercase font-black tracking-widest">Metadata Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {['Industrial', 'Raw', 'Tectonic', 'Brutalist', 'Organic'].map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 bg-brand-bg border border-brand-border text-[8px] text-gray-400 rounded-none uppercase hover:bg-brand-border cursor-default hover:text-white transition-colors">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-brand-bg/50 border border-brand-border border-dashed space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-gray-400 font-mono italic">Diagnostic Log</span>
                  <span className="text-[8px] text-brand-accent animate-pulse">#0X-BETA</span>
                </div>
                <p className="text-[10px] font-light leading-snug text-gray-500">
                  Select a material overlay to simulate physical displacement and texture mapping on target surface.
                </p>
                <div className="h-0.5 w-full bg-brand-border overflow-hidden">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                    className="w-1/3 h-full bg-brand-accent/50"
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Center Canvas */}
        <section className="flex-1 bg-[#050505] p-4 lg:p-10 flex flex-col relative">
          <div 
            ref={containerRef}
            className="flex-1 border border-brand-border relative flex items-center justify-center overflow-hidden"
            style={{ backgroundImage: 'url(\'data:image/svg+xml,%3Csvg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M0 0h20v20H0V0zm20 20h20v20H20V20z" fill="%23080808"/%3E%3C/svg%3E\')' }}
          >
            {mainImageUrl ? (
               <Stage width={stageSize.width} height={stageSize.height} ref={stageRef}>
                <Layer>
                  <KonvaImage 
                    image={mainImage} 
                    x={stageSize.width / 2}
                    y={stageSize.height / 2}
                    offsetX={mainImage ? mainImage.width / 2 : 0}
                    offsetY={mainImage ? mainImage.height / 2 : 0}
                    scaleX={calculateImageScale()}
                    scaleY={calculateImageScale()}
                    filters={[Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSV]}
                    brightness={brightness}
                    contrast={contrast}
                    saturation={saturation / 100}
                    hue={hue}
                    ref={imageRef}
                  />
                  {textLayers.map((layer) => (
                    <KonvaText
                      key={layer.id}
                      id={layer.id}
                      text={layer.text}
                      x={layer.x}
                      y={layer.y}
                      draggable
                      fontSize={layer.fontSize}
                      fill={layer.fill}
                      fontFamily="Inter"
                      onDragEnd={(e) => {
                        handleTextUpdate(layer.id, { x: e.target.x(), y: e.target.y() });
                      }}
                      onDblClick={() => {
                        const newText = prompt('Enter text:', layer.text);
                        if (newText !== null) handleTextUpdate(layer.id, { text: newText });
                      }}
                    />
                  ))}
                </Layer>
              </Stage>
            ) : (
              <div className="flex flex-col items-center gap-6 group">
                <div className="relative">
                  <div className="absolute inset-0 bg-brand-accent blur-3xl opacity-5 group-hover:opacity-10 transition-opacity" />
                  <div className="relative w-24 h-24 border border-brand-border bg-brand-surface flex items-center justify-center group-hover:border-brand-accent transition-colors">
                    <ImageIcon size={40} className="text-brand-border group-hover:text-brand-accent transition-colors" />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    ref={fileInputRef}
                  />
                  <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                    <Plus size={14} className="mr-2" />
                    Initialize Source Image
                  </Button>
                  <span className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">Supports PNG, JPG, WEBP / MAX 10MB</span>
                </div>
              </div>
            )}

            {/* Viewport UI */}
            <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none">
              <div className="text-[10px] font-mono bg-black/60 p-2 backdrop-blur-md border border-brand-border flex flex-col gap-0.5">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">DIM_W</span>
                  <span className="text-brand-accent">{mainImage?.width || 0}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">DIM_H</span>
                  <span className="text-brand-accent">{mainImage?.height || 0}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">RENDER_SCALE</span>
                  <span className="text-brand-accent">{calculateImageScale().toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-14 mt-4 flex gap-6 items-center px-6 border border-brand-border bg-brand-surface">
            <span className="text-[10px] font-mono text-gray-500 tracking-tighter">TRANSFORM_CONTROL:</span>
            <div className="flex gap-8 flex-1">
              <div className="flex items-center gap-3">
                <span className="text-[8px] font-mono text-gray-600 uppercase">Status</span>
                <span className="px-2 py-0.5 bg-green-950 text-green-500 border border-green-900 text-[8px] font-bold">STABLE</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[8px] font-mono text-gray-600 uppercase">Buffer</span>
                <div className="w-24 h-1 bg-brand-border rounded-full overflow-hidden">
                  <div className="w-[85%] h-full bg-brand-accent opacity-50"></div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" className="h-9" onClick={resetAdjustments}>
                <RotateCcw size={14} className="mr-2" /> Reset
              </Button>
              <Button 
                variant="accent" 
                className="h-9" 
                disabled={!mainImageUrl}
                onClick={handleDownload}
              >
                <Download size={14} className="mr-2" /> Export Render
              </Button>
            </div>
          </div>
        </section>

        {/* Right Sidebar - Adjustments & Filters */}
        <aside className="w-80 border-l border-brand-border bg-brand-surface flex flex-col p-5 space-y-8 z-20">
          <section className="space-y-6">
            <div className="flex gap-1 bg-brand-bg p-1 border border-brand-border">
              <button 
                onClick={() => setActiveTab('adjust')}
                className={cn(
                  "flex-1 py-1.5 text-[9px] font-mono uppercase transition-colors flex items-center justify-center gap-2",
                  activeTab === 'adjust' ? "bg-brand-surface text-brand-accent border border-brand-border" : "text-gray-500 hover:text-brand-text"
                )}
              >
                <Sliders size={11} /> Adjustment
              </button>
              <button 
                onClick={() => setActiveTab('filters')}
                className={cn(
                  "flex-1 py-1.5 text-[9px] font-mono uppercase transition-colors flex items-center justify-center gap-2",
                  activeTab === 'filters' ? "bg-brand-surface text-white border border-brand-border" : "text-gray-500 hover:text-brand-text"
                )}
              >
                <ImageIcon size={11} /> Library
              </button>
              <button 
                onClick={() => setActiveTab('ai')}
                className={cn(
                  "flex-1 py-1.5 text-[9px] font-mono uppercase transition-colors flex items-center justify-center gap-2",
                  activeTab === 'ai' ? "bg-indigo-900/30 text-indigo-400 border border-indigo-600/40" : "text-gray-500 hover:text-brand-text"
                )}
              >
                <Sparkles size={11} /> AI Core
              </button>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'adjust' ? (
                <motion.div 
                  key="adjust"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-2"
                >
                  <Slider label="Brightness" value={brightness} min={-1} max={1} step={0.01} onChange={setBrightness} />
                  <Slider label="Contrast" value={contrast} min={-100} max={100} onChange={setContrast} />
                  <Slider label="Saturation" value={saturation} min={-100} max={100} onChange={setSaturation} />
                  <Slider label="Hue/Tint" value={hue} min={-180} max={180} onChange={setHue} />
                  
                  <div className="pt-6 space-y-4 border-t border-brand-border mt-6">
                    <Button 
                      variant="outline" 
                      className="w-full h-11 border-dashed border-gray-700 hover:border-brand-accent group"
                      onClick={() => addTextLayer()}
                      disabled={!mainImageUrl}
                    >
                      <TypeIcon size={16} className="mr-2 group-hover:text-brand-accent" /> Add Text Layer
                    </Button>

                    <div className="space-y-2">
                       <label className="text-[10px] font-mono text-gray-500 uppercase">Filter Profile ID</label>
                       <input 
                        type="text" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter filter name..."
                        className="w-full bg-brand-bg border border-brand-border p-3 text-xs font-mono text-brand-text focus:border-brand-accent outline-none"
                      />
                    </div>
                    <Button 
                      variant="primary" 
                      className="w-full h-11" 
                      onClick={handleSaveFilter}
                      disabled={!user || !mainImageUrl}
                    >
                      <Save size={16} className="mr-2" /> Commit to Database
                    </Button>
                    {!user && (
                      <p className="text-[9px] text-brand-accent/60 font-mono italic text-center">
                        Auth required to persist configurations.
                      </p>
                    )}
                  </div>
                </motion.div>
              ) : activeTab === 'filters' ? (
                <motion.div 
                  key="filters"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-4 flex-1 flex flex-col min-h-0"
                >
                  <h4 className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Saved Configuration Modules</h4>
                  {savedFilters.length === 0 ? (
                    <div className="flex-1 border border-brand-border border-dashed p-8 flex flex-col items-center justify-center text-center">
                       <ImageIcon size={32} className="text-brand-border mb-3 opacity-20" />
                       <span className="text-[10px] font-mono text-gray-600 uppercase">Zero active modules detected</span>
                    </div>
                  ) : (
                    <div className="space-y-2 overflow-y-auto max-h-[500px] custom-scrollbar pr-2">
                      {savedFilters.map((f) => (
                        <div 
                          key={f.id}
                          onClick={() => applySavedFilter(f)}
                          className="group p-3 bg-brand-bg border border-brand-border hover:border-brand-accent cursor-pointer transition-all flex items-center justify-between"
                        >
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-brand-text uppercase group-hover:text-brand-accent tracking-tight">{f.name}</span>
                            <span className="text-[8px] font-mono text-gray-600">B: {f.brightness.toFixed(1)} | C: {f.contrast} | S: {f.saturation}</span>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (f.id) deleteFilter(f.id).then(loadFilters);
                            }}
                            className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-900/20 text-gray-600 hover:text-red-500 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="ai"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-6 flex-1 flex flex-col min-h-0"
                >
                  <div className="space-y-3">
                    <Button 
                      variant="ai" 
                      className="w-full h-12 relative overflow-hidden group"
                      onClick={handleAIAnalysis}
                      disabled={isAnalyzing || !mainImageUrl}
                    >
                      <Brain size={16} className={cn("mr-2", isAnalyzing && "animate-pulse")} />
                      {isAnalyzing ? 'Processing Vision...' : 'Run Vision Analysis'}
                      {isAnalyzing && (
                        <motion.div 
                          className="absolute bottom-0 left-0 h-0.5 bg-indigo-500"
                          initial={{ width: 0 }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      )}
                    </Button>
                    <p className="text-[8px] font-mono text-gray-600 text-center uppercase tracking-widest">
                      Deep learning object & emotion detection
                    </p>
                  </div>

                  <AnimatePresence>
                    {aiAnalysis && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6 overflow-y-auto custom-scrollbar pr-2"
                      >
                        {/* Objects */}
                        <div className="space-y-2">
                          <h5 className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Layers size={10} /> Detected Entities
                          </h5>
                          <div className="flex flex-wrap gap-2">
                            {aiAnalysis.objects.map((obj, i) => (
                              <div key={i} className="px-2 py-1 bg-indigo-900/20 border border-indigo-900/30 text-[9px] font-mono text-indigo-300">
                                {obj.label} <span className="opacity-50">{(obj.confidence * 100).toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Emotions */}
                        {aiAnalysis.emotions.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-[9px] font-black text-rose-400 uppercase tracking-[0.2em] flex items-center gap-2">
                              <Sparkles size={10} /> Emotion Profile
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {aiAnalysis.emotions.map((emo, i) => (
                                <div key={i} className="px-2 py-1 bg-rose-900/20 border border-rose-900/30 text-[9px] font-mono text-rose-300">
                                  {emo}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Suggested Text */}
                        <div className="space-y-2">
                          <h5 className="text-[9px] font-black text-amber-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <TypeIcon size={10} /> Type Overlays
                          </h5>
                          <div className="space-y-2">
                            {aiAnalysis.suggestedText.map((txt, i) => (
                              <div 
                                key={i} 
                                onClick={() => addTextLayer(txt)}
                                className="p-2 bg-brand-bg border border-brand-border hover:border-amber-500 cursor-pointer text-[10px] font-light leading-tight transition-all"
                              >
                                "{txt}"
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Suggestions */}
                        <div className="space-y-2">
                          <h5 className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Brain size={10} /> Synthesis Strategy
                          </h5>
                          <ul className="space-y-2">
                            {aiAnalysis.suggestions.map((sug, i) => (
                              <li key={i} className="text-[10px] text-gray-500 font-mono leading-relaxed pl-3 border-l border-brand-border">
                                {sug}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <section className="mt-auto border-t border-brand-border pt-6 space-y-4">
            <div className="bg-[#0c0c0c] p-4 border border-brand-border rounded-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:opacity-20">
                <Sliders size={40} />
              </div>
              <div className="text-[9px] text-gray-600 font-black mb-2 flex items-center gap-2">
                <div className="w-1 h-1 bg-brand-accent animate-ping" />
                SYSTEM_HEARTBEAT
              </div>
              <div className="text-[9px] font-mono space-y-1.5">
                <div className="text-gray-500 overflow-hidden whitespace-nowrap overflow-ellipsis">[INFO] Canvas dimension sync: 1024x1024</div>
                <div className="text-gray-500 overflow-hidden whitespace-nowrap overflow-ellipsis">[INFO] Pipeline status: OPTIMIZED</div>
                <div className="text-brand-accent/80 overflow-hidden whitespace-nowrap overflow-ellipsis">[SEC] Auth handshake validated</div>
              </div>
            </div>
            
            <div className="text-[8px] text-gray-600 font-mono text-center uppercase tracking-widest">
              &copy; 2026 Material Lab Internal / Build 82-F
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
