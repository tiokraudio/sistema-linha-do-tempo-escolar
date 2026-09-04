import { LayoutModel, CompositionConfig, DotPosition } from '../types';

export function createDefaultDotsForConfig(configIndex: number): DotPosition[] {
  if (configIndex <= 0) return [];

  const dotWidth = 17;
  const dotHeight = 12;

  interface PresetDot {
    x: number;
    y: number;
    labelX: number;
    labelY: number;
  }

  // Matriz Oficial de Coordenadas Secundárias (0 a 15)
  const presetCompositions: Record<number, PresetDot[]> = {
    1: [
      { x: 41.5, y: 64, labelX: 41.5, labelY: 76.5 },
    ],
    2: [
      { x: 31.5, y: 64, labelX: 31.5, labelY: 76.5 },
      { x: 51.5, y: 64, labelX: 51.5, labelY: 76.5 },
    ],
    3: [
      { x: 21.5, y: 64, labelX: 21.5, labelY: 76.5 },
      { x: 41.5, y: 64, labelX: 41.5, labelY: 76.5 },
      { x: 61.5, y: 64, labelX: 61.5, labelY: 76.5 },
    ],
    4: [
      { x: 11.5, y: 64, labelX: 11.5, labelY: 76.5 },
      { x: 31.5, y: 64, labelX: 31.5, labelY: 76.5 },
      { x: 51.5, y: 64, labelX: 51.5, labelY: 76.5 },
      { x: 71.5, y: 64, labelX: 71.5, labelY: 76.5 },
    ],
    5: [
      { x: 1.5, y: 64, labelX: 1.5, labelY: 76.5 },
      { x: 21.5, y: 64, labelX: 21.5, labelY: 76.5 },
      { x: 41.5, y: 64, labelX: 41.5, labelY: 76.5 },
      { x: 61.5, y: 64, labelX: 61.5, labelY: 76.5 },
      { x: 81.5, y: 64, labelX: 81.5, labelY: 76.5 },
    ],
    6: [
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 41.5, y: 71, labelX: 41.5, labelY: 83.5 },
    ],
    7: [
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 31.5, y: 71, labelX: 31.5, labelY: 83.5 },
      { x: 51.5, y: 71, labelX: 51.5, labelY: 83.5 },
    ],
    8: [
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 21.5, y: 71, labelX: 21.5, labelY: 83.5 },
      { x: 41.5, y: 71, labelX: 41.5, labelY: 83.5 },
      { x: 61.5, y: 71, labelX: 61.5, labelY: 83.5 },
    ],
    9: [
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 11.5, y: 71, labelX: 11.5, labelY: 83.5 },
      { x: 31.5, y: 71, labelX: 31.5, labelY: 83.5 },
      { x: 51.5, y: 71, labelX: 51.5, labelY: 83.5 },
      { x: 71.5, y: 71, labelX: 71.5, labelY: 83.5 },
    ],
    10: [
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 1.5, y: 71, labelX: 1.5, labelY: 83.5 },
      { x: 21.5, y: 71, labelX: 21.5, labelY: 83.5 },
      { x: 41.5, y: 71, labelX: 41.5, labelY: 83.5 },
      { x: 61.5, y: 71, labelX: 61.5, labelY: 83.5 },
      { x: 81.5, y: 71, labelX: 81.5, labelY: 83.5 },
    ],
    11: [
      { x: 1.5, y: 41, labelX: 1.5, labelY: 53.5 },
      { x: 21.5, y: 41, labelX: 21.5, labelY: 53.5 },
      { x: 41.5, y: 41, labelX: 41.5, labelY: 53.5 },
      { x: 61.5, y: 41, labelX: 61.5, labelY: 53.5 },
      { x: 81.5, y: 41, labelX: 81.5, labelY: 53.5 },
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 41.5, y: 71, labelX: 41.5, labelY: 83.5 },
    ],
    12: [
      { x: 1.5, y: 41, labelX: 1.5, labelY: 53.5 },
      { x: 21.5, y: 41, labelX: 21.5, labelY: 53.5 },
      { x: 41.5, y: 41, labelX: 41.5, labelY: 53.5 },
      { x: 61.5, y: 41, labelX: 61.5, labelY: 53.5 },
      { x: 81.5, y: 41, labelX: 81.5, labelY: 53.5 },
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 31.5, y: 71, labelX: 31.5, labelY: 83.5 },
      { x: 51.5, y: 71, labelX: 51.5, labelY: 83.5 },
    ],
    13: [
      { x: 1.5, y: 41, labelX: 1.5, labelY: 53.5 },
      { x: 21.5, y: 41, labelX: 21.5, labelY: 53.5 },
      { x: 41.5, y: 41, labelX: 41.5, labelY: 53.5 },
      { x: 61.5, y: 41, labelX: 61.5, labelY: 53.5 },
      { x: 81.5, y: 41, labelX: 81.5, labelY: 53.5 },
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 21.5, y: 71, labelX: 21.5, labelY: 83.5 },
      { x: 41.5, y: 71, labelX: 41.5, labelY: 83.5 },
      { x: 61.5, y: 71, labelX: 61.5, labelY: 83.5 },
    ],
    14: [
      { x: 1.5, y: 41, labelX: 1.5, labelY: 53.5 },
      { x: 21.5, y: 41, labelX: 21.5, labelY: 53.5 },
      { x: 41.5, y: 41, labelX: 41.5, labelY: 53.5 },
      { x: 61.5, y: 41, labelX: 61.5, labelY: 53.5 },
      { x: 81.5, y: 41, labelX: 81.5, labelY: 53.5 },
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 11.5, y: 71, labelX: 11.5, labelY: 83.5 },
      { x: 31.5, y: 71, labelX: 31.5, labelY: 83.5 },
      { x: 51.5, y: 71, labelX: 51.5, labelY: 83.5 },
      { x: 71.5, y: 71, labelX: 71.5, labelY: 83.5 },
    ],
    15: [
      { x: 1.5, y: 41, labelX: 1.5, labelY: 53.5 },
      { x: 21.5, y: 41, labelX: 21.5, labelY: 53.5 },
      { x: 41.5, y: 41, labelX: 41.5, labelY: 53.5 },
      { x: 61.5, y: 41, labelX: 61.5, labelY: 53.5 },
      { x: 81.5, y: 41, labelX: 81.5, labelY: 53.5 },
      { x: 1.5, y: 56, labelX: 1.5, labelY: 68.5 },
      { x: 21.5, y: 56, labelX: 21.5, labelY: 68.5 },
      { x: 41.5, y: 56, labelX: 41.5, labelY: 68.5 },
      { x: 61.5, y: 56, labelX: 61.5, labelY: 68.5 },
      { x: 81.5, y: 56, labelX: 81.5, labelY: 68.5 },
      { x: 1.5, y: 71, labelX: 1.5, labelY: 83.5 },
      { x: 21.5, y: 71, labelX: 21.5, labelY: 83.5 },
      { x: 41.5, y: 71, labelX: 41.5, labelY: 83.5 },
      { x: 61.5, y: 71, labelX: 61.5, labelY: 83.5 },
      { x: 81.5, y: 71, labelX: 81.5, labelY: 83.5 },
    ],
  };

  const count = Math.max(configIndex, 0);
  const dots: DotPosition[] = [];

  const preset = presetCompositions[count];

  if (preset) {
    for (let i = 0; i < count; i++) {
      const pt = preset[i];
      if (!pt) continue;
      dots.push({
        xPercent: pt.x,
        yPercent: pt.y,
        widthPercent: dotWidth,
        heightPercent: dotHeight,
        yearLabel: {
          xPercent: pt.labelX,
          yPercent: pt.labelY,
          verticalPosition: 'inferior',
          align: 'center',
          fontSizePx: 11,
          color: '#ffffff',
          bgColor: '#1e293b',
        },
      });
    }
    return dots;
  }

  // Fallback para contagem > 15
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    const rowCount = row === 0 ? Math.min(5, count) : count - row * 5;
    const step = 20;
    const startX = 50 - ((Math.min(rowCount, 5) - 1) * step) / 2 - dotWidth / 2;
    const x = Math.max(1.5, startX + col * step);
    const y = 41 + row * 15;

    dots.push({
      xPercent: x,
      yPercent: y,
      widthPercent: dotWidth,
      heightPercent: dotHeight,
      yearLabel: {
        xPercent: x,
        yPercent: y + dotHeight + 0.5,
        verticalPosition: 'inferior',
        align: 'center',
        fontSizePx: 11,
        color: '#ffffff',
        bgColor: '#1e293b',
      },
    });
  }

  return dots;
}

