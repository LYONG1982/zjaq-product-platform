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
  isDemo: boolean;
  pilotOrder?: number | null;
  publicationState: 'DRAFT' | 'PUBLISHED' | 'OFFLINE';
  activeReleaseId: string | null;
  lastReleaseId?: string | null;
  publicationVersion: number;
  releaseSequence: number;
  draftVersion: number;
  lastPublishedDraftVersion?: number | null;
  draft: DraftContent;
  internal?: {};
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
  role: 'CONTENT_MANAGER' | 'ADMIN';
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
