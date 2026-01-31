import React, { useState, useEffect, useMemo, useRef } from 'react';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import { 
  PlusIcon, 
  TrashIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon,
  Cog6ToothIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon, 
  XMarkIcon, 
  ArrowsRightLeftIcon, 
  CalculatorIcon, 
  ListBulletIcon,
  ChevronDownIcon,
  CalendarDaysIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  DocumentIcon,
  ArchiveBoxIcon,
  ArrowLeftIcon,
  CodeBracketIcon,
  FolderIcon,
  FolderPlusIcon,
  PencilIcon,
  EllipsisVerticalIcon,
  ChevronRightIcon,
  ChartBarIcon,
  SparklesIcon,
  ClockIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  PhotoIcon,
  CpuChipIcon,
  BoltIcon,
  ScaleIcon,
  Bars3Icon,
  PencilSquareIcon,
  SunIcon,
  MoonIcon,
  BookOpenIcon,
  ArrowDownOnSquareIcon,
  Square3Stack3DIcon,
  FolderArrowDownIcon,
  ArrowPathIcon,
  CameraIcon,
  PlayCircleIcon,
  PauseCircleIcon,
  StopCircleIcon
} from '@heroicons/react/24/outline';
import { BillingRow, ItemType, BillingConfig, ParsingError, SlabSummary, ManifestHistory, ManifestMetadata, Folder } from './types';
import { parseBillingDocument } from './services/geminiService';
import { calculateRow, calculateParcelAmount, evaluateExpression } from './utils/billingLogic';

const DEFAULT_CONFIG: BillingConfig = {
  parcelSlab1Rate: 3,
  parcelSlab2Rate: 2,
  parcelSlab3Rate: 1,
  documentRate: 5,
};

const STORAGE_KEY = 'smart_billing_manifest_history_v2';
const RECYCLE_BIN_KEY = 'smart_billing_recycle_bin_v2';
const FOLDERS_KEY = 'smart_billing_folders_v2';
const GLOBAL_CONFIG_KEY = 'smart_billing_global_config';
const PREFS_KEY = 'smart_billing_user_prefs';
const CHUNK_SESSION_KEY = 'smart_billing_chunk_session';

const themeClasses = {
  light: 'bg-slate-50 text-slate-900',
  dark: 'bg-slate-900 text-slate-50',
  reading: 'bg-[#f8f1e3] text-slate-800'
};

// Expanded overrides for full editing capability
interface ManifestOverride {
  date?: string;
  no?: string;
  pCount?: number;
  PCount?: number;
  dCount?: number;
  pWeight?: number;
  PDetail?: string; // Stores the string like "12+15+30"
}

// Bulk Import Types
interface BulkImportStatus {
  fileName: string;
  status: 'success' | 'error' | 'warning';
  message: string;
}

// Chunk Session Types
interface ChunkSession {
  id: string;
  folderId: string;
  folderName: string;
  aiMode: 'default' | 'hybrid' | 'auto';
  pendingChunks: Array<{ id: string, images: { data: string, mimeType: string }[] }>; 
  currentChunk: { data: string, mimeType: string }[]; 
  totalManifestsCaptured: number;
  processedCount: number;
  isProcessing: boolean;
  statusLog: string;
}