export function ensureModelConfigurations(
  existingConfigs: CompositionConfig[] = [],
  totalSlots: number = 15
): CompositionConfig[] {
  const existingMap = new Map<number, CompositionConfig>();
  existingConfigs.forEach((c) => {
    existingMap.set(c.configIndex, c);
  });

  const maxExisting = existingConfigs.length > 0 ? Math.max(...existingConfigs.map((c) => c.configIndex)) : 0;
  const targetMax = Math.max(totalSlots, maxExisting);

  const result: CompositionConfig[] = [];
  for (let i = 0; i <= targetMax; i++) {
    const existing = existingMap.get(i);
    if (existing) {
      result.push(existing);
    } else {
      result.push({
        configIndex: i,
        label: `Configuração ${i}`,
        secondaryDots: createDefaultDotsForConfig(i),
      });
    }
  }

  return result.sort((a, b) => a.configIndex - b.configIndex);
}

export function getDefaultSingleLayoutModel(slotsCount: number = 15): LayoutModel {
  const configurations: CompositionConfig[] = [];
  const maxSlots = Math.max(slotsCount, 0);
  for (let i = 0; i <= maxSlots; i++) {
    configurations.push({
      configIndex: i,
      label: `Configuração ${i}`,
      secondaryDots: createDefaultDotsForConfig(i),
    });
  }

  return {
    id: 'single_default_model',
    title: 'Modelo de Layout Principal',
    bgImageUrl: '',
    primaryFrameUrl: '',
    secondaryFrameUrl: '',

    showSchoolLogo: true,
    showSchoolName: true,
    showStudentRegistration: true,
    studentRegistrationPosition: {
      show: true,
      xPercent: 50,
      yPercent: 48,
      fontSizePx: 12,
      color: '#475569',
      align: 'center',
    },

    schoolLogoPosition: {
      show: true,
      xPercent: 82,
      yPercent: 5,
      widthPercent: 16,
      heightPercent: 12,
    },
    schoolNamePosition: {
      xPercent: 0,
      yPercent: 97,
      widthPercent: 100,
      heightPercent: 2,
      fontSizePx: 12,
      color: '#ffffff',
      align: 'center',
      fontWeight: 'bold',
      fontFamily: 'Montserrat, sans-serif',
    },
    studentNamePosition: {
      xPercent: 0,
      yPercent: 86,
      widthPercent: 100,
      heightPercent: 5,
      fontSizePx: 30,
      color: '#ffffff',
      align: 'center',
      fontWeight: 'bold',
    },
    yearPosition: {
      xPercent: 82,
      yPercent: 16.5,
      widthPercent: 16,
      heightPercent: 3,
      fontSizePx: 14,
      color: '#ffffff',
      bgColor: '#1e293b',
      align: 'center',
      fontWeight: 'bold',
    },
    mainYearType: 'text',
    mainYearImageUrl: '',

    secondaryYearConfig: {
      verticalPosition: 'inferior',
      align: 'center',
      fontSizePx: 11,
      color: '#ffffff',
      bgColor: '#1e293b',
      show: true,
    },

    primaryPhotoPosition: {
      xPercent: 0,
      yPercent: 0,
      widthPercent: 100,
      heightPercent: 58,
      yearLabel: {
        xPercent: 50,
        yPercent: 65,
        fontSizePx: 14,
        color: '#ffffff',
        bgColor: '#1e293b',
      },
    },

    configurations,

    fontFamily: 'Montserrat, sans-serif',
    primaryColor: '#1e293b',
    accentColor: '#3b82f6',
    updatedAt: new Date().toISOString(),
  };
}

