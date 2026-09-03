export type PersonType = 'student' | 'collaborator';

export interface Student {
  id: string;
  enrollment: string; // Matrícula / Código interno (única)
  name: string; // Nome completo
  personType?: PersonType; // 'student' (padrão) ou 'collaborator'
  createdAt: string;
  updatedAt?: string;
}

export type AcademicPeriodOperationalStatus = 'in_production' | 'in_review' | 'closed';

export interface AcademicPeriod {
  id: string;
  name: string; // ex: "2026"
  active?: boolean;
  status?: AcademicPeriodOperationalStatus;
  closedAt?: string;
  closedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AcademicYearPendency {
  type: 'blocking' | 'informative';
  category: 'review_pending' | 'missing_photo' | 'new_history' | 'new_photo' | 'exceeding' | 'unsaved';
  count: number;
  description: string;
  studentNames?: string[];
  studentIds?: string[];
}

export interface AcademicYearClosingSummary {
  year: string;
  operationalStatus: AcademicPeriodOperationalStatus;
  displayStatus: 'in_production' | 'in_review' | 'ready_to_close' | 'closed';
  isReadyToClose: boolean;
  isClosed: boolean;
  totalStudents: number;
  confirmedRecordsCount: number;
  savedCompositionsCount: number;
  reviewPendingCount: number;
  reviewedCount: number;
  readyForPrintCount: number;
  withPendencyCount: number;
  missingPhotosCount: number;
  exceedingCount: number;
  newHistoryCount: number;
  completionPercent: number;
  blockingPendencies: AcademicYearPendency[];
  informativePendencies: AcademicYearPendency[];
  closedAt?: string;
  closedBy?: string;
}

export interface ClassRecord {
  id: string;
  name: string; // Ex: "Educação Infantil — 3 Anos" ou "Ensino Fundamental — 1º Ano"
  stage?: 'EI' | 'EFAI' | 'EFAF' | 'EM';
  stageName?: string;
  position?: number;
  active?: boolean;
  order?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface CropSettings {
  x: number; // 0-100 percentage horizontal center/offset
  y: number; // 0-100 percentage vertical center/offset
  zoom: number; // 1.0 - 3.0 scale multiplier
}

export interface CarometroCropSettings extends CropSettings {
  photoUrl?: string; // URL da foto quando o ajuste foi salvo para detecção de foto alterada
  updatedAt?: string;
}

export interface AutoFaceCropSettings extends CropSettings {
  photoUrl?: string; // URL da foto no momento da detecção automática
  detectedAt?: string;
}

export interface AcademicYearRecord {
  id: string;
  studentId: string;
  year: string; // Período letivo (ex: "2026")
  className: string; // Turma (ex: "4º ANO A")
  photoUrl: string; // Photograph URL for that period
  cropSettings?: CropSettings; // Compatibilidade com registros legados
  timelinePrimaryCrop?: CropSettings; // Ajuste explícito Linha do Tempo — Principal
  timelineSecondaryCrop?: CropSettings; // Ajuste explícito Linha do Tempo — Secundária
  carometroCrop?: CarometroCropSettings; // Ajuste 3x4
  carometroCircularCrop?: CarometroCropSettings; // Ajuste Circular (exclusivo Colaborador)
  autoFaceCrop?: AutoFaceCropSettings;
  createdAt: string;
  updatedAt?: string;
}

export interface SchoolConfig {
  schoolName: string;
  schoolLogo: string;
  photoHistorySlots?: number; // Quantidade de posições do Histórico Fotográfico (padrão 15)
}

export interface TextElementPosition {
  xPercent: number;
  yPercent: number;
  widthPercent?: number;
  heightPercent?: number;
  fontSizePx: number;
  color: string;
  bgColor?: string;
  align?: 'left' | 'center' | 'right';
  fontWeight?: string;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic';
  rotation?: number;
}

export interface DotPosition {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  rotation?: number;
  yearLabel?: {
    xPercent?: number;
    yPercent?: number;
    verticalPosition?: 'superior' | 'inferior';
    align?: 'left' | 'center' | 'right';
    fontSizePx: number;
    color: string;
    bgColor?: string;
  };
}

export interface CompositionConfig {
  configIndex: number; // 0 to 15
  label: string; // "Configuração 0", "Configuração 1", etc.
  secondaryDots: DotPosition[];
}

export interface LayoutModel {
  id: string;
  title: string;
  version?: number;
  year?: string;
  bgImageUrl: string; // Background do Aluno (padrão)
  collaboratorBgImageUrl?: string; // Background exclusivo do Colaborador
  primaryFrameUrl: string;
  secondaryFrameUrl: string;
  
  showSchoolLogo?: boolean;
  showSchoolName?: boolean;
  showStudentRegistration?: boolean;
  studentRegistrationPosition?: Partial<TextElementPosition> & { show?: boolean };
  secondaryYearConfig?: {
    verticalPosition?: 'superior' | 'inferior';
    align?: 'left' | 'center' | 'right';
    fontSizePx?: number;
    color?: string;
    bgColor?: string;
    show?: boolean;
  };
  schoolLogoPosition?: {
    show?: boolean;
    xPercent?: number;
    yPercent?: number;
    widthPercent?: number;
    heightPercent?: number;
    rotation?: number;
  };
  schoolNamePosition?: TextElementPosition & { show?: boolean };
  studentNamePosition?: TextElementPosition;
  yearPosition?: TextElementPosition;
  mainYearType?: 'text' | 'image';
  mainYearImageUrl?: string;
  
  primaryPhotoPosition?: DotPosition;
  configurations?: CompositionConfig[]; // Exactly 11 configurations (0 to 10)

