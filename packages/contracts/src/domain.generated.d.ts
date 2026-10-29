/* Generated from contracts. Run pnpm generate; do not edit manually. */

/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "PreviewRef".
 */
export type PreviewRef =
  | {
      kind: 'pdf';
      assetId: string;
      pageCount: number;
    }
  | {
      kind: 'images';
      /**
       * @minItems 1
       * @maxItems 200
       */
      pages: {
        assetId: string;
        pageIndex: number;
        alt: string;
      }[];
    }
  | {
      kind: 'video';
      assetId: string;
      mimeType: 'video/mp4' | 'video/quicktime' | 'video/webm';
    };

export interface Domain {
  TextItem: TextItem;
  MediaRef: MediaRef;
  PreviewRef: PreviewRef;
  MaterialRef: MaterialRef;
  DraftContent: DraftContent;
  CreateProduct: CreateProduct;
  SaveDraft: SaveDraft;
  PublishProduct: PublishProduct;
  UnpublishProduct: UnpublishProduct;
  ProductRecord: ProductRecord;
  UploadIntent: UploadIntent;
  UploadComplete: UploadComplete;
  CategoryWrite: CategoryWrite;
  AdminUserWrite: AdminUserWrite;
  Error: Error;
  SiteBannerWrite: SiteBannerWrite;
  SiteContactWrite: SiteContactWrite;
  FeedbackSubmit: FeedbackSubmit;
  AnalyticsSettingsWrite: AnalyticsSettingsWrite;
  AnalyticsViewSubmit: AnalyticsViewSubmit;
  ProductRemoval: ProductRemoval;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "TextItem".
 */
export interface TextItem {
  id: string;
  title: string;
  text: string;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "MediaRef".
 */
export interface MediaRef {
  mediaId: string;
  assetId: string;
  role: 'cover' | 'screenshot' | 'diagram';
  alt: string;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "MaterialRef".
 */
export interface MaterialRef {
  materialId: string;
  versionId: string;
  name: string;
  kind: 'brochure' | 'presentation' | 'technical' | 'other';
  category?: 'promotional' | 'technical';
  subCategory?: 'deck' | 'onepager' | 'video' | 'whitepaper' | 'spec' | 'manual';
  versionLabel: string;
  applicableVersion?: string;
  sourceAssetId?: string | null;
  preview: PreviewRef;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "DraftContent".
 */
export interface DraftContent {
  name: string;
  categoryId: string;
  templateId: 'software' | 'device' | 'delivery' | 'ai';
  templateVersion: number;
  owner: string;
  /**
   * @maxItems 10
   */
  aliases?: string[];
  tagline: string;
  summary: string;
  audiences?: string;
  problemValues: TextItem[];
  features: TextItem[];
  scenarios: TextItem[];
  technical: {
    [k: string]: string;
  };
  boundaries: string;
  media: MediaRef[];
  /**
   * @maxItems 20
   */
  materials: MaterialRef[];
  model?: string;
  productType?: 'SOFTWARE' | 'HARDWARE';
  ownership?: 'SELF_DEVELOPED' | 'PARTNER';
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "CreateProduct".
 */
export interface CreateProduct {
  name: string;
  categoryId: string;
  templateId: 'software' | 'device' | 'delivery' | 'ai';
  templateVersion: number;
  owner: string;
  /**
   * @maxItems 10
   */
  aliases?: string[];
  model: string;
  productType: 'SOFTWARE' | 'HARDWARE';
  ownership: 'SELF_DEVELOPED' | 'PARTNER';
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "SaveDraft".
 */
export interface SaveDraft {
  expectedDraftVersion: number;
  content: DraftContent;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "PublishProduct".
 */
export interface PublishProduct {
  expectedDraftVersion: number;
  expectedPublicationVersion: number;
  publicContentConfirmed: true;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "UnpublishProduct".
 */
export interface UnpublishProduct {
  expectedPublicationVersion: number;
  reason?: string;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ProductRecord".
 */
export interface ProductRecord {
  productId: string;
  publicId?: string;
  isDemo: boolean;
  pilotOrder?: number | null;
  publicationState: 'DRAFT' | 'PUBLISHED' | 'OFFLINE';
  activeReleaseId: string | null;
  lastReleaseId?: string | null;
  publicationVersion: number;
  releaseSequence: number;
  draftVersion: number;
  lastPublishedDraftVersion?: number | null;
  publicMaterialRevocations?: string[];
  draft: DraftContent;
  internal?: {};
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletionReason?: string | null;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "UploadIntent".
 */
export interface UploadIntent {
  productId: string;
  purpose: 'preview' | 'source' | 'media';
  fileName: string;
  contentType: string;
  size: number;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "UploadComplete".
 */
export interface UploadComplete {
  uploadId: string;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "CategoryWrite".
 */
export interface CategoryWrite {
  name: string;
  shortName: string;
  sortOrder: number;
  enabled: boolean;
  defaultTemplateId: string;
  /**
   * @minItems 1
   */
  allowedTemplateIds: string[];
  expectedVersion?: number;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "AdminUserWrite".
 */
export interface AdminUserWrite {
  subjectId: string;
  displayName: string;
  role: 'CONTENT_MANAGER' | 'ADMIN' | 'SALES';
  enabled: boolean;
  expectedVersion?: number;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "Error".
 */
export interface Error {
  error: {
    code: string;
    message: string;
    fieldErrors?: {
      path: string;
      message: string;
    }[];
  };
  requestId: string;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "SiteBannerWrite".
 */
export interface SiteBannerWrite {
  expectedVersion: number;
  imageData: string | null;
  link: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  introduction?: string | null;
  introLink?: string | null;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "SiteContactWrite".
 */
export interface SiteContactWrite {
  expectedVersion: number;
  officialQr: string | null;
  serviceQr: string | null;
  phone: string | null;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "FeedbackSubmit".
 */
export interface FeedbackSubmit {
  content: string;
  contact: string;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "AnalyticsSettingsWrite".
 */
export interface AnalyticsSettingsWrite {
  expectedVersion: number;
  downloadEnabled: boolean;
  viewEnabled: boolean;
  dashboardEnabled: boolean;
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "AnalyticsViewSubmit".
 */
export interface AnalyticsViewSubmit {
  productId: string;
  materialId: string;
  releaseId: string;
  versionId: string;
  viewId: string;
  client: 'H5' | 'WECHAT';
}
/**
 * This interface was referenced by `Domain`'s JSON-Schema
 * via the `definition` "ProductRemoval".
 */
export interface ProductRemoval {
  expectedDraftVersion: number;
  expectedPublicationVersion: number;
  reason: string;
  confirmed: true;
}
