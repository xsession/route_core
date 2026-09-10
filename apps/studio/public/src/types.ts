import type {
  ComponentNode,
  DrawingElement,
  EditorDocument,
  HitResult,
  Point,
  SelectionState,
  ViewportState,
} from '../vendor/editor-core/index.js';

export type ViewKind = 'layout' | 'schematic' | string;

export interface ApplicationInfo {
  name: string;
  version: string;
  offline: boolean;
  networkPolicy: string;
  projectFormat: string;
}

export interface ProjectMeta {
  project_uuid: string;
  name: string;
  description: string;
  organization: string;
  status: string;
  defaultLengthUnit: string;
  defaultWireUnit: string;
  createdAt: string;
  modifiedAt: string;
  formatSemver: string;
  applicationVersion: string;
}

export interface ModelSummary {
  id: string;
  kind: 'plan' | 'assembly' | string;
  name: string;
  description: string;
  designator: string | null;
  sourceMode: string;
  lifecycleState: string;
  createdAt: string;
  modifiedAt: string;
}

export interface PageSummary {
  id: string;
  modelId: string;
  viewKind: ViewKind;
  name: string;
  order: number;
  widthUm: number;
  heightUm: number;
  orientation: string;
  viewport: Partial<ViewportState> & Record<string, unknown>;
  layers: Record<string, unknown>;
}

export interface WorkspaceState {
  activeModelId: string | null;
  activePageId: string | null;
  activeViewKind: ViewKind;
  panelState: Record<string, unknown>;
  viewportState: Partial<ViewportState> & Record<string, unknown>;
  selectedEntities: unknown[];
  updatedAt: string | null;
}

export interface EditorEnvelope {
  modelId: string;
  pageId: string;
  viewKind: ViewKind;
  contentHash: string;
  updatedAt: string;
  document: EditorDocument;
}

export interface BomItem {
  id: string;
  modelId: string;
  entityKind: string;
  entityId: string;
  role: string;
  manufacturer: string;
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  supplier: string;
  notes: string;
  properties: Record<string, unknown>;
  createdAt: string;
  modifiedAt: string;
}

export interface RevisionSummary {
  id: string;
  modelId: string;
  name: string;
  message: string;
  lifecycleState: string;
  headCommandSeq: number | null;
  contentHash: string;
  validation: { errors?: number; warnings?: number; info?: number } & Record<string, unknown>;
  createdAt: string;
  releasedAt: string | null;
  snapshotId: string | null;
}

export interface WorkspacePayload {
  path: string;
  meta: ProjectMeta;
  models: ModelSummary[];
  pages: PageSummary[];
  workspace: WorkspaceState;
  editor: EditorEnvelope;
  bom: BomItem[];
  drawingElements: DrawingElement[];
  revisions: RevisionSummary[];
}

export interface AssemblySyncDetail {
  state: 'added' | 'changed' | 'detached' | 'conflicted';
  entityKind: string;
  originEntityId: string;
  assemblyEntityId: string | null;
  explanation: string;
}

export interface AssemblySyncPreview {
  id: string;
  previewHash: string;
  assemblyModelId: string;
  originModelId: string;
  originPageId: string;
  counts: Record<AssemblySyncDetail['state'], number>;
  details: AssemblySyncDetail[];
}

export interface MechanicalFootprintPin {
  logicalPin: string;
  xMm: number;
  yMm: number;
}

export interface MechanicalFootprints {
  bodyWidthMm: number;
  bodyHeightMm: number;
  mateSide: MechanicalFootprintPin[];
  wireSide: MechanicalFootprintPin[];
}

export interface LibraryComponent {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  partNumber: string;
  tags: string[];
  component: ComponentNode;
  modifiedAt: string;
}

export interface CableCoreDefinition {
  id: string;
  label: string;
  color: string;
  stripe?: string;
  gaugeAwg?: number;
  crossSectionMm2?: number;
}

export interface LibraryCable {
  id: string;
  name: string;
  manufacturer: string;
  partNumber: string;
  tags: string[];
  definition: {
    kind: string;
    nominalOuterDiameterMm?: number;
    impedanceOhm?: number;
    cores: CableCoreDefinition[];
    shield?: Record<string, unknown>;
    [key: string]: unknown;
  };
  modifiedAt: string;
}

export interface RecentProject {
  path: string;
  project_uuid: string;
  name: string;
  last_opened_at: string;
  pinned: boolean;
  missing: boolean;
}

export interface BootstrapPayload {
  application: ApplicationInfo;
  settings: Record<string, unknown>;
  recentProjects: RecentProject[];
  workspace: WorkspacePayload;
  library: {
    components: LibraryComponent[];
    cables: LibraryCable[];
  };
}

export interface SaveDocumentResult {
  changed: boolean;
  contentHash: string;
  revision: number;
  savedAt: string;
  commandSequence?: number;
}

export interface ProjectAsset {
  id: string;
  sha256: string;
  mediaType: string;
  byteLength: number;
  originalFilename: string;
  entityKind: string;
  entityId: string;
  role: string;
}

export interface CommandLogEntry {
  sequence: number;
  id: string;
  modelId: string;
  actorId: string;
  batchId: string;
  type: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  committedAt: string;
  contentHash: string;
  documentContentHash: string;
  current: boolean;
  restorable: boolean;
  snapshotAvailable: boolean;
  snapshotId: string | null;
}

export interface ExportDefinition {
  id: string;
  label: string;
  description?: string;
  extension: string;
  mediaType: string;
}

export interface IntegrityResult {
  quick: string[];
  foreignKeys: unknown[];
  migrations: Array<Record<string, unknown>>;
  ok: boolean;
}

export interface EditorCallbacks {
  onDocumentChanged(document: EditorDocument, reason: string): void;
  onSelectionChanged(selection: SelectionState): void;
  onValidationChanged(): void;
  onStatus(message: string, kind?: 'info' | 'success' | 'warning' | 'error'): void;
  onViewportChanged(viewport: ViewportState): void;
  onCoordinates(point: Point): void;
  onContextMenu(screenPoint: Point, worldPoint: Point, hit?: HitResult): void;
  onPlaceRequested(point: Point): void;
  onLabelRequested(point: Point): void;
}

export type EditorTool = 'select' | 'pan' | 'wire' | 'label' | 'component';
