export enum ItemType {
  PARCEL = 'Parcel',
  DOCUMENT = 'Document'
}

export interface BillingRow {
  id: string;
  slNo: number;      // Table sequence index
  serialNo: string;  // Maps to AWB No, Doc No, etc.
  description: string;
  type: ItemType;
  weight: number;
  rate: number; 
  isManualRate: boolean;
  amount: number;    // calculated
  breakdown: string; // "10kg @ 3 + 5kg @ 2"
}

export interface BillingConfig {
  parcelSlab1Rate: number; // <= 10kg
  parcelSlab2Rate: number; // 10-100kg
  parcelSlab3Rate: number; // > 100kg
  documentRate: number; // Flat rate for documents
}

export interface ParsingError {
  type: 'missing' | 'duplicate' | 'invalid';
  message: string;
  rowId?: string;
}

export interface SlabSummary {
  slab1Weight: number;
  slab2Weight: number;
  slab3Weight: number;
  parcelCount: number;
  parcelCountS1: number;      // Count of parcels <= 10kg
  parcelCountS2Plus: number;  // Count of parcels > 10kg
  docCount: number;
  docTotal: number;
  heavyParcelWeightsList: number[]; // Weights for p > 10kg
  lightParcelsTotalWeight: number;  // Combined weight for p <= 10kg
}

export interface ManifestMetadata {
  manifestNo: string;
  manifestDate: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface ManifestHistory extends ManifestMetadata {
  id: string;
  rows: BillingRow[];
  config: BillingConfig;
  totalAmount: number;
  itemCount: number;
  createdAt: number;
  folderId?: string; // Optional reference to a folder
}