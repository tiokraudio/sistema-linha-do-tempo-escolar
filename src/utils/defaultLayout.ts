import { LayoutModel, CompositionConfig, DotPosition } from '../types';

export function createDefaultDotsForConfig(configIndex: number): DotPosition[] {
  if (configIndex <= 0) return [];

  const dotWidth = 17;
  const dotHeight = 12;
  const defaultY = 68;

  // Prescribed positions for specific compositions 1 to 10 with calibrated balance
  const presetCompositions: Record<number, Array<{ x: number; y: number }>> = {
    1: [{ x: 41.5, y: 68 }],
    2: [
      { x: 30.5, y: 68 },
      { x: 52.5, y: 68 },
    ],
    3: [
      { x: 21.0, y: 68 },
      { x: 41.5, y: 68 },
      { x: 62.0, y: 68 },
    ],
    4: [
      { x: 11.5, y: 68 },
      { x: 31.5, y: 68 },
      { x: 51.5, y: 68 },
      { x: 71.5, y: 68 },
    ],
    5: [
      { x: 3.5, y: 68 },
      { x: 22.5, y: 68 },
      { x: 41.5, y: 68 },
      { x: 60.5, y: 68 },
      { x: 79.5, y: 68 },
    ],
    6: [
      { x: 21.0, y: 61.5 },
      { x: 41.5, y: 61.5 },
      { x: 62.0, y: 61.5 },
      { x: 21.0, y: 76.5 },
      { x: 41.5, y: 76.5 },
      { x: 62.0, y: 76.5 },
    ],
    7: [
      { x: 11.5, y: 61.5 },
      { x: 31.5, y: 61.5 },
      { x: 51.5, y: 61.5 },
      { x: 71.5, y: 61.5 },
      { x: 21.0, y: 76.5 },
      { x: 41.5, y: 76.5 },
      { x: 62.0, y: 76.5 },
    ],
    8: [
      { x: 11.5, y: 61.5 },
      { x: 31.5, y: 61.5 },
      { x: 51.5, y: 61.5 },
      { x: 71.5, y: 61.5 },
      { x: 11.5, y: 76.5 },
      { x: 31.5, y: 76.5 },
      { x: 51.5, y: 76.5 },
      { x: 71.5, y: 76.5 },
    ],
    9: [
      { x: 3.5, y: 61.5 },
      { x: 22.5, y: 61.5 },
      { x: 41.5, y: 61.5 },
      { x: 60.5, y: 61.5 },
      { x: 79.5, y: 61.5 },
      { x: 11.5, y: 76.5 },
      { x: 31.5, y: 76.5 },
      { x: 51.5, y: 76.5 },
      { x: 71.5, y: 76.5 },
    ],
    10: [
      { x: 3.5, y: 61.5 },
      { x: 22.5, y: 61.5 },
      { x: 41.5, y: 61.5 },
      { x: 60.5, y: 61.5 },
      { x: 79.5, y: 61.5 },
      { x: 3.5, y: 76.5 },
      { x: 22.5, y: 76.5 },
      { x: 41.5, y: 76.5 },
      { x: 60.5, y: 76.5 },
      { x: 79.5, y: 76.5 },
    ],
  };

  const count = Math.max(configIndex, 0);
  const dots: DotPosition[] = [];

  const preset = presetCompositions[count];

  for (let i = 0; i < count; i++) {
    let pos: { x: number; y: number };
    if (preset && preset[i]) {
      pos = preset[i];
    } else if (count <= 5) {
      const step = 20;
      const startX = 50 - ((count - 1) * step) / 2 - dotWidth / 2;
      pos = { x: Math.max(2, startX + i * step), y: defaultY };
    } else {
      // 2 rows layout for count > 5
      const row = Math.floor(i / 5);
      const col = i % 5;
      const rowCount = row === 0 ? Math.min(5, count) : count - 5;
      const step = 19;
      const startX = 50 - ((rowCount - 1) * step) / 2 - dotWidth / 2;
      const y = row === 0 ? 62 : 76;
      pos = { x: Math.max(2, startX + col * step), y };
    }

    dots.push({
      xPercent: pos.x,
      yPercent: pos.y,
      widthPercent: dotWidth,
      heightPercent: dotHeight,
      yearLabel: {
        xPercent: pos.x,
        yPercent: pos.y + dotHeight + 1,
        verticalPosition: 'inferior',
        align: 'center',
        fontSizePx: 12,
        color: '#ffffff',
        bgColor: '#1e293b',
      },
    });
  }

  return dots;
}

export function ensureModelConfigurations(
  existingConfigs: CompositionConfig[] = [],
  totalSlots: number = 10
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

export function getDefaultSingleLayoutModel(slotsCount: number = 10): LayoutModel {
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
      fontSizePx: 24,
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
      fontSizePx: 12,
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

export function migrateDefaultLayoutModel(model: LayoutModel, slotsCount: number = 10): LayoutModel {
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
      fontSizePx: 24,
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
      fontSizePx: 12,
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