export function migrateDefaultLayoutModel(model: LayoutModel, slotsCount: number = 15): LayoutModel {
  const maxSlots = Math.max(slotsCount, 0);
  const configurations: CompositionConfig[] = [];
  for (let i = 0; i <= maxSlots; i++) {
    configurations.push({
      configIndex: i,
      label: `Configuração ${i}`,
      secondaryDots: createDefaultDotsForConfig(i),
    });
  }

  return {
    ...model,
    showSchoolLogo: model.showSchoolLogo !== false,
    showSchoolName: model.showSchoolName !== false,
    showStudentRegistration: model.showStudentRegistration !== false,

    schoolLogoPosition: {
      show: model.schoolLogoPosition?.show !== false,
      xPercent: 82,
      yPercent: 5,
      widthPercent: 16,
      heightPercent: 12,
      rotation: model.schoolLogoPosition?.rotation ?? 0,
    },
    schoolNamePosition: {
      xPercent: 0,
      yPercent: 97,
      widthPercent: 100,
      heightPercent: 2,
      fontSizePx: 12,
      color: '#ffffff',
      align: 'center',
      fontWeight: 'bold',
      fontFamily: model.schoolNamePosition?.fontFamily || model.fontFamily || 'Montserrat, sans-serif',
    },
    studentNamePosition: {
      xPercent: 0,
      yPercent: 86,
      widthPercent: 100,
      heightPercent: 5,
      fontSizePx: 30,
      color: '#ffffff',
      align: 'center',
      fontWeight: 'bold',
      rotation: model.studentNamePosition?.rotation ?? 0,
    },
    yearPosition: {
      xPercent: 82,
      yPercent: 16.5,
      widthPercent: 16,
      heightPercent: 3,
      fontSizePx: 14,
      color: '#ffffff',
      bgColor: '#1e293b',
      align: 'center',
      fontWeight: 'bold',
      rotation: model.yearPosition?.rotation ?? 0,
    },
    secondaryYearConfig: {
      verticalPosition: 'inferior',
      align: 'center',
      fontSizePx: 11,
      color: '#ffffff',
      bgColor: '#1e293b',
      show: true,
    },
    primaryPhotoPosition: {
      xPercent: 0,
      yPercent: 0,
      widthPercent: 100,
      heightPercent: 58,
      rotation: model.primaryPhotoPosition?.rotation ?? 0,
      yearLabel: {
        xPercent: 50,
        yPercent: 65,
        fontSizePx: 14,
        color: '#ffffff',
        bgColor: '#1e293b',
      },
    },
    configurations,
    fontFamily: model.fontFamily || 'Montserrat, sans-serif',
    updatedAt: new Date().toISOString(),
  };
}
