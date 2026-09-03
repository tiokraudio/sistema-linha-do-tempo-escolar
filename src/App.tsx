import React, { useState, useEffect, useMemo } from 'react';
import {
  Student,
  AcademicYearRecord,
  LayoutModel,
  GeneratedTimeline,
  SchoolConfig,
  ActiveTab,
  CropSettings,
  AcademicPeriod,
  ClassRecord,
  PersonType,
} from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { PeriodsManager } from './components/PeriodsManager';
import { PhotoManagementCenter } from './components/PhotoManagementCenter';
import { StudentList } from './components/StudentList';
import { ConfirmPeriod } from './components/ConfirmPeriod';
import { StudentCentralModal } from './components/StudentCentralModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { GenerateTimeline } from './components/GenerateTimeline';
import { AcademicYearClosingDashboard } from './components/AcademicYearClosingDashboard';
import { SettingsDashboard } from './components/SettingsDashboard';
import { LoginScreen } from './components/LoginScreen';
import { Footer } from './components/Footer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { getDefaultSingleLayoutModel } from './utils/defaultLayout';
import { buildWorkQueueData } from './utils/workQueue';
import { getActiveAcademicYear } from './utils/academicYears';
import { AcademicPeriodOperationalStatus } from './types';
import { apiFetch } from './utils/api';
import { updateAppFavicon } from './utils/favicon';