  fontFamily?: string;
  primaryColor?: string;
  accentColor?: string;
  updatedAt: string;
}

export interface TimelinePhotoItem {
  recordId?: string;
  year: string | number;
  className: string;
  photoUrl: string;
  cropSettings: CropSettings;
  isPrimary?: boolean;
  positionOverride?: {
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
  };
}

export interface GeneratedTimeline {
  id: string;
  studentId: string;
  studentName: string;
  studentEnrollment: string;
  personType?: PersonType; // 'student' (padrão) ou 'collaborator'
  year: string | number;
  modelId: string;
  modelTitle: string;
  modelVersion?: number;
  modelSnapshot: LayoutModel;
  photoItems: TimelinePhotoItem[];
  status?: string;
  reviewStatus?: 'pending' | 'reviewed';
  reviewedAt?: string;
  reviewedBy?: string;
  reviewChecklist?: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Retorna o URL do background apropriado para o modelo com base no tipo de pessoa.
 * Se for colaborador e possuir background específico, usa o background do colaborador.
 * Caso contrário, faz fallback seguro para o background padrão (Aluno).
 */
export function getModelBackgroundUrl(
  model: LayoutModel | null | undefined,
  personType?: PersonType
): string {
  if (!model) return '';
  if (personType === 'collaborator' && model.collaboratorBgImageUrl && model.collaboratorBgImageUrl.trim() !== '') {
    return model.collaboratorBgImageUrl;
  }
  return model.bgImageUrl || '';
}

export interface SavedComposition extends GeneratedTimeline {}

export type BackupType = 'manual' | 'automatic' | 'pre_close' | 'pre_restore' | 'pre_migration' | 'pre_clear';

export type SelectiveClearCategory =
  | 'students'
  | 'collaborators'
  | 'records'
  | 'photos'
  | 'timelines'
  | 'carometro'
  | 'crops'
  | 'classes'
  | 'periods'
  | 'school_data'
  | 'models';

export interface BackupManifest {
  backupVersion: string;
  systemVersion: string;
  createdAt: string;
  backupType: BackupType;
  reason: string;
  dataFormatVersion: string;
  counts: {
    studentsCount: number;
    recordsCount: number;
    periodsCount: number;
    timelinesCount: number;
    modelsCount: number;
    classesCount: number;
    photosCount: number;
    closedYearsCount: number;
  };
  checksums: {
    storageSha256: string;
  };
}

export interface BackupRecord {
  id: string;
  filename: string;
  createdAt: string;
  backupType: BackupType;
  reason: string;
  sizeBytes: number;
  systemVersion: string;
  status: 'valid' | 'corrupted';
  counts: {
    studentsCount: number;
    recordsCount: number;
    periodsCount: number;
    timelinesCount: number;
    photosCount: number;
  };
  manifest: BackupManifest;
}

export interface ReviewChecklistState {
  studentNameCorrect: boolean;
  photosBelongToStudent: boolean;
  [key: string]: boolean | undefined;
}

export const DEFAULT_CHECKLIST: ReviewChecklistState = {
  studentNameCorrect: false,
  photosBelongToStudent: false,
};

export interface WorkQueueItem {
  student: Student;
  latestRecord: AcademicYearRecord | null;
  latestYear: string;
  latestClass: string;
  pedagogicalPos: number;
  recordsCount: number;
  photosCount: number;
  hasLatestPhoto: boolean;
  isEligibleForTimeline: boolean;
  missingSlots: { year: string | number; className: string }[];
  missingPhotosCount: number;
  hasMissingPhotos: boolean;
  hasExceeding: boolean;
  usedSlotsCount: number;
  capacity: number;
  isSaved: boolean;
  savedTimeline: GeneratedTimeline | null;
  status: 'saved' | 'pending';
  hasNewHistoryAfterSave: boolean;
  hasNewPhotoAfterSave: boolean;
  isSavedWithPending: boolean;
  isReadyForPdf: boolean;
  reviewStatus: 'pending' | 'reviewed';
  reviewedAt?: string;
  reviewedBy?: string;
  reviewChecklist?: Record<string, boolean>;
  isReviewed: boolean;
  isReadyForPrint: boolean;
  isReviewPending: boolean;
  isPeriodClosed: boolean;
  periodStatus: AcademicPeriodOperationalStatus;
  isEligibleForOfficialPdf: boolean;
}

export interface LocalStorageData {
  config: SchoolConfig;
  periods: AcademicPeriod[];
  classes: ClassRecord[];
  students: Student[];
  records: AcademicYearRecord[];
  models: LayoutModel[];
  timelines: SavedComposition[];
}

export interface AuthStatusResponse {
  isSetup: boolean;
  isAuthenticated: boolean;
  email?: string | null;
}

export interface AdminProfile {
  email: string;
  role: string;
}

export interface UserPreferences {
  confirmCriticalActions?: boolean;
  notifyBackups?: boolean;
  uppercaseNames?: boolean;
}

export interface UserProfile {
  email: string;
  displayName: string;
  role: string; // 'Administrador' | 'Operador'
  avatarUrl?: string | null;
  department?: string;
  preferences?: UserPreferences;
  createdAt?: string;
  updatedAt?: string;
}

export type ActiveTab = 
  | 'students'
  | 'collaborators'
  | 'confirm_period'
  | 'classes'
  | 'photo_management'
  | 'generate_timeline'
  | 'carometro'
  | 'generated_timelines'
  | 'batch_print'
  | 'settings'
  | 'layout_models'
  | 'school_settings'
  | 'periods'
  | 'year_closing'
  | 'backup_security'
  | 'account_settings';

