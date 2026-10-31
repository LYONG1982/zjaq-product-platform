/* Generated from contracts. Run pnpm generate; do not edit manually. */

export interface Responses {
  PublicCategory: PublicCategory;
  PublicMedia: PublicMedia;
  PublicMaterial: PublicMaterial;
  PublicProductSummary: PublicProductSummary;
  PublicProduct: PublicProduct;
  CatalogMaterialRow: CatalogMaterialRow;
  PreviewManifest: PreviewManifest;
  AdminIdentity: AdminIdentity;
  SalesIdentity: SalesIdentity;
  AdminDraft: AdminDraft;
  AdminProductRow: AdminProductRow;
  PublishResult: PublishResult;
  UnpublishResult: UnpublishResult;
  UploadResult: UploadResult;
  UploadIntentResult: UploadIntentResult;
  AdminCategory: AdminCategory;
  Template: Template;
  AuditEvent: AuditEvent;
  AdminUser: AdminUser;
  PublicCategoryResponse: PublicCategoryResponse;
  PublicCategoryListResponse: PublicCategoryListResponse;
  PublicMediaResponse: PublicMediaResponse;
  PublicMediaListResponse: PublicMediaListResponse;
  PublicMaterialResponse: PublicMaterialResponse;
  PublicMaterialListResponse: PublicMaterialListResponse;
  PublicProductSummaryResponse: PublicProductSummaryResponse;
  PublicProductSummaryListResponse: PublicProductSummaryListResponse;
  PublicProductResponse: PublicProductResponse;
  PublicProductListResponse: PublicProductListResponse;
  CatalogMaterialRowResponse: CatalogMaterialRowResponse;
  CatalogMaterialRowListResponse: CatalogMaterialRowListResponse;
  PreviewManifestResponse: PreviewManifestResponse;
  PreviewManifestListResponse: PreviewManifestListResponse;
  AdminIdentityResponse: AdminIdentityResponse;
  SalesIdentityResponse: SalesIdentityResponse;
  AdminIdentityListResponse: AdminIdentityListResponse;
  AdminDraftResponse: AdminDraftResponse;
  AdminDraftListResponse: AdminDraftListResponse;
  AdminProductRowResponse: AdminProductRowResponse;
  AdminProductRowListResponse: AdminProductRowListResponse;
  PublishResultResponse: PublishResultResponse;
  PublishResultListResponse: PublishResultListResponse;
  UnpublishResultResponse: UnpublishResultResponse;
  UnpublishResultListResponse: UnpublishResultListResponse;
  UploadResultResponse: UploadResultResponse;
  UploadResultListResponse: UploadResultListResponse;
  UploadIntentResultResponse: UploadIntentResultResponse;
  UploadIntentResultListResponse: UploadIntentResultListResponse;
  AdminCategoryResponse: AdminCategoryResponse;
  AdminCategoryListResponse: AdminCategoryListResponse;
  TemplateResponse: TemplateResponse;
  TemplateListResponse: TemplateListResponse;
  AuditEventResponse: AuditEventResponse;
  AuditEventListResponse: AuditEventListResponse;
  AdminUserResponse: AdminUserResponse;
  AdminUserListResponse: AdminUserListResponse;
  SiteBanner: SiteBanner;
  SiteBannerItem: SiteBannerItem;
  SiteBannerResponse: SiteBannerResponse;
  SiteContact: SiteContact;
  SiteContactResponse: SiteContactResponse;
  FeedbackItem: FeedbackItem;
  FeedbackListResponse: FeedbackListResponse;
  FeedbackReceiptResponse: FeedbackReceiptResponse;
  MaterialVersionListResponse: MaterialVersionListResponse;
  AnalyticsNotice: AnalyticsNotice;
  AnalyticsSettings: AnalyticsSettings;
  AnalyticsEvent: AnalyticsEvent;
  AnalyticsMaterialSummary: AnalyticsMaterialSummary;
  AnalyticsSummary: AnalyticsSummary;
  AnalyticsNoticeResponse: AnalyticsNoticeResponse;
  AnalyticsSettingsResponse: AnalyticsSettingsResponse;
  AnalyticsSummaryResponse: AnalyticsSummaryResponse;
  AnalyticsEventListResponse: AnalyticsEventListResponse;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicCategory".
 */
export interface PublicCategory {
  id: string;
  name: string;
  shortName: string;
  sortOrder: number;
  productCount: number;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicMedia".
 */
export interface PublicMedia {
  mediaId: string;
  role: 'cover' | 'screenshot' | 'diagram';
  alt: string;
  path: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicMaterial".
 */
export interface PublicMaterial {
  materialId: string;
  versionId: string;
  name: string;
  kind: 'brochure' | 'presentation' | 'technical' | 'other';
  versionLabel: string;
  applicableVersion: string | null;
  previewKind: 'pdf' | 'images' | 'video';
  pageCount: number;
  publishedAt: string;
  previewPath: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicProductSummary".
 */
export interface PublicProductSummary {
  productId: string;
  releaseId: string;
  releaseSequence: number;
  publishedAt: string;
  name: string;
  categoryId: string;
  categoryName: string;
  tagline: string;
  coverPath: string | null;
  pilotOrder: number | null;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicProduct".
 */
export interface PublicProduct {
  productId: string;
  releaseId: string;
  releaseSequence: number;
  publishedAt: string;
  name: string;
  category: {
    id: string;
    name: string;
  };
  tagline: string;
  summary: string;
  audiences: string;
  problemValues: TextItem[];
  features: TextItem[];
  scenarios: TextItem[];
  technical: {
    [k: string]: string;
  };
  media: PublicMedia[];
  materials: PublicMaterial[];
  model?: string;
}
export interface TextItem {
  id: string;
  title: string;
  text: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "CatalogMaterialRow".
 */
export interface CatalogMaterialRow {
  productId: string;
  productName: string;
  categoryId: string;
  material: PublicMaterial;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PreviewManifest".
 */
export interface PreviewManifest {
  productId: string;
  materialId: string;
  releaseId: string;
  versionId: string;
  name: string;
  versionLabel: string;
  previewKind: 'pdf' | 'images' | 'video';
  pageCount: number;
  parts: {
    part: string;
    pageIndex: number | null;
    mimeType: string;
    path: string;
  }[];
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminIdentity".
 */
export interface AdminIdentity {
  userId: string;
  subjectId: string;
  displayName: string;
  role: 'CONTENT_MANAGER' | 'ADMIN';
  enabled: boolean;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "SalesIdentity".
 */
export interface SalesIdentity {
  userId: string;
  subjectId: string;
  displayName: string;
  role: 'SALES';
  enabled: boolean;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminDraft".
 */
export interface AdminDraft {
  productId: string;
  draftVersion: number;
  publicationState: 'DRAFT' | 'PUBLISHED' | 'OFFLINE';
  publicationVersion: number;
  releaseSequence: number;
  lastPublishedDraftVersion: number | null;
  hasUnpublishedChanges: boolean;
  content: DraftContent;
  updatedAt: string | null;
  updatedBy: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletionReason?: string | null;
}
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
export interface MediaRef {
  mediaId: string;
  assetId: string;
  role: 'cover' | 'screenshot' | 'diagram';
  alt: string;
}
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
  preview:
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
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminProductRow".
 */
export interface AdminProductRow {
  productId: string;
  name: string;
  publishedName: string | null;
  categoryId: string;
  owner: string;
  publicationState: 'DRAFT' | 'PUBLISHED' | 'OFFLINE';
  publicationVersion: number;
  draftVersion: number;
  hasUnpublishedChanges: boolean;
  updatedAt: string | null;
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletionReason?: string | null;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublishResult".
 */
export interface PublishResult {
  productId: string;
  releaseId: string;
  releaseSequence: number;
  publicationVersion: number;
  publicationState: 'PUBLISHED';
  publishedAt: string;
  publishedBy: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "UnpublishResult".
 */
export interface UnpublishResult {
  productId: string;
  publicationState: 'OFFLINE';
  publicationVersion: number;
  lastReleaseId: string | null;
  unpublishedAt: string | null;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "UploadResult".
 */
export interface UploadResult {
  uploadId: string;
  assetId: string;
  status: 'UPLOADING' | 'CHECKING' | 'READY' | 'REJECTED';
  size: number | null;
  mimeType: string | null;
  checksum: string | null;
  pageCount: number | null;
  error: string | null;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "UploadIntentResult".
 */
export interface UploadIntentResult {
  uploadId: string;
  assetId: string;
  status: 'UPLOADING';
  uploadPath: string;
  uploadMethod: 'PUT';
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminCategory".
 */
export interface AdminCategory {
  id: string;
  name: string;
  shortName: string;
  sortOrder: number;
  enabled: boolean;
  defaultTemplateId: string;
  allowedTemplateIds: string[];
  version: number;
  referenceCount: number;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "Template".
 */
export interface Template {
  id: string;
  name: string;
  version: number;
  description: string;
  enabledForCreate: boolean;
  modules: {
    id: string;
    title: string;
  }[];
  fields: {
    key: string;
    label: string;
    widget: string;
    requiredOnCreate: boolean;
    requiredOnPublish: boolean;
    maxLength: number;
    help: string;
  }[];
  createRequired: string[];
  publishRequired: string[];
  commonFieldLimits: {
    [k: string]: number;
  };
  minimumCounts: {
    [k: string]: number;
  };
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AuditEvent".
 */
export interface AuditEvent {
  eventId: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string;
  draftVersion: number | null;
  publicationVersion: number | null;
  releaseSequence: number | null;
  requestId: string;
  createdAt: string;
  reason?: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminUser".
 */
export interface AdminUser {
  userId: string;
  subjectId: string;
  displayName: string;
  role: 'CONTENT_MANAGER' | 'ADMIN' | 'SALES';
  enabled: boolean;
  version: number;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicCategoryResponse".
 */
export interface PublicCategoryResponse {
  data: PublicCategory;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicCategoryListResponse".
 */
export interface PublicCategoryListResponse {
  data: PublicCategory[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicMediaResponse".
 */
export interface PublicMediaResponse {
  data: PublicMedia;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicMediaListResponse".
 */
export interface PublicMediaListResponse {
  data: PublicMedia[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicMaterialResponse".
 */
export interface PublicMaterialResponse {
  data: PublicMaterial;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicMaterialListResponse".
 */
export interface PublicMaterialListResponse {
  data: PublicMaterial[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicProductSummaryResponse".
 */
export interface PublicProductSummaryResponse {
  data: PublicProductSummary;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicProductSummaryListResponse".
 */
export interface PublicProductSummaryListResponse {
  data: PublicProductSummary[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicProductResponse".
 */
export interface PublicProductResponse {
  data: PublicProduct;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublicProductListResponse".
 */
export interface PublicProductListResponse {
  data: PublicProduct[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "CatalogMaterialRowResponse".
 */
export interface CatalogMaterialRowResponse {
  data: CatalogMaterialRow;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "CatalogMaterialRowListResponse".
 */
export interface CatalogMaterialRowListResponse {
  data: CatalogMaterialRow[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PreviewManifestResponse".
 */
export interface PreviewManifestResponse {
  data: PreviewManifest;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PreviewManifestListResponse".
 */
export interface PreviewManifestListResponse {
  data: PreviewManifest[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminIdentityResponse".
 */
export interface AdminIdentityResponse {
  data: AdminIdentity;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "SalesIdentityResponse".
 */
export interface SalesIdentityResponse {
  data: SalesIdentity;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminIdentityListResponse".
 */
export interface AdminIdentityListResponse {
  data: AdminIdentity[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminDraftResponse".
 */
export interface AdminDraftResponse {
  data: AdminDraft;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminDraftListResponse".
 */
export interface AdminDraftListResponse {
  data: AdminDraft[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminProductRowResponse".
 */
export interface AdminProductRowResponse {
  data: AdminProductRow;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminProductRowListResponse".
 */
export interface AdminProductRowListResponse {
  data: AdminProductRow[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublishResultResponse".
 */
export interface PublishResultResponse {
  data: PublishResult;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "PublishResultListResponse".
 */
export interface PublishResultListResponse {
  data: PublishResult[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "UnpublishResultResponse".
 */
export interface UnpublishResultResponse {
  data: UnpublishResult;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "UnpublishResultListResponse".
 */
export interface UnpublishResultListResponse {
  data: UnpublishResult[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "UploadResultResponse".
 */
export interface UploadResultResponse {
  data: UploadResult;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "UploadResultListResponse".
 */
export interface UploadResultListResponse {
  data: UploadResult[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "UploadIntentResultResponse".
 */
export interface UploadIntentResultResponse {
  data: UploadIntentResult;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "UploadIntentResultListResponse".
 */
export interface UploadIntentResultListResponse {
  data: UploadIntentResult[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminCategoryResponse".
 */
export interface AdminCategoryResponse {
  data: AdminCategory;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminCategoryListResponse".
 */
export interface AdminCategoryListResponse {
  data: AdminCategory[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "TemplateResponse".
 */
export interface TemplateResponse {
  data: Template;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "TemplateListResponse".
 */
export interface TemplateListResponse {
  data: Template[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AuditEventResponse".
 */
export interface AuditEventResponse {
  data: AuditEvent;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AuditEventListResponse".
 */
export interface AuditEventListResponse {
  data: AuditEvent[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminUserResponse".
 */
export interface AdminUserResponse {
  data: AdminUser;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AdminUserListResponse".
 */
export interface AdminUserListResponse {
  data: AdminUser[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "SiteBanner".
 */
export interface SiteBanner {
  version: number;
  /**
   * @minItems 1
   * @maxItems 6
   */
  items: SiteBannerItem[];
  imageData: string | null;
  link: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  introduction?: string | null;
  introLink?: string | null;
  refreshAfterSeconds?: number;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "SiteBannerItem".
 */
export interface SiteBannerItem {
  id: string;
  isDefault: boolean;
  imagePath: string | null;
  imageData: string | null;
  link: string | null;
  startsAt: string | null;
  endsAt: string | null;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "SiteBannerResponse".
 */
export interface SiteBannerResponse {
  data: SiteBanner;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "SiteContact".
 */
export interface SiteContact {
  version: number;
  officialQr: string | null;
  serviceQr: string | null;
  phone: string | null;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "SiteContactResponse".
 */
export interface SiteContactResponse {
  data: SiteContact;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "FeedbackItem".
 */
export interface FeedbackItem {
  feedbackId: string;
  content: string;
  contact: string;
  createdAt: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "FeedbackListResponse".
 */
export interface FeedbackListResponse {
  data: FeedbackItem[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "FeedbackReceiptResponse".
 */
export interface FeedbackReceiptResponse {
  data: {
    accepted: true;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "MaterialVersionListResponse".
 */
export interface MaterialVersionListResponse {
  data: MaterialRef[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AnalyticsNotice".
 */
export interface AnalyticsNotice {
  downloadEnabled: boolean;
  viewEnabled: boolean;
  retentionDays: 90;
  notice: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AnalyticsSettings".
 */
export interface AnalyticsSettings {
  version: number;
  downloadEnabled: boolean;
  viewEnabled: boolean;
  retentionDays: 90;
  notice: string;
  dashboardEnabled: boolean;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AnalyticsEvent".
 */
export interface AnalyticsEvent {
  eventId: string;
  kind: 'DOWNLOAD' | 'VIEW';
  productId: string;
  productName: string;
  materialId: string;
  materialName: string;
  versionId: string;
  versionLabel: string;
  occurredAt: string;
  client: 'SALES_PC' | 'WECHAT' | 'H5';
  sourceIp: string;
  sharer: string | null;
  actorName: string | null;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AnalyticsMaterialSummary".
 */
export interface AnalyticsMaterialSummary {
  productId: string;
  productName: string;
  materialId: string;
  materialName: string;
  downloads: number;
  views: number;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AnalyticsSummary".
 */
export interface AnalyticsSummary {
  retentionDays: 90;
  downloads: number;
  views: number;
  materials: AnalyticsMaterialSummary[];
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AnalyticsNoticeResponse".
 */
export interface AnalyticsNoticeResponse {
  data: AnalyticsNotice;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AnalyticsSettingsResponse".
 */
export interface AnalyticsSettingsResponse {
  data: AnalyticsSettings;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AnalyticsSummaryResponse".
 */
export interface AnalyticsSummaryResponse {
  data: AnalyticsSummary;
  requestId: string;
}
/**
 * This interface was referenced by `Responses`'s JSON-Schema
 * via the `definition` "AnalyticsEventListResponse".
 */
export interface AnalyticsEventListResponse {
  data: AnalyticsEvent[];
  page: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  requestId: string;
}