const App: React.FC = () => {
  // Navigation State
  const [view, setView] = useState<'dashboard' | 'billing'>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<'history' | 'final'>('history');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedFinalFolderIds, setSelectedFinalFolderIds] = useState<string[]>([]);
  
  // App History & Folders Data
  const [history, setHistory] = useState<ManifestHistory[]>([]);
  const [recycleBin, setRecycleBin] = useState<ManifestHistory[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  
  // Active Billing State
  const [activeManifestId, setActiveManifestId] = useState<string | null>(null);
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [config, setConfig] = useState<BillingConfig>(DEFAULT_CONFIG);
  const [manifestMeta, setManifestMeta] = useState<ManifestMetadata>({ manifestNo: '', manifestDate: '' });
  
  // Global Settings State
  const [globalConfig, setGlobalConfig] = useState<BillingConfig>(DEFAULT_CONFIG);
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);
  const [appTheme, setAppTheme] = useState<'light' | 'dark' | 'reading'>('light');
  const [appScale, setAppScale] = useState(100);
  
  // Final Bill Edit State
  const [isFinalBillEditing, setIsFinalBillEditing] = useState(false);
  const [finalBillOverrides, setFinalBillOverrides] = useState<Record<string, ManifestOverride>>({});
  const [reportMeta, setReportMeta] = useState({ month: '', agency: '', area: '' });

  // UI State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isFinalExportOpen, setIsFinalExportOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Processing...");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadTab, setUploadTab] = useState<'doc' | 'img' | 'json'>('doc');
  
  // Folder Export UI
  const [isFolderExportOpen, setIsFolderExportOpen] = useState(false);
  
  // Bulk Import UI
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportTab, setBulkImportTab] = useState<'zip' | 'multi'>('zip');
  const [bulkImportFolderId, setBulkImportFolderId] = useState<string>('new');
  const [bulkImportNewFolderName, setBulkImportNewFolderName] = useState('');
  const [bulkImportResults, setBulkImportResults] = useState<BulkImportStatus[]>([]);

  // Recycle Bin UI
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);

  // Chunk/Monthly Session UI
  const [isChunkSessionOpen, setIsChunkSessionOpen] = useState(false);
  const [chunkSession, setChunkSession] = useState<ChunkSession | null>(null);
  const [chunkAiMode, setChunkAiMode] = useState<'default' | 'hybrid' | 'auto'>('default');

  // Processing Mode State (Single File)
  const [processingMode, setProcessingMode] = useState<'default' | 'hybrid'>('default');
  
  const [errors, setErrors] = useState<ParsingError[]>([]);
  const [status, setStatus] = useState<{ type: 'success' | 'info' | 'error', message: string } | null>(null);
  
  // Import Conflict State
  const [importConflict, setImportConflict] = useState<{ existing: ManifestHistory, newCandidate: ManifestHistory } | null>(null);
  
  // Folder UI State
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [manifestToMoveId, setManifestToMoveId] = useState<string | null>(null);

  // Per-column font size state for Modern Report
  const [fontSizes, setFontSizes] = useState({
    date: 14,
    units: 11,
    weight: 10,
    amount: 10
  });
  
  const exportRef = useRef<HTMLDivElement>(null);
  const finalExportRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setIsExportOpen(false);
      }
      if (finalExportRef.current && !finalExportRef.current.contains(event.target as Node)) {
        setIsFinalExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load Data from LocalStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEY);
    const savedRecycleBin = localStorage.getItem(RECYCLE_BIN_KEY);
    const savedFolders = localStorage.getItem(FOLDERS_KEY);
    const savedGlobalConfig = localStorage.getItem(GLOBAL_CONFIG_KEY);
    const savedPrefs = localStorage.getItem(PREFS_KEY);
    const savedChunkSession = localStorage.getItem(CHUNK_SESSION_KEY);

    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error("Failed to load history", e); }
    }
    if (savedRecycleBin) {
      try { setRecycleBin(JSON.parse(savedRecycleBin)); } catch (e) { console.error("Failed to load recycle bin", e); }
    }
    if (savedFolders) {
      try { setFolders(JSON.parse(savedFolders)); } catch (e) { console.error("Failed to load folders", e); }
    }
    if (savedGlobalConfig) {
      try { setGlobalConfig(JSON.parse(savedGlobalConfig)); } catch (e) { console.error("Failed to load global config", e); }
    }
    if (savedPrefs) {
      try {
        const prefs = JSON.parse(savedPrefs);
        if (prefs.theme) setAppTheme(prefs.theme);
        if (prefs.scale) setAppScale(prefs.scale);
      } catch(e) { console.error("Failed to load prefs", e); }
    }
    // Resume Session Logic
    if (savedChunkSession) {
      try {
        const session = JSON.parse(savedChunkSession);
        setChunkSession(session);
        // If we found a session, open the modal immediately
        setIsChunkSessionOpen(true);
      } catch (e) { console.error("Failed to load active chunk session", e); }
    }
  }, []);

  const saveGlobalSettings = (newConfig: BillingConfig, newTheme: string, newScale: number) => {
      setGlobalConfig(newConfig);
      setAppTheme(newTheme as any);
      setAppScale(newScale);
      localStorage.setItem(GLOBAL_CONFIG_KEY, JSON.stringify(newConfig));
      localStorage.setItem(PREFS_KEY, JSON.stringify({ theme: newTheme, scale: newScale }));
  };

  // Recalculate everything when config changes (only when in billing mode)
  useEffect(() => {
    if (view === 'billing') {
      setRows(prevRows => prevRows.map(row => calculateRow(row, config)));
    }
  }, [config, view]);

  const totalAmount = useMemo(() => rows.reduce((sum, row) => sum + row.amount, 0), [rows]);

  // Derived state for active session summary
  const summary = useMemo(() => {
    const s = {
      slab1Weight: 0, slab2Weight: 0, slab3Weight: 0,
      parcelCountS1: 0, parcelCountS2Plus: 0,
      heavyParcelWeightsList: [] as number[],
      lightParcelsTotalWeight: 0, heavyParcelsTotalWeight: 0,
      docCount: 0, docTotal: 0, totalBillableWeight: 0,
      parcelCount: 0
    };
    rows.forEach(row => {
      if (row.type === ItemType.DOCUMENT) { s.docCount++; s.docTotal += row.amount; } 
      else {
        s.parcelCount++;
        const rounded = Math.ceil(row.weight);
        s.totalBillableWeight += rounded;
        const calc = calculateParcelAmount(row.weight, config);
        s.slab1Weight += calc.s1w; s.slab2Weight += calc.s2w; s.slab3Weight += calc.s3w;
        if (rounded <= 10) { s.parcelCountS1++; s.lightParcelsTotalWeight += rounded; } 
        else { s.parcelCountS2Plus++; s.heavyParcelsTotalWeight += rounded; s.heavyParcelWeightsList.push(rounded); }
      }
    });
    return s;
  }, [rows, config]);

  const filteredHistory = useMemo(() => {
    if (currentFolderId) return history.filter(h => h.folderId === currentFolderId);
    return history.filter(h => !h.folderId);
  }, [history, currentFolderId]);

  // Dynamic Page Title Logic
  const pageSubtitle = useMemo(() => {
    if (view === 'billing') return "Active Billing Session";
    if (dashboardTab === 'final') {
      return selectedFinalFolderIds.length > 0 ? "Monthly Consolidated Statement" : "Folder View";
    }
    return "Records Explorer";
  }, [view, dashboardTab, selectedFinalFolderIds]);

  const getFolderBreadcrumb = () => {
    if (!currentFolderId) return null;
    const currentFolder = folders.find(f => f.id === currentFolderId);
    return (
      <div className="flex items-center gap-2 mb-6 no-print overflow-x-auto whitespace-nowrap pb-2">
        <button onClick={() => setCurrentFolderId(null)} className="text-indigo-600 font-bold hover:underline">Root History</button>
        <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="text-gray-900 font-black">{currentFolder?.name || 'Folder'}</span>
      </div>
    );
  };

  // Data Persistence
  const saveHistory = (newHistory: ManifestHistory[]) => {
    setHistory(newHistory);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
  };

  const saveRecycleBin = (newBin: ManifestHistory[]) => {
    setRecycleBin(newBin);
    localStorage.setItem(RECYCLE_BIN_KEY, JSON.stringify(newBin));
  };

  const saveFolders = (newFolders: Folder[]) => {
    setFolders(newFolders);
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(newFolders));
  };

  const saveChunkSession = (sessionOrUpdater: ChunkSession | null | ((prev: ChunkSession | null) => ChunkSession | null)) => {
    setChunkSession(prev => {
        const newSession = typeof sessionOrUpdater === 'function' ? sessionOrUpdater(prev) : sessionOrUpdater;
        if (newSession) {
            localStorage.setItem(CHUNK_SESSION_KEY, JSON.stringify(newSession));
        } else {
            localStorage.removeItem(CHUNK_SESSION_KEY);
        }
        return newSession;
    });
  };

  // Recycle Bin Actions
  const softDeleteManifest = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const manifestToDelete = history.find(h => h.id === id);
    if (!manifestToDelete) return;

    if (confirm("Move this manifest to Recycle Bin?")) {
      const newHistory = history.filter(h => h.id !== id);
      saveHistory(newHistory);
      
      const newBin = [manifestToDelete, ...recycleBin];
      saveRecycleBin(newBin);
      setStatus({ type: 'info', message: 'Moved to Recycle Bin' });
    }
  };

  const restoreManifest = (id: string) => {
    const manifestToRestore = recycleBin.find(h => h.id === id);
    if (!manifestToRestore) return;

    const newBin = recycleBin.filter(h => h.id !== id);
    saveRecycleBin(newBin);

    const newHistory = [manifestToRestore, ...history];
    saveHistory(newHistory);
    setStatus({ type: 'success', message: 'Manifest Restored' });
  };

  const permanentDeleteManifest = (id: string) => {
    if (confirm("Permanently delete this manifest? This cannot be undone.")) {
      const newBin = recycleBin.filter(h => h.id !== id);
      saveRecycleBin(newBin);
    }
  };

  const emptyRecycleBin = () => {
    if (confirm("Empty Recycle Bin? All items will be lost forever.")) {
      saveRecycleBin([]);
    }
  };

  // Folder Actions
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const newFolder: Folder = { id: crypto.randomUUID(), name: newFolderName, createdAt: Date.now() };
    saveFolders([...folders, newFolder]);
    setNewFolderName('');
    setIsCreateFolderOpen(false);
  };

  const handleRenameFolder = (id: string, newName: string) => {
    saveFolders(folders.map(f => f.id === id ? { ...f, name: newName } : f));
    setEditingFolderId(null);
  };

  const handleDeleteFolder = (id: string) => {
    if (confirm("Delete this folder? Manifests inside will be moved to root.")) {
      saveFolders(folders.filter(f => f.id !== id));
      saveHistory(history.map(h => h.folderId === id ? { ...h, folderId: undefined } : h));
      if (currentFolderId === id) setCurrentFolderId(null);
    }
  };

  const handleMoveManifest = (manifestId: string, folderId: string | null) => {
    saveHistory(history.map(h => h.id === manifestId ? { ...h, folderId: folderId || undefined } : h));
    setManifestToMoveId(null);
    setStatus({ type: 'success', message: 'Manifest moved successfully.' });
  };

  // --- FOLDER EXPORT FEATURE ---
  const exportFolderToZip = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    const manifestsToExport = history.filter(h => h.folderId === folderId);
    
    if (manifestsToExport.length === 0) {
      alert("Folder is empty. Nothing to export.");
      return;
    }

    setLoadingMessage("Compressing folder...");
    setIsUploading(true);

    try {
      const zip = new JSZip();
      
      // Add Metadata
      const metadata = {
        folderName: folder.name,
        createdDate: new Date().toLocaleDateString(),
        createdTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        totalManifests: manifestsToExport.length,
        version: "2.0"
      };
      zip.file("folder_info.json", JSON.stringify(metadata, null, 2));

      // Add Manifests
      manifestsToExport.forEach(manifest => {
        // Sanitize filename
        const safeName = manifest.manifestNo.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        zip.file(`${safeName}.json`, JSON.stringify(manifest, null, 2));
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${folder.name}_export.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsFolderExportOpen(false);
      setStatus({ type: 'success', message: 'Folder exported successfully.' });
    } catch (error) {
      console.error("Export failed", error);
      setStatus({ type: 'error', message: 'Export failed.' });
    } finally {
      setIsUploading(false);
    }
  };

  // --- BULK IMPORT HELPERS ---
  const processImportedManifest = (content: any, targetFolderId: string): BulkImportStatus => {
    try {
      if (!content.rows || !Array.isArray(content.rows)) {
        return { fileName: content.manifestNo || 'Unknown', status: 'error', message: 'Invalid format' };
      }

      // Check duplicates
      const exists = history.some(h => h.manifestNo === content.manifestNo);
      if (exists) {
        return { fileName: content.manifestNo, status: 'warning', message: 'Duplicate skipped' };
      }

      // Recalculate to ensure data integrity with current (or imported) config
      const configToUse = content.config || globalConfig;
      const rowsWithCalculations = content.rows.map((r: any) => calculateRow(r, configToUse));
      
      const newManifest: ManifestHistory = {
        id: crypto.randomUUID(),
        manifestNo: content.manifestNo || `IMP-${Date.now()}`,
        manifestDate: content.manifestDate || new Date().toLocaleDateString(),
        rows: rowsWithCalculations,
        config: configToUse,
        totalAmount: rowsWithCalculations.reduce((sum: number, r: any) => sum + r.amount, 0),
        itemCount: rowsWithCalculations.length,
        createdAt: Date.now(),
        folderId: targetFolderId
      };

      setHistory(prev => [newManifest, ...prev]);
      return { fileName: newManifest.manifestNo, status: 'success', message: 'Imported' };

    } catch (e) {
      return { fileName: 'Unknown File', status: 'error', message: 'Parse error' };
    }
  };

  const handleZipImport = async (file: File) => {
    setIsUploading(true);
    setLoadingMessage("Unzipping & Validating...");
    setBulkImportResults([]);

    try {
      const zip = await JSZip.loadAsync(file);
      
      // Check for folder info
      let folderName = file.name.replace('.zip', '');
      const infoFile = zip.file("folder_info.json");
      if (infoFile) {
        const infoText = await infoFile.async("text");
        const info = JSON.parse(infoText);
        if (info.folderName) folderName = info.folderName;
      }

      // Create new folder
      const newFolderId = crypto.randomUUID();
      const newFolder: Folder = { id: newFolderId, name: folderName, createdAt: Date.now() };
      setFolders(prev => [...prev, newFolder]);
      saveFolders([...folders, newFolder]); // Persist immediately

      const results: BulkImportStatus[] = [];
      const files = Object.keys(zip.files).filter(filename => filename.endsWith('.json') && filename !== 'folder_info.json');

      for (const filename of files) {
        const fileData = await zip.file(filename)?.async("text");
        if (fileData) {
          try {
            const json = JSON.parse(fileData);
            const result = processImportedManifest(json, newFolderId);
            results.push(result);
          } catch (e) {
            results.push({ fileName: filename, status: 'error', message: 'JSON Parse Error' });
          }
        }
      }
      
      setBulkImportResults(results);
      saveHistory([...history]); // Trigger persistence of history updates done in processImportedManifest logic (requires refactor to batch update usually, but here react state batching helps)
      // Actually, processImportedManifest calls setHistory multiple times which is bad. 
      // Refactoring to batch update:
      
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', message: 'Failed to read ZIP file.' });
    } finally {
      setIsUploading(false);
    }
  };

  // Refactored Batch Import Logic
  const executeBatchImport = (manifests: ManifestHistory[]) => {
    setHistory(prev => {
        const updated = [...manifests, ...prev];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
    });
  };

  const handleBulkJsonImport = async (files: FileList) => {
    if (files.length > 30) {
      alert("Maximum 30 files allowed at once.");
      return;
    }

    // Determine target folder
    let targetId = bulkImportFolderId;
    if (bulkImportFolderId === 'new') {
      if (!bulkImportNewFolderName.trim()) {
        alert("Please enter a folder name.");
        return;
      }
      targetId = crypto.randomUUID();
      const newFolder = { id: targetId, name: bulkImportNewFolderName, createdAt: Date.now() };
      setFolders(prev => [...prev, newFolder]);
      saveFolders([...folders, newFolder]);
    }

    setLoadingMessage("Processing Bulk Import...");
    setIsUploading(true);
    
    const results: BulkImportStatus[] = [];
    const newManifests: ManifestHistory[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            
            // Check duplicate in existing history AND in current batch
            const exists = history.some(h => h.manifestNo === json.manifestNo) || newManifests.some(h => h.manifestNo === json.manifestNo);
            
            if (exists) {
                results.push({ fileName: file.name, status: 'warning', message: 'Duplicate skipped' });
                continue;
            }

            if (!json.rows) {
                 results.push({ fileName: file.name, status: 'error', message: 'Invalid structure' });
                 continue;
            }

            const configToUse = json.config || globalConfig;
            const rowsWithCalculations = json.rows.map((r: any) => calculateRow(r, configToUse));
            
            newManifests.push({
                id: crypto.randomUUID(),
                manifestNo: json.manifestNo || `IMP-${Date.now()}-${i}`,
                manifestDate: json.manifestDate || new Date().toLocaleDateString(),
                rows: rowsWithCalculations,
                config: configToUse,
                totalAmount: rowsWithCalculations.reduce((sum: number, r: any) => sum + r.amount, 0),
                itemCount: rowsWithCalculations.length,
                createdAt: Date.now(),
                folderId: targetId
            });
            
            results.push({ fileName: file.name, status: 'success', message: 'Imported' });
        } catch (e) {
             results.push({ fileName: file.name, status: 'error', message: 'JSON Parse Error' });
        }
    }
    
    executeBatchImport(newManifests);
    setBulkImportResults(results);
    setIsUploading(false);
  };

  const handleZipImportRefactored = async (file: File) => {
      setIsUploading(true);
      setLoadingMessage("Unzipping...");
      setBulkImportResults([]);

      try {
          const zip = await JSZip.loadAsync(file);
          
          let folderName = file.name.replace(/\.zip$/i, '');
          const infoFile = zip.file("folder_info.json");
          if (infoFile) {
              const infoText = await infoFile.async("text");
              try {
                  const info = JSON.parse(infoText);
                  if (info.folderName) folderName = info.folderName;
              } catch(e) {}
          }

          const newFolderId = crypto.randomUUID();
          const newFolder: Folder = { id: newFolderId, name: folderName, createdAt: Date.now() };
          
          const newManifests: ManifestHistory[] = [];
          const results: BulkImportStatus[] = [];
          
          const files = Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.json') && !name.includes('folder_info'));

          for (const filename of files) {
              const content = await zip.file(filename)?.async("text");
              if (!content) continue;
              try {
                  const json = JSON.parse(content);
                  const exists = history.some(h => h.manifestNo === json.manifestNo) || newManifests.some(h => h.manifestNo === json.manifestNo);
                  if (exists) {
                      results.push({ fileName: filename, status: 'warning', message: 'Duplicate' });
                      continue;
                  }
                  
                  // Process
                  const configToUse = json.config || globalConfig;
                  const rows = (json.rows || []).map((r: any) => calculateRow(r, configToUse));
                  newManifests.push({
                      id: crypto.randomUUID(),
                      manifestNo: json.manifestNo,
                      manifestDate: json.manifestDate,
                      rows: rows,
                      config: configToUse,
                      totalAmount: rows.reduce((s:number, r:any) => s + r.amount, 0),
                      itemCount: rows.length,
                      createdAt: Date.now(),
                      folderId: newFolderId
                  });
                  results.push({ fileName: filename, status: 'success', message: 'Valid' });
              } catch (e) {
                  results.push({ fileName: filename, status: 'error', message: 'Corrupt' });
              }
          }

          if (newManifests.length > 0) {
              setFolders(prev => {
                  const updated = [...prev, newFolder];
                  saveFolders(updated);
                  return updated;
              });
              executeBatchImport(newManifests);
          }
          setBulkImportResults(results);

      } catch (e) {
          alert("Invalid ZIP file");
      } finally {
          setIsUploading(false);
      }
  };


  const addRow = () => {
    const newRowBase: Omit<BillingRow, 'rate' | 'amount' | 'breakdown'> = {
      id: crypto.randomUUID(),
      slNo: rows.length + 1,
      serialNo: '',
      description: '',
      type: ItemType.PARCEL,
      weight: 0,
      isManualRate: false
    };
    const newRow = calculateRow(newRowBase, config);
    setRows([...rows, newRow]);
  };

  const updateRow = (id: string, updates: Partial<BillingRow>) => {
    setRows(prevRows => prevRows.map(row => {
      if (row.id === id) {
        return calculateRow({ ...row, ...updates }, config);
      }
      return row;
    }));
  };

  const deleteRow = (id: string) => {
    setRows(prevRows => {
      const filtered = prevRows.filter(row => row.id !== id);
      return filtered.map((row, index) => ({ ...row, slNo: index + 1 }));
    });
  };

  const applyGlobalType = (type: ItemType) => {
    setRows(prevRows => prevRows.map(row => calculateRow({ ...row, type }, config)));
  };

  const saveManifest = () => {
    const manifestData: ManifestHistory = {
      id: activeManifestId || crypto.randomUUID(),
      manifestNo: manifestMeta.manifestNo,
      manifestDate: manifestMeta.manifestDate,
      rows,
      config,
      totalAmount,
      itemCount: rows.length,
      createdAt: Date.now(),
      folderId: currentFolderId || undefined
    };

    let newHistory;
    if (activeManifestId) {
      newHistory = history.map(h => h.id === activeManifestId ? manifestData : h);
    } else {
      newHistory = [manifestData, ...history];
    }
    
    saveHistory(newHistory);
    setActiveManifestId(manifestData.id);
    setStatus({ type: 'success', message: 'Manifest saved successfully.' });
  };

  const autoSaveManifest = (newRows: BillingRow[], meta: ManifestMetadata, currentConfig: BillingConfig) => {
    const newId = crypto.randomUUID();
    const manifestData: ManifestHistory = {
      id: newId,
      manifestNo: meta.manifestNo,
      manifestDate: meta.manifestDate,
      rows: newRows,
      config: currentConfig,
      totalAmount: newRows.reduce((sum, r) => sum + r.amount, 0),
      itemCount: newRows.length,
      createdAt: Date.now(),
      folderId: currentFolderId || undefined
    };
    const newHistory = [manifestData, ...history];
    saveHistory(newHistory);
    setActiveManifestId(newId);
    return newId;
  };

  const startBlankSession = () => {
    setActiveManifestId(null); setRows([]); setConfig(globalConfig); // Use global config for new sessions
    setManifestMeta({ manifestNo: '', manifestDate: '' }); setView('billing');
  };

  const openManifestFromHistory = (manifest: ManifestHistory) => {
    setActiveManifestId(manifest.id); setRows(manifest.rows); setConfig(manifest.config);
    setManifestMeta({ manifestNo: manifest.manifestNo, manifestDate: manifest.manifestDate }); setView('billing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resolveConflict = (action: 'keep_both' | 'override' | 'discard') => {
    if (!importConflict) return;
    const { existing, newCandidate } = importConflict;

    if (action === 'discard') {
      setStatus({ type: 'info', message: 'Import cancelled by user.' });
    } else if (action === 'keep_both') {
      const candidateToSave = { ...newCandidate, id: crypto.randomUUID() };
      saveHistory([candidateToSave, ...history]);
      setActiveManifestId(candidateToSave.id);
      setRows(candidateToSave.rows);
      setManifestMeta({ manifestNo: candidateToSave.manifestNo, manifestDate: candidateToSave.manifestDate });
      setConfig(candidateToSave.config);
      setView('billing');
      setStatus({ type: 'success', message: 'Imported as a new copy.' });
    } else if (action === 'override') {
      const newHistory = history.filter(h => h.id !== existing.id);
      const candidateToSave = { ...newCandidate, id: crypto.randomUUID() };
      saveHistory([candidateToSave, ...newHistory]);
      setActiveManifestId(candidateToSave.id);
      setRows(candidateToSave.rows);
      setManifestMeta({ manifestNo: candidateToSave.manifestNo, manifestDate: candidateToSave.manifestDate });
      setConfig(candidateToSave.config);
      setView('billing');
      setStatus({ type: 'success', message: 'Existing record overwritten.' });
    }

    setImportConflict(null);
    setIsUploadModalOpen(false);
  };

  // --- Upload Handlers ---

  const handleJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = JSON.parse(e.target?.result as string);
        if (content.rows && Array.isArray(content.rows)) {
          const meta = {
            manifestNo: content.manifestNo || `MF-${Date.now().toString().slice(-6)}`,
            manifestDate: content.manifestDate || new Date().toLocaleDateString()
          };
          const configToUse = content.config || globalConfig; // Prefer file config, else global
          const rowsWithCalculations = content.rows.map((r: any) => calculateRow(r, configToUse));
          
          const newCandidate: ManifestHistory = {
            id: crypto.randomUUID(),
            manifestNo: meta.manifestNo,
            manifestDate: meta.manifestDate,
            rows: rowsWithCalculations,
            config: configToUse,
            totalAmount: rowsWithCalculations.reduce((sum: number, r: any) => sum + r.amount, 0),
            itemCount: rowsWithCalculations.length,
            createdAt: Date.now()
          };

          const existing = history.find(h => h.manifestNo === newCandidate.manifestNo);
          if (existing) {
            setImportConflict({ existing, newCandidate });
            return;
          }

          setRows(rowsWithCalculations);
          setManifestMeta(meta);
          setConfig(configToUse);
          const newId = autoSaveManifest(rowsWithCalculations, meta, configToUse);
          setActiveManifestId(newId);
          setView('billing');
          setStatus({ type: 'success', message: 'JSON Manifest imported and saved to history.' });
          setIsUploadModalOpen(false);
        } else { throw new Error("Invalid structure"); }
      } catch (err) { setStatus({ type: 'error', message: 'Failed to parse JSON manifest.' }); }
    };
    reader.readAsText(file);
  };

  const processFilesWithAI = async (files: File[], instruction: string) => {
    setIsUploading(true);
    setLoadingMessage("Initializing...");
    setStatus({ type: 'info', message: 'Analysis initiated...' });
    setErrors([]);

    try {
      const inputs = await Promise.all(files.map(async (file) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
        });
        return { data: base64, mimeType: file.type };
      }));

      const useHybrid = processingMode === 'hybrid';
      
      const result = await parseBillingDocument(
        inputs, 
        instruction, 
        useHybrid,
        (statusMsg) => setLoadingMessage(statusMsg)
      );
      
      const newRowsRaw = result.items.map((item: any, index: number) => ({
        id: crypto.randomUUID(),
        slNo: item.slNo || (index + 1),
        serialNo: item.serialNo || `AWB-${1000 + index}`,
        description: item.description || 'Processed Item',
        type: item.type === 'Document' ? ItemType.DOCUMENT : ItemType.PARCEL,
        weight: item.weight || 0,
        isManualRate: false
      }));
      // Use GLOBAL CONFIG for new imports
      const calculatedRows = newRowsRaw.map((r: any) => calculateRow(r, globalConfig));
      const meta = {
        manifestNo: result.manifestNo || `MF-${Math.floor(Math.random() * 90000) + 10000}`,
        manifestDate: result.manifestDate || new Date().toLocaleDateString()
      };

      const newCandidate: ManifestHistory = {
        id: crypto.randomUUID(),
        manifestNo: meta.manifestNo,
        manifestDate: meta.manifestDate,
        rows: calculatedRows,
        config: globalConfig,
        totalAmount: calculatedRows.reduce((sum: number, r: any) => sum + r.amount, 0),
        itemCount: calculatedRows.length,
        createdAt: Date.now()
      };

      const existing = history.find(h => h.manifestNo === newCandidate.manifestNo);
      if (existing) {
        setIsUploading(false);
        setImportConflict({ existing, newCandidate });
        return;
      }

      setRows(calculatedRows);
      setManifestMeta(meta);
      setErrors(result.errors || []);
      setConfig(globalConfig);
      const newId = autoSaveManifest(calculatedRows, meta, globalConfig);
      setActiveManifestId(newId);
      setStatus({ type: 'success', message: 'Document parsed successfully.' });
      setIsUploading(false); 
      setView('billing');
      setIsUploadModalOpen(false);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Analysis failed. Please try again or switch processing modes.' });
      setIsUploading(false);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;
    
    if(file.type === 'application/json' || file.name.endsWith('.json')) {
       handleJsonFile(file);
       return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert("File size too large. Please keep under 5MB for optimal AI processing.");
        return;
    }
    setIsUploadModalOpen(false);
    await processFilesWithAI([file], "Extract billing data.");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if(files.length === 0) return;
    if(files.length > 5) {
        alert("Maximum 5 images allowed");
        return;
    }
    setIsUploadModalOpen(false);
    await processFilesWithAI(files, "Extract billing data from these images. Treat them as sequential pages of one manifest.");
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;
    handleJsonFile(file);
  };

  // --- Chunk Session Management ---

  const startChunkSession = () => {
    // Generate new folder info
    const folderName = `Session_${new Date().toLocaleDateString().replace(/\//g,'-')}_${new Date().toLocaleTimeString().replace(/:/g,'-')}`;
    const newFolderId = crypto.randomUUID();
    const newFolder: Folder = { id: newFolderId, name: folderName, createdAt: Date.now() };
    
    // Save new folder
    const updatedFolders = [...folders, newFolder];
    setFolders(updatedFolders);
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(updatedFolders));

    const newSession: ChunkSession = {
      id: crypto.randomUUID(),
      folderId: newFolderId,
      folderName: folderName,
      aiMode: chunkAiMode,
      pendingChunks: [],
      currentChunk: [],
      totalManifestsCaptured: 0,
      processedCount: 0,
      isProcessing: false,
      statusLog: 'Ready to capture.'
    };
    saveChunkSession(newSession);
  };

  const handleChunkCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!chunkSession || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    
    // Convert to base64
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });

    const newImage = { data: base64, mimeType: file.type };
    const updatedChunk = [...chunkSession.currentChunk, newImage];
    
    // Auto-close chunk if 5 images reached
    if (updatedChunk.length >= 5) {
      finishCurrentChunk(updatedChunk);
    } else {
      saveChunkSession({ ...chunkSession, currentChunk: updatedChunk, statusLog: `Page ${updatedChunk.length} captured.` });
    }
  };

  const finishCurrentChunk = (overrideChunk?: {data:string, mimeType:string}[]) => {
    if (!chunkSession) return;
    const chunkToSave = overrideChunk || chunkSession.currentChunk;
    if (chunkToSave.length === 0) return;

    const newPending = [...chunkSession.pendingChunks, { id: crypto.randomUUID(), images: chunkToSave }];
    saveChunkSession({
      ...chunkSession,
      pendingChunks: newPending,
      currentChunk: [],
      totalManifestsCaptured: chunkSession.totalManifestsCaptured + 1,
      statusLog: 'Manifest captured. Ready for next.'
    });
  };

  const processChunkQueue = async () => {
    if (!chunkSession || chunkSession.pendingChunks.length === 0) return;
    
    saveChunkSession((prev) => prev ? ({ ...prev, isProcessing: true, statusLog: 'Starting batch processing...' }) : null);

    // We process the first one in the queue
    const chunkToProcess = chunkSession.pendingChunks[0];
    
    try {
      const useHybrid = chunkSession.aiMode === 'hybrid';
      const useAuto = chunkSession.aiMode === 'auto';
      
      let result;
      let usedMode = useHybrid ? 'Hybrid' : 'Default';

      // AUTO LOGIC: Try Default, Fallback to Hybrid
      if (useAuto) {
         try {
            saveChunkSession(prev => prev ? ({ ...prev, statusLog: `Processing Manifest ${prev.processedCount + 1}... (Default Mode)` }) : null);
            result = await parseBillingDocument(chunkToProcess.images, "Extract billing data.", false);
         } catch (e) {
            saveChunkSession(prev => prev ? ({ ...prev, statusLog: `Default failed. Retrying with Hybrid Mode...` }) : null);
            usedMode = 'Hybrid (Auto-Fallback)';
            result = await parseBillingDocument(chunkToProcess.images, "Extract billing data.", true);
         }
      } else {
         saveChunkSession(prev => prev ? ({ ...prev, statusLog: `Processing Manifest ${prev.processedCount + 1}... (${usedMode})` }) : null);
         result = await parseBillingDocument(chunkToProcess.images, "Extract billing data.", useHybrid);
      }

      // Success - Save to History
      const calculatedRows = (result.items || []).map((item: any, index: number) => 
        calculateRow({
          id: crypto.randomUUID(),
          slNo: item.slNo || (index + 1),
          serialNo: item.serialNo || `AWB-${1000 + index}`,
          description: item.description || 'Item',
          type: item.type === 'Document' ? ItemType.DOCUMENT : ItemType.PARCEL,
          weight: item.weight || 0,
          isManualRate: false
        }, globalConfig)
      );

      const newManifest: ManifestHistory = {
        id: crypto.randomUUID(),
        manifestNo: result.manifestNo || `AUTO-${Date.now()}`,
        manifestDate: result.manifestDate || new Date().toLocaleDateString(),
        rows: calculatedRows,
        config: globalConfig,
        totalAmount: calculatedRows.reduce((sum: number, r: any) => sum + r.amount, 0),
        itemCount: calculatedRows.length,
        createdAt: Date.now(),
        folderId: chunkSession.folderId
      };

      // Atomic Update: Remove from pending, add to history, update session
      setHistory(prev => {
        const updated = [newManifest, ...prev];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });

      // Update Session State (Remove processed chunk)
      saveChunkSession(prev => {
        if (!prev) return null;
        const remainingChunks = prev.pendingChunks.slice(1);
        return {
           ...prev,
           pendingChunks: remainingChunks,
           processedCount: prev.processedCount + 1,
           statusLog: `Manifest ${newManifest.manifestNo} processed successfully.`
        };
      });
      
      // Need to re-read session state for recursion or use a ref. 
      // For simplicity in this fix, we rely on the state update triggering re-render, 
      // but to continue processing we need to call recursively.
      // Since we just updated state, we can't easily access the NEW state immediately here for recursion check.
      // We can check the variable we derived.
      
      const remainingChunksLength = chunkSession.pendingChunks.length - 1;
      if (remainingChunksLength > 0) {
        // Allow UI update breath
        setTimeout(() => processChunkQueue(), 500); 
      } else {
        saveChunkSession(prev => prev ? ({ ...prev, isProcessing: false, statusLog: 'All captured manifests processed.' }) : null);
      }

    } catch (e) {
      console.error("Chunk processing failed", e);
      saveChunkSession(prev => prev ? ({ ...prev, isProcessing: false, statusLog: 'Processing paused due to error. Resume when ready.' }) : null);
    }
  };

  const closeChunkSession = () => {
    if (chunkSession?.pendingChunks.length && chunkSession.pendingChunks.length > 0) {
      if(!confirm("There are unprocessed manifests in the queue. Closing will pause the session. You can resume later from the dashboard.")) return;
    }
    setIsChunkSessionOpen(false);
    // We keep the session in LS to resume later unless explicitly cleared, but for now we assume 'Close' just hides UI
  };

  const renderChunkSession = () => {
    if (!chunkSession) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/90 backdrop-blur-xl p-4 animate-in fade-in">
           <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
              <div className="h-20 w-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto">
                 <BoltIcon className="h-10 w-10 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900">Monthly Capture Mode</h2>
                <p className="text-gray-500 text-sm mt-2 font-medium">Auto-chunk manifests and process sequentially.</p>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-xl text-left border border-gray-100">
                 <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">AI Processing Strategy</label>
                 <div className="space-y-2">
                    <label className="flex items-center p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-indigo-300 transition-all">
                       <input type="radio" name="aiMode" checked={chunkAiMode === 'default'} onChange={() => setChunkAiMode('default')} className="text-indigo-600 focus:ring-indigo-500" />
                       <div className="ml-3">
                          <span className="block text-sm font-bold text-gray-900">Default (Fast)</span>
                          <span className="block text-[10px] text-gray-400">Best for clear documents</span>
                       </div>
                    </label>
                    <label className="flex items-center p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-indigo-300 transition-all">
                       <input type="radio" name="aiMode" checked={chunkAiMode === 'hybrid'} onChange={() => setChunkAiMode('hybrid')} className="text-indigo-600 focus:ring-indigo-500" />
                       <div className="ml-3">
                          <span className="block text-sm font-bold text-gray-900">Hybrid (Accurate)</span>
                          <span className="block text-[10px] text-gray-400">Slower, better for bad lighting</span>
                       </div>
                    </label>
                    <label className="flex items-center p-3 bg-white rounded-lg border border-indigo-200 bg-indigo-50/50 cursor-pointer hover:border-indigo-400 transition-all">
                       <input type="radio" name="aiMode" checked={chunkAiMode === 'auto'} onChange={() => setChunkAiMode('auto')} className="text-indigo-600 focus:ring-indigo-500" />
                       <div className="ml-3">
                          <span className="block text-sm font-black text-indigo-900">Auto (Smart Retry)</span>
                          <span className="block text-[10px] text-indigo-400">Try Fast, fallback to Hybrid if failed</span>
                       </div>
                    </label>
                 </div>
              </div>

              <div className="flex gap-3">
                 <button onClick={() => setIsChunkSessionOpen(false)} className="flex-1 py-3 font-bold text-gray-400 hover:text-gray-600">Cancel</button>
                 <button onClick={startChunkSession} className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 shadow-xl shadow-indigo-200">Start Session</button>
              </div>
           </div>
        </div>
      )
    }

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white animate-in slide-in-from-bottom-10">
         {/* Top Bar */}
         <div className="p-4 flex justify-between items-center bg-gray-800/50 backdrop-blur border-b border-gray-700">
            <div>
               <h3 className="font-black text-lg flex items-center gap-2"><FolderIcon className="h-5 w-5 text-indigo-400"/> {chunkSession.folderName}</h3>
               <p className="text-xs text-gray-400 font-mono">Processed: {chunkSession.processedCount} | Pending: {chunkSession.pendingChunks.length}</p>
            </div>
            <button onClick={closeChunkSession} className="p-2 bg-gray-700 rounded-full hover:bg-gray-600"><XMarkIcon className="h-6 w-6" /></button>
         </div>

         {/* Main Capture Area */}
         <div className="flex-1 relative flex flex-col items-center justify-center p-6">
            {!chunkSession.isProcessing ? (
               <div className="w-full max-w-md flex flex-col items-center">
                  <div className="relative w-full aspect-[3/4] bg-gray-800 rounded-3xl border-2 border-dashed border-gray-600 flex flex-col items-center justify-center overflow-hidden mb-6 group hover:border-indigo-500 transition-colors">
                     <input type="file" capture="environment" accept="image/*" onChange={handleChunkCapture} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />
                     <CameraIcon className="h-16 w-16 text-gray-500 mb-4 group-hover:text-indigo-400 transition-colors" />
                     <span className="font-bold text-gray-400 group-hover:text-white">Tap to Capture Page</span>
                     <span className="text-xs text-gray-600 mt-2">Current Manifest: Page {chunkSession.currentChunk.length + 1}/5</span>
                  </div>

                  {/* Thumbnail Strip */}
                  {chunkSession.currentChunk.length > 0 && (
                     <div className="flex gap-2 mb-6 overflow-x-auto w-full p-2 bg-gray-800/50 rounded-xl">
                        {chunkSession.currentChunk.map((img, i) => (
                           <img key={i} src={`data:${img.mimeType};base64,${img.data}`} className="h-16 w-16 object-cover rounded-lg border border-gray-600" />
                        ))}
                     </div>
                  )}

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-4 w-full">
                     {chunkSession.currentChunk.length > 0 ? (
                        <button onClick={() => finishCurrentChunk()} className="col-span-2 py-4 bg-indigo-600 font-black rounded-2xl shadow-lg shadow-indigo-900/50 hover:bg-indigo-500 flex items-center justify-center gap-2">
                           <DocumentDuplicateIcon className="h-6 w-6"/> Next Manifest
                        </button>
                     ) : (
                        <div className="col-span-2 text-center text-sm text-gray-500 font-bold py-4">Capture at least one page</div>
                     )}
                     
                     {chunkSession.pendingChunks.length > 0 && (
                        <button onClick={processChunkQueue} className="col-span-2 py-4 bg-emerald-600 font-black rounded-2xl shadow-lg shadow-emerald-900/50 hover:bg-emerald-500 flex items-center justify-center gap-2 animate-pulse">
                           <PlayCircleIcon className="h-6 w-6"/> Process Queue ({chunkSession.pendingChunks.length})
                        </button>
                     )}
                  </div>
               </div>
            ) : (
               // Processing State Overlay
               <div className="text-center max-w-md w-full">
                  <div className="relative h-48 w-48 mx-auto mb-8">
                     <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
                     <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
                     <div className="absolute inset-0 flex items-center justify-center font-black text-4xl">{chunkSession.pendingChunks.length}</div>
                  </div>
                  <h2 className="text-2xl font-black mb-2">Processing Manifests...</h2>
                  <p className="text-indigo-400 font-mono text-sm mb-8">{chunkSession.statusLog}</p>
                  
                  <div className="bg-gray-800 rounded-xl p-4 text-left border border-gray-700 mb-8">
                     <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                        <span>Queue Progress</span>
                        <span>{Math.round((chunkSession.processedCount / (chunkSession.processedCount + chunkSession.pendingChunks.length)) * 100) || 0}%</span>
                     </div>
                     <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${(chunkSession.processedCount / (chunkSession.processedCount + chunkSession.pendingChunks.length)) * 100}%` }}></div>
                     </div>
                  </div>

                  <button onClick={() => saveChunkSession({...chunkSession, isProcessing: false, statusLog: 'Paused by user.'})} className="px-8 py-3 border border-red-500 text-red-400 font-bold rounded-xl hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2 mx-auto">
                     <PauseCircleIcon className="h-5 w-5"/> Pause Processing
                  </button>
               </div>
            )}
         </div>
      </div>
    );
  };

  const handleExportExcel = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Sl No,AWB No,Description,Type,Weight,Rate,Amount\n"
      + rows.map(row => `${row.slNo},${row.serialNo},"${row.description}",${row.type},${row.weight},${row.rate},${row.amount}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${manifestMeta.manifestNo || "manifest"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ 
      manifestNo: manifestMeta.manifestNo, 
      manifestDate: manifestMeta.manifestDate, 
      rows, 
      config 
    }, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `${manifestMeta.manifestNo || "manifest"}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    doc.text(`Manifest: ${manifestMeta.manifestNo}`, 14, 10);
    doc.text(`Date: ${manifestMeta.manifestDate}`, 14, 16);
    
    autoTable(doc, {
      startY: 20,
      head: [['Sl', 'AWB', 'Desc', 'Type', 'Weight', 'Rate', 'Amount']],
      body: rows.map(r => [r.slNo, r.serialNo, r.description, r.type, r.weight, r.rate, r.amount]),
    });
    doc.save(`${manifestMeta.manifestNo || "manifest"}.pdf`);
  };

  const renderBillingEditor = () => (
    <div className="flex flex-col h-full space-y-4 p-4 md:p-6">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
         <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <div>
               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Manifest No</label>
               <input className="font-black text-lg text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 w-full md:w-48" value={manifestMeta.manifestNo} onChange={(e) => setManifestMeta({...manifestMeta, manifestNo: e.target.value})} placeholder="MF-..." />
            </div>
            <div>
               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Date</label>
               <input type="date" className="font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2" value={manifestMeta.manifestDate} onChange={(e) => setManifestMeta({...manifestMeta, manifestDate: e.target.value})} />
            </div>
         </div>
         <div className="flex gap-2">
            <button onClick={() => setIsConfigOpen(true)} className="p-3 rounded-xl bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100"><ScaleIcon className="h-5 w-5"/></button>
            <button onClick={saveManifest} className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 shadow-lg shadow-indigo-200">Save Manifest</button>
         </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex-1">
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
               <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                     <th className="p-4 font-black w-16">#</th>
                     <th className="p-4 font-black">AWB / Serial</th>
                     <th className="p-4 font-black">Description</th>
                     <th className="p-4 font-black">Type</th>
                     <th className="p-4 font-black text-right">Weight</th>
                     <th className="p-4 font-black text-right">Rate</th>
                     <th className="p-4 font-black text-right">Amount</th>
                     <th className="p-4 font-black w-10"></th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {rows.map((row, idx) => (
                     <tr key={row.id} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="p-4 font-bold text-gray-400">{idx + 1}</td>
                        <td className="p-4"><input className="w-full bg-transparent font-bold text-gray-900 outline-none" value={row.serialNo} onChange={(e) => updateRow(row.id, { serialNo: e.target.value })} /></td>
                        <td className="p-4"><input className="w-full bg-transparent font-medium text-gray-600 outline-none" value={row.description} onChange={(e) => updateRow(row.id, { description: e.target.value })} /></td>
                        <td className="p-4">
                           <button onClick={() => updateRow(row.id, { type: row.type === ItemType.PARCEL ? ItemType.DOCUMENT : ItemType.PARCEL })} className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wide ${row.type === ItemType.PARCEL ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{row.type}</button>
                        </td>
                        <td className="p-4"><input type="number" className="w-full bg-transparent text-right font-mono font-bold text-gray-700 outline-none" value={row.weight} onChange={(e) => updateRow(row.id, { weight: parseFloat(e.target.value) || 0 })} /></td>
                        <td className="p-4 text-right font-mono text-gray-400 text-xs">{row.breakdown}</td>
                        <td className="p-4 text-right font-mono font-black text-gray-900">₹{row.amount.toFixed(2)}</td>
                        <td className="p-4"><button onClick={() => deleteRow(row.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><TrashIcon className="h-4 w-4"/></button></td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
         <button onClick={addRow} className="w-full py-3 text-center text-xs font-bold text-gray-400 hover:text-indigo-600 hover:bg-gray-50 transition-colors">+ Add Line Item</button>
      </div>
      
      <div className="bg-gray-900 text-white p-6 rounded-2xl flex justify-between items-center shadow-xl">
         <div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-widest">Total Payable</div>
            <div className="text-3xl font-black tracking-tight mt-1">₹{totalAmount.toLocaleString()}</div>
         </div>
         <div className="text-right">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-widest">{rows.length} Items</div>
            <div className="text-sm font-bold text-gray-300 mt-1">{summary.parcelCount} Parcels • {summary.docCount} Docs</div>
         </div>
      </div>
    </div>
  );

  const renderBillingHistorySection = () => (
    <div className="space-y-6">
       {getFolderBreadcrumb()}
       
       <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <button onClick={() => { setIsUploadModalOpen(true); }} className="aspect-square rounded-2xl border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center text-indigo-400 hover:bg-indigo-50/50 hover:border-indigo-400 transition-all group">
             <div className="bg-indigo-50 w-12 h-12 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"><PlusIcon className="h-6 w-6 text-indigo-600"/></div>
             <span className="font-bold text-xs uppercase tracking-wide">Import</span>
          </button>
          
          <button onClick={() => { startBlankSession(); }} className="aspect-square rounded-2xl border-2 border-dashed border-emerald-200 flex flex-col items-center justify-center text-emerald-400 hover:bg-emerald-50/50 hover:border-emerald-400 transition-all group">
             <div className="bg-emerald-50 w-12 h-12 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"><PencilSquareIcon className="h-6 w-6 text-emerald-600"/></div>
             <span className="font-bold text-xs uppercase tracking-wide">New Blank</span>
          </button>
          
          {!currentFolderId && (
            <button onClick={() => { setIsCreateFolderOpen(true); }} className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 hover:border-gray-400 transition-all group">
              <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"><FolderPlusIcon className="h-6 w-6 text-gray-500"/></div>
              <span className="font-bold text-xs uppercase tracking-wide">New Folder</span>
            </button>
          )}

          {!currentFolderId && folders.map(folder => (
            <div key={folder.id} onClick={() => setCurrentFolderId(folder.id)} className="aspect-square rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-lg transition-all p-4 flex flex-col justify-between cursor-pointer group relative">
               <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id); setNewFolderName(folder.name); setIsCreateFolderOpen(true); }} className="p-1 hover:bg-gray-100 rounded"><PencilIcon className="h-3 w-3 text-gray-400"/></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }} className="p-1 hover:bg-red-50 rounded"><TrashIcon className="h-3 w-3 text-red-400"/></button>
               </div>
               <FolderIcon className="h-10 w-10 text-indigo-300 group-hover:text-indigo-500 transition-colors" />
               <div>
                  <div className="font-bold text-gray-900 truncate">{folder.name}</div>
                  <div className="text-[10px] text-gray-400 font-medium">{history.filter(h => h.folderId === folder.id).length} Items</div>
               </div>
            </div>
          ))}
       </div>

       <div className="space-y-2">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Manifests ({filteredHistory.length})</h3>
          {filteredHistory.map(item => (
             <div key={item.id} onClick={() => openManifestFromHistory(item)} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer flex items-center justify-between group">
                <div className="flex items-center gap-4">
                   <div className="h-10 w-10 bg-indigo-50 rounded-lg flex items-center justify-center font-bold text-indigo-600 text-xs">
                      {item.itemCount}
                   </div>
                   <div>
                      <div className="font-bold text-gray-900">{item.manifestNo}</div>
                      <div className="text-xs text-gray-500">{item.manifestDate} • ₹{item.totalAmount.toLocaleString()}</div>
                   </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onClick={(e) => softDeleteManifest(e, item.id)} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg"><TrashIcon className="h-5 w-5"/></button>
                   <button onClick={(e) => { e.stopPropagation(); setManifestToMoveId(item.id); }} className="p-2 hover:bg-gray-100 text-gray-400 hover:text-gray-900 rounded-lg"><FolderArrowDownIcon className="h-5 w-5"/></button>
                </div>
             </div>
          ))}
          {filteredHistory.length === 0 && (
             <div className="text-center py-10 text-gray-400 text-sm font-medium bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                No manifests found in this location.
             </div>
          )}
       </div>

       {/* Move Manifest Modal */}
       {manifestToMoveId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4" onClick={() => setManifestToMoveId(null)}>
             <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-lg mb-4">Move to Folder</h3>
                <div className="space-y-2">
                   <button onClick={() => handleMoveManifest(manifestToMoveId, null)} className="w-full text-left p-3 hover:bg-gray-50 rounded-lg font-medium text-sm flex items-center gap-2"><FolderIcon className="h-4 w-4 text-gray-400"/> Root (No Folder)</button>
                   {folders.map(f => (
                      <button key={f.id} onClick={() => handleMoveManifest(manifestToMoveId, f.id)} className="w-full text-left p-3 hover:bg-gray-50 rounded-lg font-medium text-sm flex items-center gap-2"><FolderIcon className="h-4 w-4 text-indigo-400"/> {f.name}</button>
                   ))}
                </div>
             </div>
          </div>
       )}
    </div>
  );

  const renderFinalBillingSection = () => (
    <div className="p-4 md:p-6 text-center text-gray-400">
      <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm max-w-lg mx-auto">
         <SparklesIcon className="h-12 w-12 text-indigo-200 mx-auto mb-4" />
         <h3 className="text-lg font-black text-gray-900 mb-2">Monthly Consolidation</h3>
         <p className="text-sm">Select folders in the History tab to generate a consolidated final bill report.</p>
         <button onClick={() => setDashboardTab('history')} className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">Go to Explorer</button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen flex flex-col font-inter transition-colors duration-300 ${themeClasses[appTheme]}`} style={{ fontSize: `${appScale}%` }}>
      <nav className="sticky top-0 z-40 px-4 md:px-8 py-3 md:py-4 flex flex-col md:flex-row justify-between items-center shadow-sm backdrop-blur-xl bg-white/90 border-b border-gray-100 transition-all no-print">
        <div className="flex w-full md:w-auto justify-between items-center mb-3 md:mb-0">
            <div className="flex items-center space-x-4 cursor-pointer group" onClick={() => { setView('dashboard'); setCurrentFolderId(null); setSelectedFinalFolderIds([]); }}>
               <div className="bg-indigo-600 p-2 md:p-2.5 rounded-xl md:rounded-2xl shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform"><CalculatorIcon className="h-6 w-6 md:h-7 md:w-7 text-white" /></div>
               <div><h1 className="text-xl md:text-2xl font-black text-indigo-950 leading-none tracking-tight">SmartBilling</h1><p className="text-[9px] md:text-[10px] text-gray-400 font-black uppercase tracking-[3px] md:tracking-[4px] mt-1 italic">{pageSubtitle}</p></div>
            </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            {view === 'dashboard' && (
               <div className="flex items-center bg-gray-100/50 rounded-xl md:rounded-[2rem] p-1 border border-gray-200 w-full md:w-auto">
                  <button onClick={() => setDashboardTab('history')} className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg md:rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${dashboardTab === 'history' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-100' : 'text-gray-400 hover:text-indigo-600'}`}>Explorer</button>
                  <button onClick={() => setDashboardTab('final')} className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-lg md:rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${dashboardTab === 'final' ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-100' : 'text-gray-400 hover:text-indigo-600'}`}>Final Bill</button>
               </div>
            )}
            
            <div className="flex items-center justify-end space-x-3 w-full md:w-auto">
              {view === 'billing' ? (
                <div className="relative" ref={exportRef}>
                  <button onClick={() => setIsExportOpen(!isExportOpen)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 md:px-6 py-2.5 rounded-xl md:rounded-[1.5rem] font-black text-xs md:text-sm flex items-center transition-all shadow-lg shadow-indigo-100 active:scale-95"><ArrowDownTrayIcon className="h-4 w-4 mr-2" />Export</button>
                  {isExportOpen && (<div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2"><button onClick={handleExportExcel} className="w-full px-5 py-3 text-left text-xs font-black text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center transition-colors"><DocumentTextIcon className="h-4 w-4 mr-3 text-emerald-400" />Excel (CSV)</button><button onClick={handleExportJson} className="w-full px-5 py-3 text-left text-xs font-black text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center transition-colors"><CodeBracketIcon className="h-4 w-4 mr-3 text-indigo-400" />JSON</button><button onClick={handleExportPdf} className="w-full px-5 py-3 text-left text-xs font-black text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center transition-colors"><DocumentIcon className="h-4 w-4 mr-3 text-red-400" />PDF</button></div>)}
                </div>
              ) : (
                  <div className="flex items-center gap-2">
                      <button onClick={() => setIsChunkSessionOpen(true)} className="p-3 bg-yellow-400 hover:bg-yellow-500 text-white rounded-full shadow-lg shadow-yellow-200 transition-all hover:scale-110 active:scale-95 group relative" title="Monthly Capture Mode">
                          <BoltIcon className="h-5 w-5 animate-pulse" />
                      </button>
                      <button onClick={() => setIsRecycleBinOpen(true)} className="relative p-3 bg-white border-2 border-gray-100 text-gray-400 hover:text-red-500 hover:border-red-100 rounded-full shadow-sm transition-all active:scale-95" title="Recycle Bin">
                          <TrashIcon className="h-5 w-5" />
                          {recycleBin.length > 0 && <span className="absolute top-0 right-0 h-3 w-3 bg-red-500 rounded-full border-2 border-white"></span>}
                      </button>
                      <button onClick={() => setIsGlobalSettingsOpen(true)} className="p-3 bg-white border-2 border-gray-100 text-gray-400 hover:text-indigo-600 hover:border-indigo-100 rounded-full shadow-sm transition-all hover:rotate-90 active:scale-95" title="App Settings">
                          <Cog6ToothIcon className="h-5 w-5" />
                      </button>
                  </div>
              )}
            </div>
        </div>
      </nav>
      <main className="flex-1 flex flex-col pb-20 w-full max-w-7xl mx-auto">
         {view === 'billing' ? renderBillingEditor() : (<div className="flex-1 w-full">{dashboardTab === 'history' ? <div className="p-4 md:p-6">{renderBillingHistorySection()}</div> : renderFinalBillingSection()}</div>)}
      </main>

      {/* Global Settings Modal */}
      {isGlobalSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300 no-print">
             <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 transform transition-all">
                <div className="px-8 py-6 bg-gradient-to-r from-slate-800 to-slate-900 flex justify-between items-center text-white">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">App Settings</h2>
                      <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mt-1">Preferences & Defaults</p>
                   </div>
                   <button onClick={() => setIsGlobalSettingsOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="p-8 space-y-8 bg-slate-50 max-h-[70vh] overflow-y-auto">
                   
                   {/* Processing Status Section */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-900 border-b border-slate-200 pb-2">
                         <CpuChipIcon className="h-5 w-5 text-blue-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Processing Status</span>
                      </div>

                      {chunkSession ? (
                          <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                              <div className="flex justify-between items-start">
                                  <div>
                                      <h4 className="font-bold text-gray-900 text-sm">{chunkSession.folderName}</h4>
                                      <div className="flex items-center gap-2 mt-1">
                                          <div className={`h-2 w-2 rounded-full ${chunkSession.isProcessing ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></div>
                                          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                                              {chunkSession.isProcessing ? 'Processing AI...' : 'Paused'}
                                          </span>
                                      </div>
                                  </div>
                                  {!chunkSession.isProcessing && chunkSession.pendingChunks.length > 0 && (
                                      <button 
                                          onClick={() => { setIsGlobalSettingsOpen(false); setIsChunkSessionOpen(true); }} 
                                          className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                                      >
                                          Resume
                                      </button>
                                  )}
                              </div>

                              {/* Progress Bar */}
                              <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] font-bold text-gray-400">
                                      <span>Progress</span>
                                      <span>{Math.round((chunkSession.processedCount / (chunkSession.processedCount + chunkSession.pendingChunks.length || 1)) * 100)}%</span>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div 
                                          className={`h-full transition-all duration-500 ${chunkSession.isProcessing ? 'bg-indigo-500 animate-pulse' : 'bg-gray-400'}`} 
                                          style={{ width: `${(chunkSession.processedCount / (chunkSession.processedCount + chunkSession.pendingChunks.length || 1)) * 100}%` }}
                                      ></div>
                                  </div>
                              </div>

                              {/* Stats Grid */}
                              <div className="grid grid-cols-3 gap-2 pt-2">
                                  <div className="bg-gray-50 p-2 rounded-lg text-center border border-gray-100">
                                      <div className="text-lg font-black text-emerald-600">{chunkSession.processedCount}</div>
                                      <div className="text-[9px] text-gray-400 uppercase font-bold">Completed</div>
                                  </div>
                                  <div className="bg-gray-50 p-2 rounded-lg text-center border border-gray-100">
                                      <div className="text-lg font-black text-amber-600">{chunkSession.pendingChunks.length}</div>
                                      <div className="text-[9px] text-gray-400 uppercase font-bold">Pending</div>
                                  </div>
                                  <div className="bg-gray-50 p-2 rounded-lg text-center border border-gray-100">
                                      <div className="text-lg font-black text-gray-900">{chunkSession.processedCount + chunkSession.pendingChunks.length}</div>
                                      <div className="text-[9px] text-gray-400 uppercase font-bold">Total</div>
                                  </div>
                              </div>

                              <div className="text-xs font-medium text-gray-600 bg-slate-100 p-3 rounded-lg border border-slate-200 font-mono">
                                  <span className="font-bold text-gray-400 uppercase text-[9px] mr-2 select-none">Log:</span>
                                  {chunkSession.statusLog}
                              </div>
                          </div>
                      ) : (
                          <div className="p-6 bg-gray-50 rounded-2xl text-center border border-dashed border-gray-200">
                              <p className="text-gray-400 text-xs font-bold">No active capture session found.</p>
                          </div>
                      )}
                   </div>

                   {/* Appearance Section */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-900 border-b border-slate-200 pb-2">
                         <SparklesIcon className="h-5 w-5 text-indigo-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Appearance</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                          <button onClick={() => setAppTheme('light')} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${appTheme === 'light' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-400 hover:border-indigo-200'}`}>
                              <SunIcon className="h-6 w-6" />
                              <span className="text-[10px] font-bold uppercase">Light</span>
                          </button>
                          <button onClick={() => setAppTheme('dark')} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${appTheme === 'dark' ? 'border-indigo-500 bg-slate-800 text-white' : 'border-gray-200 bg-white text-gray-400 hover:border-indigo-200'}`}>
                              <MoonIcon className="h-6 w-6" />
                              <span className="text-[10px] font-bold uppercase">Dark</span>
                          </button>
                          <button onClick={() => setAppTheme('reading')} className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${appTheme === 'reading' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-400 hover:border-indigo-200'}`}>
                              <BookOpenIcon className="h-6 w-6" />
                              <span className="text-[10px] font-bold uppercase">Reading</span>
                          </button>
                      </div>

                      <div>
                          <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold text-gray-500 uppercase">Text Size</span>
                              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{appScale}%</span>
                          </div>
                          <input type="range" min="75" max="125" step="5" value={appScale} onChange={(e) => setAppScale(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                          <div className="flex justify-between text-[10px] text-gray-400 font-bold mt-1"><span>A-</span><span>A+</span></div>
                      </div>
                   </div>

                   {/* Pricing Engine Section (Reused Logic) */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-900 border-b border-slate-200 pb-2">
                         <ScaleIcon className="h-5 w-5 text-emerald-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Default Slab Rates</span>
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium">These rates will apply to all new imports automatically.</p>
                      
                      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 1 (0-10kg)</label>
                               <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={globalConfig.parcelSlab1Rate} onChange={(e) => setGlobalConfig({ ...globalConfig, parcelSlab1Rate: parseFloat(e.target.value) || 0 })} /></div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 2 (10-100kg)</label>
                               <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={globalConfig.parcelSlab2Rate} onChange={(e) => setGlobalConfig({ ...globalConfig, parcelSlab2Rate: parseFloat(e.target.value) || 0 })} /></div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 3 (>100kg)</label>
                               <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500/20 outline-none" value={globalConfig.parcelSlab3Rate} onChange={(e) => setGlobalConfig({ ...globalConfig, parcelSlab3Rate: parseFloat(e.target.value) || 0 })} /></div>
                            </div>
                            <div className="col-span-2 pt-2 border-t border-gray-100 mt-2">
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Document Flat Rate</label>
                               <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span><input type="number" className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500/20 outline-none" value={globalConfig.documentRate} onChange={(e) => setGlobalConfig({ ...globalConfig, documentRate: parseFloat(e.target.value) || 0 })} /></div>
                            </div>
                         </div>
                      </div>
                   </div>
                   
                   <button onClick={() => { saveGlobalSettings(globalConfig, appTheme, appScale); setIsGlobalSettingsOpen(false); }} className="w-full py-4 bg-slate-900 text-white font-black rounded-xl hover:bg-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2">
                      <CheckCircleIcon className="h-5 w-5 text-emerald-400" />
                      Save Preferences
                   </button>
                </div>
             </div>
          </div>
      )}

      {/* Recycle Bin Modal */}
      {isRecycleBinOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
             <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[85vh]">
                <div className="px-8 py-6 bg-gray-900 flex justify-between items-center text-white sticky top-0 z-10">
                   <div className="flex items-center gap-3">
                      <TrashIcon className="h-6 w-6 text-red-400" />
                      <div>
                         <h2 className="text-xl font-black tracking-tight">Recycle Bin</h2>
                         <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mt-1">{recycleBin.length} Deleted Items</p>
                      </div>
                   </div>
                   <div className="flex gap-2">
                      {recycleBin.length > 0 && <button onClick={emptyRecycleBin} className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-xs font-bold transition-all">Empty Bin</button>}
                      <button onClick={() => setIsRecycleBinOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                   </div>
                </div>
                
                <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
                   {recycleBin.length === 0 ? (
                      <div className="text-center py-20">
                         <TrashIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                         <h3 className="text-lg font-black text-gray-400">Bin is Empty</h3>
                      </div>
                   ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {recycleBin.map(item => (
                            <div key={item.id} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between">
                               <div>
                                  <div className="flex justify-between items-start mb-2">
                                     <h4 className="font-black text-gray-900">{item.manifestNo}</h4>
                                     <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded font-bold">{item.manifestDate}</span>
                                  </div>
                                  <div className="text-xs text-gray-500 mb-4">
                                     {item.itemCount} Items • ₹{item.totalAmount.toLocaleString()}
                                  </div>
                               </div>
                               <div className="flex gap-2 pt-4 border-t border-gray-100">
                                  <button onClick={() => restoreManifest(item.id)} className="flex-1 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-black hover:bg-indigo-100 transition-all flex items-center justify-center gap-1"><ArrowPathIcon className="h-3 w-3"/> Restore</button>
                                  <button onClick={() => permanentDeleteManifest(item.id)} className="flex-1 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-black hover:bg-red-100 transition-all">Delete Forever</button>
                               </div>
                            </div>
                         ))}
                      </div>
                   )}
                </div>
             </div>
          </div>
      )}

      {/* Monthly Capture Mode Modal (Chunk Session) */}
      {isChunkSessionOpen && renderChunkSession()}

      {/* Folder Export Modal */}
      {isFolderExportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
             <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 transform transition-all">
                <div className="px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-600 flex justify-between items-center text-white">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">Export Folder</h2>
                      <p className="text-indigo-100 text-xs font-medium uppercase tracking-widest mt-1">Create Backup Package (ZIP)</p>
                   </div>
                   <button onClick={() => setIsFolderExportOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="p-8 space-y-6 bg-slate-50 max-h-[70vh] overflow-y-auto">
                   <p className="text-sm text-gray-500 font-medium">Select a folder to export all its manifests as a single ZIP file.</p>
                   
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {folders.map(folder => {
                          const count = history.filter(h => h.folderId === folder.id).length;
                          return (
                              <button 
                                  key={folder.id} 
                                  onClick={() => exportFolderToZip(folder.id)}
                                  className="group flex flex-col p-4 bg-white border border-gray-200 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all text-left"
                              >
                                  <div className="flex items-center justify-between mb-2">
                                      <FolderIcon className="h-6 w-6 text-indigo-300 group-hover:text-indigo-600" />
                                      <span className="text-[10px] font-black bg-gray-100 text-gray-500 px-2 py-1 rounded-full">{count} Items</span>
                                  </div>
                                  <span className="font-bold text-gray-900 group-hover:text-indigo-900 truncate w-full">{folder.name}</span>
                              </button>
                          )
                      })}
                   </div>
                   {folders.length === 0 && <div className="text-center py-8 text-gray-400 font-bold text-sm">No folders available to export.</div>}
                </div>
             </div>
          </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
             <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 transform transition-all flex flex-col max-h-[90vh]">
                <div className="px-8 py-6 bg-gradient-to-r from-emerald-600 to-teal-600 flex justify-between items-center text-white flex-shrink-0">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">Bulk Import</h2>
                      <p className="text-emerald-100 text-xs font-medium uppercase tracking-widest mt-1">Multiple Files & Folders</p>
                   </div>
                   <button onClick={() => {setIsBulkImportOpen(false); setBulkImportResults([]);}} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="flex border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <button onClick={() => setBulkImportTab('zip')} className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-all ${bulkImportTab === 'zip' ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
                        Folder Import (ZIP)
                    </button>
                    <button onClick={() => setBulkImportTab('multi')} className={`flex-1 py-4 text-sm font-black uppercase tracking-wider transition-all ${bulkImportTab === 'multi' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30' : 'text-gray-400 hover:text-gray-600'}`}>
                        Import Multiple (JSON)
                    </button>
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-white">
                    {bulkImportTab === 'zip' ? (
                        <div className="space-y-6">
                            <div className="border-2 border-dashed border-emerald-100 rounded-2xl p-10 text-center hover:bg-emerald-50/20 transition-all relative group">
                                <input type="file" accept=".zip" onChange={(e) => e.target.files?.[0] && handleZipImportRefactored(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                                    <ArchiveBoxIcon className="h-8 w-8 text-emerald-600" />
                                </div>
                                <h3 className="text-lg font-black text-gray-900 mb-1">Upload ZIP Archive</h3>
                                <p className="text-xs text-gray-400 font-medium">Restores an entire folder with original metadata</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Target Folder</label>
                                <select 
                                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500/20 mb-3"
                                    value={bulkImportFolderId}
                                    onChange={(e) => setBulkImportFolderId(e.target.value)}
                                >
                                    <option value="new">+ Create New Folder</option>
                                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                                {bulkImportFolderId === 'new' && (
                                    <input 
                                        type="text" 
                                        placeholder="Enter Folder Name..." 
                                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        value={bulkImportNewFolderName}
                                        onChange={(e) => setBulkImportNewFolderName(e.target.value)}
                                    />
                                )}
                            </div>

                            <div className="border-2 border-dashed border-indigo-100 rounded-2xl p-8 text-center hover:bg-indigo-50/20 transition-all relative group">
                                <input type="file" accept=".json" multiple onChange={(e) => e.target.files && handleBulkJsonImport(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="bg-indigo-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <DocumentDuplicateIcon className="h-6 w-6 text-indigo-600" />
                                </div>
                                <h3 className="text-base font-black text-gray-900">Select JSON Files</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Max 30 Files</p>
                            </div>
                        </div>
                    )}

                    {/* Import Results List */}
                    {bulkImportResults.length > 0 && (
                        <div className="mt-8">
                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-2">Import Results ({bulkImportResults.length})</h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                {bulkImportResults.map((res, idx) => (
                                    <div key={idx} className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium border ${res.status === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : res.status === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-100' : 'bg-red-50 text-red-800 border-red-100'}`}>
                                        <div className="truncate flex-1 mr-2">{res.fileName}</div>
                                        <div className="font-bold uppercase tracking-wider text-[10px]">{res.message}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
             </div>
          </div>
      )}

      {/* Local Config Modal (For Active Manifest) - Existing */}
      {isConfigOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300 no-print">
             <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 transform transition-all">
                {/* Header */}
                <div className="px-8 py-6 bg-gradient-to-r from-indigo-600 to-indigo-700 flex justify-between items-center text-white">
                   <div>
                      <h2 className="text-xl font-black tracking-tight">Active Rates</h2>
                      <p className="text-indigo-200 text-xs font-medium uppercase tracking-widest mt-1">For this manifest only</p>
                   </div>
                   <button onClick={() => setIsConfigOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                
                <div className="p-8 space-y-6 bg-slate-50">
                   {/* Parcel Section */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-indigo-900 mb-2">
                         <ScaleIcon className="h-5 w-5 text-indigo-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Parcel Slabs</span>
                      </div>
                      
                      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 1 (0-10kg)</label>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                  <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" value={config.parcelSlab1Rate} onChange={(e) => setConfig({ ...config, parcelSlab1Rate: parseFloat(e.target.value) || 0 })} />
                               </div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 2 (10-100kg)</label>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                  <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" value={config.parcelSlab2Rate} onChange={(e) => setConfig({ ...config, parcelSlab2Rate: parseFloat(e.target.value) || 0 })} />
                               </div>
                            </div>
                            <div>
                               <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Slab 3 (>100kg)</label>
                               <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                                  <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none" value={config.parcelSlab3Rate} onChange={(e) => setConfig({ ...config, parcelSlab3Rate: parseFloat(e.target.value) || 0 })} />
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>

                   {/* Document Section */}
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-indigo-900 mb-2">
                         <DocumentTextIcon className="h-5 w-5 text-emerald-500" />
                         <span className="font-black text-sm uppercase tracking-wider">Documents</span>
                      </div>
                      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Flat Rate</label>
                           <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                              <input type="number" className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-black text-gray-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none" value={config.documentRate} onChange={(e) => setConfig({ ...config, documentRate: parseFloat(e.target.value) || 0 })} />
                           </div>
                      </div>
                   </div>
                   
                   <button onClick={() => setIsConfigOpen(false)} className="w-full py-4 bg-indigo-900 text-white font-black rounded-xl hover:bg-black transition-all shadow-xl shadow-indigo-200 active:scale-95 flex items-center justify-center gap-2">
                      <CheckCircleIcon className="h-5 w-5 text-indigo-400" />
                      Save Configuration
                   </button>
                </div>
             </div>
          </div>
      )}
      
      {/* Import Conflict Modal */}
      {importConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl max-w-3xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[85vh] overflow-y-auto">
             <div className="px-6 md:px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 sticky top-0 z-10 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><ExclamationTriangleIcon className="h-6 w-6"/></div>
                  <div><h2 className="text-lg md:text-xl font-black text-gray-900">Duplicate Manifest Found</h2><p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase tracking-widest">Manifest <span className="text-indigo-600">{importConflict.newCandidate.manifestNo}</span> exists.</p></div>
                </div>
                <button onClick={() => resolveConflict('discard')} className="p-2 bg-white rounded-xl shadow-sm text-gray-400 hover:text-gray-900 transition-all"><XMarkIcon className="h-5 w-5" /></button>
             </div>
             
             <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* Existing Record */}
                <div className="bg-gray-50 p-6 rounded-2xl md:rounded-3xl border border-gray-200">
                   <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Existing Record</div>
                   <div className="space-y-4">
                      <div><div className="text-xs text-gray-500 font-medium">Manifest Date</div><div className="text-lg font-black text-gray-900">{importConflict.existing.manifestDate}</div></div>
                      <div className="flex justify-between">
                         <div><div className="text-xs text-gray-500 font-medium">Total Items</div><div className="text-lg font-black text-gray-900">{importConflict.existing.itemCount}</div></div>
                         <div className="text-right">
                            <div className="text-xs text-gray-500 font-medium">Total Amount</div>
                            <div className="text-xl font-black text-indigo-600">₹{importConflict.existing.totalAmount.toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="text-xs text-gray-400 font-medium pt-2 border-t border-gray-200">Created: {new Date(importConflict.existing.createdAt).toLocaleString()}</div>
                   </div>
                </div>

                {/* New Import */}
                <div className="bg-indigo-50 p-6 rounded-2xl md:rounded-3xl border border-indigo-200 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10"><BoltIcon className="h-24 w-24 text-indigo-600"/></div>
                   <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4 relative z-10">New Import</div>
                   <div className="space-y-4 relative z-10">
                      <div><div className="text-xs text-indigo-400 font-medium">Manifest Date</div><div className="text-lg font-black text-indigo-900">{importConflict.newCandidate.manifestDate}</div></div>
                      <div className="flex justify-between">
                         <div><div className="text-xs text-indigo-400 font-medium">Total Items</div><div className="text-lg font-black text-indigo-900">{importConflict.newCandidate.itemCount}</div></div>
                         <div className="text-right">
                            <div className="text-xs text-indigo-400 font-medium">Total Amount</div>
                            <div className="text-xl font-black text-indigo-700">₹{importConflict.newCandidate.totalAmount.toLocaleString()}</div>
                         </div>
                      </div>
                      <div className="text-xs text-indigo-400/60 font-medium pt-2 border-t border-indigo-200">Source: File Import</div>
                   </div>
                </div>
             </div>

             <div className="bg-gray-50 px-6 md:px-8 py-6 flex flex-col md:flex-row gap-4 sticky bottom-0 z-10 border-t border-gray-100">
                <button onClick={() => resolveConflict('keep_both')} className="flex-1 py-3 md:py-4 bg-white border-2 border-indigo-100 text-indigo-600 rounded-xl md:rounded-2xl font-black text-sm hover:bg-indigo-50 hover:border-indigo-200 transition-all flex items-center justify-center gap-2 shadow-sm"><DocumentDuplicateIcon className="h-5 w-5"/> Keep Both</button>
                <button onClick={() => resolveConflict('override')} className="flex-1 py-3 md:py-4 bg-indigo-600 text-white rounded-xl md:rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"><ScaleIcon className="h-5 w-5"/> Override</button>
                <button onClick={() => resolveConflict('discard')} className="px-6 py-4 text-gray-400 font-black text-sm hover:text-red-500 transition-colors">Discard</button>
             </div>
          </div>
        </div>
      )}

      {isUploading && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-indigo-950/90 backdrop-blur-2xl animate-in fade-in duration-500 no-print">
            <div className="relative text-center p-4">
                <div className="mx-auto h-24 w-24 md:h-32 md:w-32 bg-indigo-600 rounded-[3rem] md:rounded-[3.5rem] animate-bounce shadow-[0_0_80px_rgba(79,70,229,0.5)] flex items-center justify-center mb-8 md:mb-12">
                   <CalculatorIcon className="h-12 w-12 md:h-16 md:w-16 text-white" />
                </div>
                <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-4">Neural Data Extraction</h2>
                <div className="flex flex-col items-center space-y-2">
                   <p className="text-indigo-300 font-bold uppercase tracking-widest text-xs animate-pulse text-center">{loadingMessage}</p>
                   {processingMode === 'hybrid' && (
                       <div className="flex items-center gap-2 mt-2 px-4 py-1 bg-white/10 rounded-full">
                           <BoltIcon className="h-3 w-3 text-yellow-400" />
                           <span className="text-[10px] text-white font-black uppercase">Hybrid Mode Active</span>
                       </div>
                   )}
                </div>
            </div>
          </div>
      )}
      {(isCreateFolderOpen || editingFolderId) && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300"><div className="bg-white rounded-2xl md:rounded-[3rem] shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 p-8 md:p-12"><h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2">{editingFolderId ? 'Rename Folder' : 'New Folder'}</h2><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-8">Organize your billing history</p><input autoFocus className="w-full px-6 py-4 md:px-8 md:py-5 bg-gray-50 border border-gray-200 rounded-xl md:rounded-[2rem] font-black text-lg md:text-xl mb-8 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" placeholder="Folder Name..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (editingFolderId ? handleRenameFolder(editingFolderId, newFolderName) : handleCreateFolder())} /><div className="flex gap-4"><button onClick={() => { setIsCreateFolderOpen(false); setEditingFolderId(null); setNewFolderName(''); }} className="flex-1 py-3 md:py-4 font-black text-gray-400 bg-gray-50 rounded-xl md:rounded-[2rem] hover:bg-gray-100 transition-all">Cancel</button><button onClick={() => editingFolderId ? handleRenameFolder(editingFolderId, newFolderName) : handleCreateFolder()} className="flex-1 py-3 md:py-4 font-black text-white bg-indigo-600 rounded-xl md:rounded-[2rem] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200">{editingFolderId ? 'Update' : 'Create'}</button></div></div></div>)}
      {/* Upload Modal */}
      {isUploadModalOpen && !importConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
             <div className="px-6 md:px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div><h2 className="text-xl md:text-2xl font-black text-gray-900">Import Data</h2><p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Select import method</p></div>
                <button onClick={() => setIsUploadModalOpen(false)} className="p-2 bg-white rounded-xl shadow-sm text-gray-400 hover:text-gray-900 transition-all"><XMarkIcon className="h-5 w-5" /></button>
             </div>
             
             {/* AI Mode Selector */}
             {(uploadTab === 'doc' || uploadTab === 'img') && (
                <div className="px-6 md:px-8 pt-6">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 block ml-1">AI Processing Model</span>
                    <div className="flex flex-col sm:flex-row gap-3 bg-gray-50 p-1 rounded-2xl">
                        <button 
                            onClick={() => setProcessingMode('default')}
                            className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-xl transition-all ${processingMode === 'default' ? 'bg-white shadow-md text-indigo-600 ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <CpuChipIcon className="h-5 w-5" />
                            <div className="text-left">
                                <div className="text-xs font-black uppercase">Default AI</div>
                                <div className="text-[9px] font-bold opacity-60">Fast • Balanced</div>
                            </div>
                        </button>
                        <button 
                             onClick={() => setProcessingMode('hybrid')}
                             className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-xl transition-all ${processingMode === 'hybrid' ? 'bg-indigo-600 shadow-md text-white' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <BoltIcon className="h-5 w-5" />
                            <div className="text-left">
                                <div className="text-xs font-black uppercase">Hybrid AI</div>
                                <div className="text-[9px] font-bold opacity-80">High Accuracy • Fallback</div>
                            </div>
                        </button>
                    </div>
                    {processingMode === 'hybrid' && <p className="text-[10px] text-gray-400 font-medium mt-3 px-2">Hybrid mode prioritizes column accuracy (Sl No, AWB, Weight) using advanced models and automatically falls back to standard models if limits are reached.</p>}
                </div>
             )}

             <div className="flex flex-col sm:flex-row p-2 bg-gray-50/50 gap-2 px-6 md:px-8 mt-6">
                <button onClick={() => setUploadTab('doc')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${uploadTab === 'doc' ? 'bg-white text-indigo-600 shadow-md ring-1 ring-gray-100' : 'text-gray-400 hover:bg-gray-100'}`}>Document (PDF)</button>
                <button onClick={() => setUploadTab('img')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${uploadTab === 'img' ? 'bg-white text-indigo-600 shadow-md ring-1 ring-gray-100' : 'text-gray-400 hover:bg-gray-100'}`}>Images</button>
                <button onClick={() => setUploadTab('json')} className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${uploadTab === 'json' ? 'bg-white text-emerald-600 shadow-md ring-1 ring-gray-100' : 'text-gray-400 hover:bg-gray-100'}`}>JSON Backup</button>
             </div>

             <div className="p-6 md:p-8 overflow-y-auto">
                {uploadTab === 'doc' && (
                   <div className="space-y-6">
                      <div className="border-2 border-dashed border-gray-200 rounded-3xl p-8 text-center hover:bg-indigo-50/30 transition-colors relative">
                         <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".pdf,.xlsx,.xls,.doc,.docx" onChange={(e) => handleDocUpload(e)} />
                         <DocumentTextIcon className="h-12 w-12 text-indigo-200 mx-auto mb-4" />
                         <p className="text-indigo-900 font-bold">Click to select PDF, Excel, or Word</p>
                         <p className="text-xs text-indigo-400 mt-2">Max 5 Pages / 5MB</p>
                      </div>
                   </div>
                )}

                {uploadTab === 'img' && (
                   <div className="space-y-6">
                       <div className="border-2 border-dashed border-gray-200 rounded-3xl p-8 text-center hover:bg-indigo-50/30 transition-colors relative">
                         <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" multiple onChange={(e) => handleImageUpload(e)} />
                         <div className="flex justify-center -space-x-4 mb-4">
                            {[1,2,3].map(i => <div key={i} className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center"><PhotoIcon className="h-5 w-5 md:h-6 md:w-6 text-indigo-300" /></div>)}
                         </div>
                         <p className="text-indigo-900 font-bold">Select Images (Max 5)</p>
                         <p className="text-xs text-indigo-400 mt-2">JPG, PNG, WebP supported</p>
                      </div>
                   </div>
                )}

                {uploadTab === 'json' && (
                    <div className="space-y-6">
                       <div className="border-2 border-dashed border-emerald-100 rounded-3xl p-8 text-center hover:bg-emerald-50/30 transition-colors relative">
                         <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept=".json" onChange={(e) => handleJsonUpload(e)} />
                         <CodeBracketIcon className="h-12 w-12 text-emerald-200 mx-auto mb-4" />
                         <p className="text-emerald-900 font-bold">Select JSON Backup File</p>
                         <p className="text-xs text-emerald-400 mt-2">Direct restore, no AI processing</p>
                      </div>
                    </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;