function MainAppContent() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('students');

  // Application State
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig>({
    schoolName: '',
    schoolLogo: '',
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AcademicYearRecord[]>([]);
  const [models, setModels] = useState<LayoutModel[]>([]);
  const [timelines, setTimelines] = useState<GeneratedTimeline[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected Student for Student Central Modal (B.25 / B.28.2)
  const [centralStudent, setCentralStudent] = useState<Student | null>(null);
  const [isCentralModalOpen, setIsCentralModalOpen] = useState(false);
  const [centralOriginLabel, setCentralOriginLabel] = useState<string>('Voltar');

  const handleOpenStudentCentral = (student: Student, originLabel: string = 'Voltar') => {
    setCentralStudent(student);
    setCentralOriginLabel(originLabel);
    setIsCentralModalOpen(true);
  };

  // Global Search Modal (B.26)
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  // Global Keyboard Shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Selected Student for Confirm Period Pre-fill
  const [preselectedConfirmStudent, setPreselectedConfirmStudent] = useState<Student | null>(null);

  // Pre-selected Student ID for Generate Timeline
  const [timelineInitialStudentId, setTimelineInitialStudentId] = useState<string>('');

  // Selected period for closing dashboard (B.23)
  const [closingSelectedPeriod, setClosingSelectedPeriod] = useState<string>('all');

  // Fetch initial state from Express backend
  const fetchData = async () => {
    try {
      const parseJsonSafely = async (res: Response) => {
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            return await res.json();
          } catch (e) {
            console.error('Error parsing JSON:', e);
            return null;
          }
        }
        return null;
      };

      const [
        configRes,
        studentsRes,
        recordsRes,
        modelsRes,
        timelinesRes,
        periodsRes,
        classesRes,
      ] = await Promise.all([
        apiFetch('/api/config'),
        apiFetch('/api/students'),
        apiFetch('/api/records'),
        apiFetch('/api/models'),
        apiFetch('/api/timelines'),
        apiFetch('/api/periods'),
        apiFetch('/api/classes'),
      ]);

      const [configData, studentsData, recordsData, modelsData, timelinesData, periodsData, classesData] =
        await Promise.all([
          parseJsonSafely(configRes),
          parseJsonSafely(studentsRes),
          parseJsonSafely(recordsRes),
          parseJsonSafely(modelsRes),
          parseJsonSafely(timelinesRes),
          parseJsonSafely(periodsRes),
          parseJsonSafely(classesRes),
        ]);

      if (configData) setSchoolConfig(configData);
      if (studentsData) setStudents(studentsData);
      if (recordsData) setRecords(recordsData);
      if (modelsData) setModels(modelsData);
      if (timelinesData) setTimelines(timelinesData);
      if (periodsData) setPeriods(periodsData);
      if (classesData) setClasses(classesData);
    } catch (err) {
      console.error('Error loading API data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      setIsLoading(true);
      fetchData();
    } else {
      setStudents([]);
      setRecords([]);
      setTimelines([]);
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Sincronização automática do favicon com o logotipo da escola
  useEffect(() => {
    updateAppFavicon(schoolConfig?.schoolLogo);
  }, [schoolConfig?.schoolLogo]);

  // Current active academic period name derived from canonical Configurações -> Ano letivo
  const currentPeriodName = useMemo(() => getActiveAcademicYear(periods) || '', [periods]);

  // Student / Collaborator Handlers
  const handleAddStudent = async (data: { enrollment: string; name: string; personType?: PersonType }) => {
    const res = await apiFetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao cadastrar.');
    }
    const newStudent: Student = await res.json();
    setStudents((prev) => [...prev.filter((s) => s.id !== newStudent.id), newStudent]);
    await fetchData();
  };

  const handleEditStudent = async (id: string, data: { enrollment: string; name: string; personType?: PersonType }) => {
    const res = await apiFetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao atualizar.');
    }
    const updatedStudent: Student = await res.json();
    setStudents((prev) => prev.map((s) => (s.id === id ? updatedStudent : s)));
    await fetchData();
  };

  const handleDeleteStudent = async (id: string) => {
    const res = await apiFetch(`/api/students/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao excluir.');
    }
    setStudents((prev) => prev.filter((s) => s.id !== id));
    await fetchData();
  };

  // Confirm Period Handler (Exclusivo para Alunos -> POST /api/confirm-period)
  const handleConfirmStudentPeriod = async (payload: {
    year: string | number;
    enrollment: string;
    name?: string;
    className: string;
    photoUrl?: string;
    cropSettings?: CropSettings;
    personType?: PersonType;
  }) => {
    try {
      const res = await apiFetch('/api/confirm-period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errMessage = 'Erro ao confirmar matrícula no período.';
        try {
          const err = await res.json();
          if (err && (err.error || err.message)) {
            errMessage = err.error || err.message;
          }
        } catch {
          // Response body was not JSON
        }
        throw new Error(errMessage);
      }

      const data = await res.json();
      await fetchData();
      return data;
    } catch (err: any) {
      if (
        err?.name === 'TypeError' ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('network')
      ) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      }
      throw err;
    }
  };

  // Register Collaborator Period Handler (Exclusivo para Colaboradores -> POST /api/records)
  const handleRegisterCollaboratorPeriod = async (payload: {
    studentId: string;
    year: string | number;
    photoUrl?: string;
    cropSettings?: CropSettings;
  }) => {
    try {
      const res = await apiFetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: payload.studentId,
          year: String(payload.year),
          className: '',
          photoUrl: payload.photoUrl || '',
          cropSettings: payload.cropSettings || { x: 50, y: 50, zoom: 1.0 },
        }),
      });

      if (!res.ok) {
        let errMessage = 'Erro ao registrar período do colaborador.';
        try {
          const err = await res.json();
          if (err && (err.error || err.message)) {
            errMessage = err.error || err.message;
          }
        } catch {
          // Response body was not JSON
        }
        throw new Error(errMessage);
      }

      const data = await res.json();
      await fetchData();
      return data;
    } catch (err: any) {
      if (
        err?.name === 'TypeError' ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('network')
      ) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      }
      throw err;
    }
  };

  const handleUpdateRecordPhoto = async (
    recordId: string,
    photoUrl: string,
    cropSettings?: CropSettings
  ): Promise<AcademicYearRecord & { timelineRemoved?: boolean; message?: string }> => {
    try {
      const res = await apiFetch(`/api/records/${recordId}/photo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl, cropSettings }),
      });

      if (!res.ok) {
        let errMessage = 'Erro ao atualizar fotografia.';
        try {
          const err = await res.json();
          if (err && (err.error || err.message)) {
            errMessage = err.error || err.message;
          }
        } catch {
          // not json
        }
        throw new Error(errMessage);
      }

      const updatedRecord: AcademicYearRecord & { timelineRemoved?: boolean; message?: string } = await res.json();
      setRecords((prev) => prev.map((r) => (r.id === recordId ? updatedRecord : r)));
      await fetchData();
      return updatedRecord;
    } catch (err: any) {
      if (
        err?.name === 'TypeError' ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('network') ||
        err?.message?.includes('conectar ao servidor')
      ) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      }
      throw err;
    }
  };

  const handleUpdateRecordCrops = async (
    recordId: string,
    crops: {
      timelinePrimaryCrop?: CropSettings;
      timelineSecondaryCrop?: CropSettings;
      carometroCrop?: CropSettings;
    }
  ): Promise<AcademicYearRecord> => {
    try {
      const res = await apiFetch(`/api/records/${recordId}/crops`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crops),
      });

      if (!res.ok) {
        let errMessage = 'Erro ao salvar ajustes da fotografia.';
        try {
          const err = await res.json();
          if (err && (err.error || err.message)) {
            errMessage = err.error || err.message;
          }
        } catch {
          // not json
        }
        throw new Error(errMessage);
      }

      const updatedRecord: AcademicYearRecord = await res.json();
      setRecords((prev) => prev.map((r) => (r.id === recordId ? updatedRecord : r)));
      await fetchData();
      return updatedRecord;
    } catch (err: any) {
      if (
        err?.name === 'TypeError' ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('network') ||
        err?.message?.includes('conectar ao servidor')
      ) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      }
      throw err;
    }
  };

  const handleUpdateRecordCrop = async (
    recordId: string,
    crop: CropSettings
  ): Promise<void> => {
    try {
      const res = await apiFetch(`/api/records/${recordId}/carometro-crop`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carometroCrop: crop }),
      });

      if (!res.ok) {
        let errMessage = 'Erro ao salvar ajuste do carômetro.';
        try {
          const err = await res.json();
          if (err && (err.error || err.message)) {
            errMessage = err.error || err.message;
          }
        } catch {
          // not json
        }
        throw new Error(errMessage);
      }

      await fetchData();
    } catch (err: any) {
      if (
        err?.name === 'TypeError' ||
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('network') ||
        err?.message?.includes('conectar ao servidor')
      ) {
        throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      }
      throw err;
    }
  };

  const handleBatchAutoFaceCrop = async (
    updates: Array<{ recordId: string; autoFaceCrop: CropSettings }>
  ) => {
    try {
      const res = await apiFetch('/api/carometro/batch-auto-face-crop', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        let errMessage = 'Erro ao salvar detecções automáticas.';
        try {
          const err = await res.json();
          if (err && (err.error || err.message)) {
            errMessage = err.error || err.message;
          }
        } catch {}
        throw new Error(errMessage);
      }
      await fetchData();
    } catch (err: any) {
      throw err;
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    const res = await apiFetch(`/api/records/${recordId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao remover registro do período.');
    }

    await fetchData();
  };

  // Timeline Handlers
  const handleSaveTimeline = async (
    timelineData: Omit<GeneratedTimeline, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<GeneratedTimeline> => {
    // Safe payload size measurement and logging
    try {
      const payloadString = JSON.stringify(timelineData);
      const totalBytes = new Blob([payloadString]).size;
      const mbSize = (totalBytes / (1024 * 1024)).toFixed(2);
      const photoItemsCount = timelineData.photoItems?.length || 0;
      
      const photoSizes = (timelineData.photoItems || []).map((p, idx) => {
        const pBytes = p.photoUrl ? new Blob([p.photoUrl]).size : 0;
        const cropBytes = p.cropSettings ? JSON.stringify(p.cropSettings).length : 0;
        return {
          item: idx + 1,
          year: p.year,
          photoSizeMB: (pBytes / (1024 * 1024)).toFixed(2) + ' MB',
          photoSizeBytes: pBytes,
          cropSizeBytes: cropBytes,
        };
      });

      console.info('[Linha do Tempo] Salvando composição - Diagnóstico de Payload:', {
        student: `${timelineData.studentName} (${timelineData.studentEnrollment})`,
        year: timelineData.year,
        photoItemsCount,
        totalPayloadSize: `${mbSize} MB (${totalBytes} bytes)`,
        itemsBreakdown: photoSizes,
      });
    } catch {
      // safe fallback for telemetry
    }

    const res = await apiFetch('/api/timelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timelineData),
    });

    if (!res.ok) {
      let errMessage = 'Erro ao salvar linha do tempo.';
      if (res.status === 413) {
        errMessage =
          'A composição é muito grande para ser enviada (HTTP 413 — Payload Too Large). O limite do ambiente foi excedido devido ao tamanho acumulado das fotos.';
      } else {
        try {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const err = await res.json();
            errMessage = err.error || err.message || errMessage;
          } else {
            const text = await res.text();
            if (text && !text.trim().startsWith('<')) {
              errMessage = text.trim();
            }
          }
        } catch {
          // not json
        }
      }
      throw new Error(errMessage);
    }

    let created: GeneratedTimeline;
    try {
      created = await res.json();
    } catch {
      throw new Error('Resposta do servidor em formato inválido ao salvar a composição.');
    }

    await fetchData();
    return created;
  };

  const handleDeleteTimeline = async (id: string) => {
    const res = await apiFetch(`/api/timelines/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao excluir composição.');
    }
    await fetchData();
  };

  // Layout Model Handler
  const handleSaveLayoutModel = async (updatedModel: LayoutModel): Promise<LayoutModel> => {
    const res = await apiFetch(`/api/models/${updatedModel.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedModel),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao atualizar modelo.');
    }

    const saved = await res.json();
    await fetchData();
    return saved;
  };

  // School Config Handler
  const handleSaveSchoolConfig = async (newConfig: SchoolConfig) => {
    const res = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao salvar configurações.');
    }

    const savedConfig = await res.json();
    setSchoolConfig(savedConfig);
    await fetchData();
  };

  // Class Management Handlers
  const handleUpdateClass = async (id: string, updates: Partial<ClassRecord>) => {
    const res = await apiFetch(`/api/classes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      let msg = 'Erro ao atualizar turma.';
      try {
        const err = await res.json();
        msg = err.error || msg;
      } catch (e) {}
      throw new Error(msg);
    }
    const updatedClass: ClassRecord = await res.json();
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...updatedClass } : c)));
    await fetchData();
  };

  const handleReorderClasses = async (classIds: string[]) => {
    const res = await apiFetch('/api/classes/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classIds }),
    });
    if (!res.ok) {
      let msg = 'Erro ao reordenar turmas.';
      try {
        const err = await res.json();
        msg = err.error || msg;
      } catch (e) {}
      throw new Error(msg);
    }
    const reordered: ClassRecord[] = await res.json();
    setClasses(reordered);
    await fetchData();
  };

  const handleResetClassesOrder = async () => {
    const res = await apiFetch('/api/classes/reset-order', {
      method: 'PUT',
    });
    if (!res.ok) {
      let msg = 'Erro ao restaurar ordem das turmas.';
      try {
        const err = await res.json();
        msg = err.error || msg;
      } catch (e) {}
      throw new Error(msg);
    }
    const resetList: ClassRecord[] = await res.json();
    setClasses(resetList);
    await fetchData();
  };

  const handleAddClass = async (name: string, stage?: string) => {
    const res = await apiFetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, stage }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao cadastrar turma.');
    }
    await fetchData();
  };

  const handleDeleteClass = async (id: string) => {
    const res = await apiFetch(`/api/classes/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao excluir/desativar turma.');
    }
    await fetchData();
  };

  // Period Management Handlers (Configurações -> Períodos Letivos)
  const handleAddPeriod = async (name: string) => {
    const res = await apiFetch('/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao cadastrar período letivo.');
    }

    await fetchData();
  };

  const handleTogglePeriodActive = async (id: string, active: boolean) => {
    const res = await apiFetch(`/api/periods/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });

    if (!res.ok) {
      let msg = 'Erro ao atualizar status do período.';
      try {
        const err = await res.json();
        msg = err.error || msg;
      } catch (e) {}
      throw new Error(msg);
    }

    await fetchData();
  };

  // Update Period Status (B.23)
  const handleUpdatePeriodStatus = async (year: string, status: AcademicPeriodOperationalStatus) => {
    const res = await apiFetch(`/api/periods/${year}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao atualizar status do período.');
    }

    await fetchData();
  };

  // Close Academic Year (B.23)
  const handleClosePeriod = async (year: string, closedBy?: string) => {
    const res = await apiFetch(`/api/periods/${year}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closedBy: closedBy || 'Operador do Sistema' }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao fechar ano letivo.');
    }

    await fetchData();
  };

  const maxSlots = schoolConfig.photoHistorySlots ?? 10;
  const workQueueData = useMemo(() => {
    return buildWorkQueueData(students, records, timelines, maxSlots, periods);
  }, [students, records, timelines, maxSlots, periods]);

  const activeLayoutModel =
    models.length > 0
      ? models[0]
      : getDefaultSingleLayoutModel(maxSlots);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-lg font-bold text-slate-200">Carregando Linha do Tempo Escolar...</h2>
        <p className="text-xs text-slate-400 mt-1">Verificando sessão de acesso</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-lg font-bold text-slate-200">Carregando Linha do Tempo Escolar...</h2>
        <p className="text-xs text-slate-400 mt-1">Carregando dados escolares</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Header */}
      <Header
        config={schoolConfig}
        currentPeriodName={currentPeriodName}
        onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
        onOpenAccountSettings={() => setActiveTab('account_settings')}
      />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenAccountSettings={() => setActiveTab('account_settings')}
        />

        {/* Main Content Area + Footer */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'students' && (
            <StudentList
              personType="student"
              students={students}
              records={records}
              classes={classes}
              periods={periods}
              timelines={timelines}
              onOpenStudentCentral={(std) => handleOpenStudentCentral(std, 'Voltar para Alunos')}
              onConfirmStudentPeriod={handleConfirmStudentPeriod}
              onDeleteRecord={handleDeleteRecord}
              onUpdateRecordCrops={handleUpdateRecordCrops}
              onAddStudent={handleAddStudent}
              onEditStudent={handleEditStudent}
              onDeleteStudent={handleDeleteStudent}
              onDataReload={fetchData}
            />
          )}

          {activeTab === 'collaborators' && (
            <StudentList
              personType="collaborator"
              students={students}
              records={records}
              classes={classes}
              periods={periods}
              timelines={timelines}
              onOpenStudentCentral={(std) => handleOpenStudentCentral(std, 'Voltar para Colaboradores')}
              onConfirmStudentPeriod={handleConfirmStudentPeriod}
              onRegisterCollaboratorPeriod={handleRegisterCollaboratorPeriod}
              onDeleteRecord={handleDeleteRecord}
              onUpdateRecordCrops={handleUpdateRecordCrops}
              onAddStudent={handleAddStudent}
              onEditStudent={handleEditStudent}
              onDeleteStudent={handleDeleteStudent}
              onDataReload={fetchData}
            />
          )}

          {activeTab === 'confirm_period' && (
            <ConfirmPeriod
              currentYear={currentPeriodName}
              periods={periods}
              timelines={timelines}
              classes={classes}
              students={students}
              records={records}
              onConfirmStudentPeriod={handleConfirmStudentPeriod}
              onDeleteRecord={handleDeleteRecord}
              onUpdateRecordCrops={handleUpdateRecordCrops}
              preselectedStudent={preselectedConfirmStudent}
              onNavigateTab={(tab) => setActiveTab(tab as any)}
              onAddStudent={handleAddStudent}
            />
          )}

          {activeTab === 'photo_management' && (
            <PhotoManagementCenter
              students={students}
              records={records}
              classes={classes}
              timelines={timelines}
              periods={periods}
              schoolConfig={schoolConfig}
              onOpenStudentCentral={(std) =>
                handleOpenStudentCentral(std, 'Voltar para Gestão de Fotografias')
              }
              onNavigateToTimeline={(studentId) => {
                setTimelineInitialStudentId(studentId);
                setActiveTab('generate_timeline');
              }}
              onNavigateToReview={(_studentId) => {
                setActiveTab('generate_timeline');
              }}
              onNavigateToConfirmPeriod={(std) => {
                setPreselectedConfirmStudent(std);
                setActiveTab('confirm_period');
              }}
              onUpdateRecordPhoto={handleUpdateRecordPhoto}
            />
          )}

          {activeTab === 'generate_timeline' && (
            <GenerateTimeline
              students={students}
              records={records}
              classes={classes}
              models={[activeLayoutModel]}
              schoolConfig={schoolConfig}
              timelines={timelines}
              periods={periods}
              onSaveTimeline={handleSaveTimeline}
              onDeleteTimeline={handleDeleteTimeline}
              onUpdateRecordCrop={handleUpdateRecordCrop}
              onBatchAutoFaceCrop={handleBatchAutoFaceCrop}
              onRefreshData={fetchData}
              onUpdatePeriodStatus={handleUpdatePeriodStatus}
              onClosePeriod={handleClosePeriod}
              onOpenStudentCentral={(std) => handleOpenStudentCentral(std, 'Voltar para Produção')}
              initialStudentId={timelineInitialStudentId}
              initialStatusFilter="all"
            />
          )}

          {activeTab === 'batch_print' && (
            <GenerateTimeline
              students={students}
              records={records}
              classes={classes}
              models={[activeLayoutModel]}
              schoolConfig={schoolConfig}
              timelines={timelines}
              periods={periods}
              onSaveTimeline={handleSaveTimeline}
              onDeleteTimeline={handleDeleteTimeline}
              onUpdateRecordCrop={handleUpdateRecordCrop}
              onBatchAutoFaceCrop={handleBatchAutoFaceCrop}
              onRefreshData={fetchData}
              onUpdatePeriodStatus={handleUpdatePeriodStatus}
              onClosePeriod={handleClosePeriod}
              onOpenStudentCentral={(std) => handleOpenStudentCentral(std, 'Voltar para Impressão')}
              initialStudentId={timelineInitialStudentId}
              initialStatusFilter="ready_for_print"
            />
          )}

          {activeTab === 'generated_timelines' && (
            <GenerateTimeline
              students={students}
              records={records}
              classes={classes}
              models={[activeLayoutModel]}
              schoolConfig={schoolConfig}
              timelines={timelines}
              periods={periods}
              onSaveTimeline={handleSaveTimeline}
              onDeleteTimeline={handleDeleteTimeline}
              onUpdateRecordCrop={handleUpdateRecordCrop}
              onBatchAutoFaceCrop={handleBatchAutoFaceCrop}
              onRefreshData={fetchData}
              onUpdatePeriodStatus={handleUpdatePeriodStatus}
              onClosePeriod={handleClosePeriod}
              onOpenStudentCentral={(std) => handleOpenStudentCentral(std, 'Voltar para Composições Salvas')}
              initialStudentId={timelineInitialStudentId}
              initialStatusFilter="saved"
            />
          )}

          {(activeTab === 'settings' ||
            activeTab === 'school_settings' ||
            activeTab === 'layout_models' ||
            activeTab === 'classes' ||
            activeTab === 'periods' ||
            activeTab === 'backup_security' ||
            activeTab === 'account_settings') && (
            <SettingsDashboard
              initialCategory={
                activeTab === 'account_settings'
                  ? 'account'
                  : activeTab === 'layout_models'
                  ? 'model'
                  : activeTab === 'classes'
                  ? 'classes'
                  : activeTab === 'periods'
                  ? 'periods'
                  : activeTab === 'backup_security'
                  ? 'backup'
                  : 'school'
              }
              schoolConfig={schoolConfig}
              onSaveSchoolConfig={handleSaveSchoolConfig}
              activeLayoutModel={activeLayoutModel}
              onSaveLayoutModel={handleSaveLayoutModel}
              models={models}
              classes={classes}
              onUpdateClass={handleUpdateClass}
              onReorderClasses={handleReorderClasses}
              onResetClassesOrder={handleResetClassesOrder}
              onAddClass={handleAddClass}
              onDeleteClass={handleDeleteClass}
              periods={periods}
              onAddPeriod={handleAddPeriod}
              onTogglePeriodActive={handleTogglePeriodActive}
              students={students}
              records={records}
              timelines={timelines}
              onDataRestored={fetchData}
            />
          )}
        </main>
        <Footer />
      </div>
    </div>

      {/* B.25 / B.28.2 Central de Gestão do Aluno (Ficha Completa Única) */}
      {isCentralModalOpen && centralStudent && (
        <StudentCentralModal
          isOpen={isCentralModalOpen}
          student={centralStudent}
          records={records}
          classes={classes}
          timelines={timelines}
          periods={periods}
          schoolConfig={schoolConfig}
          originLabel={centralOriginLabel}
          onClose={() => setIsCentralModalOpen(false)}
          onNavigateToTimeline={(studentId) => {
            setIsCentralModalOpen(false);
            setTimelineInitialStudentId(studentId);
            setActiveTab('generate_timeline');
          }}
          onNavigateToReview={(_studentId) => {
            setIsCentralModalOpen(false);
            setActiveTab('generate_timeline');
          }}
          onNavigateToConfirmPeriod={(std) => {
            setIsCentralModalOpen(false);
            setPreselectedConfirmStudent(std);
            setActiveTab('confirm_period');
          }}
          onConfirmStudentPeriod={handleConfirmStudentPeriod}
          onUpdateRecordPhoto={handleUpdateRecordPhoto}
          onUpdateRecordCrops={handleUpdateRecordCrops}
        />
      )}

      {/* B.26 Pesquisa Global de Alunos */}
      {isGlobalSearchOpen && (
        <GlobalSearchModal
          isOpen={isGlobalSearchOpen}
          onClose={() => setIsGlobalSearchOpen(false)}
          students={students}
          records={records}
          classes={classes}
          timelines={timelines}
          periods={periods}
          schoolConfig={schoolConfig}
          onOpenStudentCentral={(std) => {
            setIsGlobalSearchOpen(false);
            handleOpenStudentCentral(std, 'Voltar para Pesquisa');
          }}
          onOpenTimeline={(studentId) => {
            setIsGlobalSearchOpen(false);
            setTimelineInitialStudentId(studentId);
            setActiveTab('generate_timeline');
          }}
          onOpenReview={(studentId) => {
            setIsGlobalSearchOpen(false);
            setTimelineInitialStudentId(studentId);
            setActiveTab('generate_timeline');
          }}
          onConfirmPeriod={(std) => {
            setIsGlobalSearchOpen(false);
            setPreselectedConfirmStudent(std);
            setActiveTab('confirm_period');
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
