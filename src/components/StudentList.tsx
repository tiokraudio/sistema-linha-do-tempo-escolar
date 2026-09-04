import React, { useState, useMemo } from 'react';
import {
  Student,
  AcademicYearRecord,
  ClassRecord,
  AcademicPeriod,
  CropSettings,
  GeneratedTimeline,
  PersonType,
} from '../types';
import {
  Search,
  UserPlus,
  UserCheck,
  Briefcase,
  Edit2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Calendar,
  CheckCircle2,
  AlertCircle,
  User,
} from 'lucide-react';
import { BatchImportStudentsModal } from './BatchImportStudentsModal';
import { BatchImportCollaboratorsModal } from './BatchImportCollaboratorsModal';
import { ConfirmStudentEnrollmentModal } from './ConfirmStudentEnrollmentModal';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { FormField, inputClasses } from './ui/FormField';
import { PageHeader } from './ui/PageHeader';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { getActiveAcademicYear } from '../utils/academicYears';

interface StudentListProps {
  personType?: PersonType; // 'student' (padrão) ou 'collaborator'
  students: Student[];
  records: AcademicYearRecord[];
  classes?: ClassRecord[];
  periods?: AcademicPeriod[];
  timelines?: GeneratedTimeline[];
  onOpenStudentCentral?: (student: Student) => void;
  onConfirmStudentPeriod?: (payload: {
    year: string | number;
    enrollment: string;
    name?: string;
    className: string;
    photoUrl?: string;
    cropSettings?: CropSettings;
    personType?: PersonType;
  }) => Promise<void>;
  onRegisterCollaboratorPeriod?: (payload: {
    studentId: string;
    year: string | number;
    photoUrl?: string;
    cropSettings?: CropSettings;
  }) => Promise<any>;
  onDeleteRecord?: (recordId: string) => Promise<void>;
  onUpdateRecordCrops?: (
    recordId: string,
    crops: {
      timelinePrimaryCrop?: CropSettings;
      timelineSecondaryCrop?: CropSettings;
      carometroCrop?: CropSettings;
    }
  ) => Promise<any>;
  onAddStudent: (data: { enrollment: string; name: string; personType?: PersonType }) => Promise<void>;
  onEditStudent: (id: string, data: { enrollment: string; name: string; personType?: PersonType }) => Promise<void>;
  onDeleteStudent?: (id: string) => Promise<void>;
  onDataReload?: () => Promise<void>;
}

export const StudentList: React.FC<StudentListProps> = ({
  personType = 'student',
  students,
  records,
  classes = [],
  periods = [],
  timelines = [],
  onConfirmStudentPeriod,
  onRegisterCollaboratorPeriod,
  onDeleteRecord,
  onUpdateRecordCrops,
  onAddStudent,
  onEditStudent,
  onDataReload,
}) => {
  const isCollaboratorMode = personType === 'collaborator';
  const [searchQuery, setSearchQuery] = useState('');

  // Identificar o período letivo ativo oficial
  const currentActivePeriodName = useMemo(() => {
    return getActiveAcademicYear(periods) || '';
  }, [periods]);

  // Modal State (Creation & Edition)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [formEnrollment, setFormEnrollment] = useState('');
  const [formName, setFormName] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirm Enrollment Modal State
  const [confirmingStudent, setConfirmingStudent] = useState<Student | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Success Feedback Toast
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const showToast = (message: string) => {
    setSuccessToast(message);
  };

  const handleOpenNewModal = () => {
    setEditingStudent(null);
    setFormEnrollment('');
    setFormName('');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (student: Student) => {
    const hasSavedComposition = timelines.some(
      (t) =>
        t.studentId === student.id ||
        (student.enrollment && t.studentEnrollment === student.enrollment)
    );
    if (hasSavedComposition) {
      return;
    }
    setEditingStudent(student);
    setFormEnrollment(student.enrollment);
    setFormName(student.name);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingStudent(null);
    setFormEnrollment('');
    setFormName('');
    setFormError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanEnrollment = formEnrollment.trim();
    const cleanName = formName.trim().toUpperCase();

    if (!cleanEnrollment) {
      setFormError(isCollaboratorMode ? 'O código/matrícula é obrigatório.' : 'A matrícula é obrigatória.');
      return;
    }

    if (!cleanName) {
      setFormError('O nome completo é obrigatório.');
      return;
    }

    // Check uniqueness client side first (strict string comparison)
    const duplicate = students.find(
      (s) =>
        s.enrollment === cleanEnrollment &&
        (!editingStudent || s.id !== editingStudent.id)
    );

    if (duplicate) {
      setFormError(isCollaboratorMode ? 'Este código/matrícula já está cadastrado.' : 'Esta matrícula já está cadastrada.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingStudent) {
        await onEditStudent(editingStudent.id, {
          enrollment: cleanEnrollment,
          name: cleanName,
          personType,
        });
        showToast('Cadastro atualizado com sucesso.');
      } else {
        await onAddStudent({
          enrollment: cleanEnrollment,
          name: cleanName,
          personType,
        });
        showToast(isCollaboratorMode ? 'Colaborador cadastrado com sucesso.' : 'Aluno cadastrado com sucesso.');
        setSearchQuery('');
        setCurrentPage(1);
      }
      handleCloseModal();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter students strictly by personType and search query
  const contextualStudents = useMemo(() => {
    return students.filter((student) => {
      const studentType = student.personType || 'student';
      return studentType === personType;
    });
  }, [students, personType]);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return contextualStudents;
    return contextualStudents.filter((student) => {
      return (
        student.name.toLowerCase().includes(query) ||
        student.enrollment.toLowerCase().includes(query)
      );
    });
  }, [contextualStudents, searchQuery]);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage) || 1;
  const paginatedStudents = useMemo(() => {
    return filteredStudents.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredStudents, currentPage, itemsPerPage]);

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {successToast && (
        <Toast message={successToast} onClose={() => setSuccessToast(null)} />
      )}

      {/* Page Header */}
      <PageHeader
        title={isCollaboratorMode ? 'Colaboradores' : 'Alunos'}
        subtitle={
          isCollaboratorMode
            ? 'Gestão de colaboradores e histórico de períodos letivos.'
            : 'Gestão de alunos e histórico de matrículas.'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="md"
              icon={isCollaboratorMode ? Briefcase : UserPlus}
              onClick={handleOpenNewModal}
            >
              {isCollaboratorMode ? 'Novo colaborador' : 'Novo aluno'}
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={FileSpreadsheet}
              onClick={() => setIsImportModalOpen(true)}
            >
              {isCollaboratorMode ? 'Importar colaboradores' : 'Importar alunos'}
            </Button>
          </div>
        }
      />

      {/* Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={
              isCollaboratorMode
                ? 'Buscar colaborador por nome ou código...'
                : 'Buscar aluno por nome ou matrícula...'
            }
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium shrink-0">
          Total: <strong>{contextualStudents.length}</strong> {isCollaboratorMode ? 'colaborador(es)' : 'aluno(s)'}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        {contextualStudents.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            {isCollaboratorMode ? (
              <Briefcase className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            ) : (
              <User className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            )}
            <p className="font-semibold text-slate-800 text-sm">
              {isCollaboratorMode ? 'Nenhum colaborador cadastrado.' : 'Nenhum aluno cadastrado.'}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={isCollaboratorMode ? Briefcase : UserPlus}
                onClick={handleOpenNewModal}
              >
                {isCollaboratorMode ? 'Novo colaborador' : 'Novo aluno'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={FileSpreadsheet}
                onClick={() => setIsImportModalOpen(true)}
              >
                {isCollaboratorMode ? 'Importar colaboradores' : 'Importar alunos'}
              </Button>
            </div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-medium text-slate-800 text-sm">
              {isCollaboratorMode ? 'Nenhum colaborador encontrado.' : 'Nenhum aluno encontrado.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 w-14 text-center">Foto</th>
                  <th className="px-5 py-3">{isCollaboratorMode ? 'Código / Matrícula' : 'Matrícula'}</th>
                  <th className="px-5 py-3">Nome completo</th>
                  {isCollaboratorMode ? (
                    <th className="px-5 py-3">Período Ativo / Status</th>
                  ) : (
                    <th className="px-5 py-3">Turma ({currentActivePeriodName || 'Período Ativo'})</th>
                  )}
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedStudents.map((student) => {
                  const hasSavedComposition = timelines.some(
                    (t) =>
                      t.studentId === student.id ||
                      (student.enrollment && t.studentEnrollment === student.enrollment)
                  );

                  // Vínculo no período ativo
                  const activeRecord = currentActivePeriodName
                    ? records.find(
                        (r) => r.studentId === student.id && String(r.year) === String(currentActivePeriodName)
                      )
                    : null;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Foto / Miniatura */}
                      <td className="px-4 py-3 text-center">
                        {activeRecord?.photoUrl ? (
                          <img
                            src={activeRecord.photoUrl}
                            alt={student.name}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 mx-auto shadow-2xs"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                      </td>

                      {/* Matrícula / Código */}
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {student.enrollment}
                      </td>

                      {/* Nome completo */}
                      <td className="px-5 py-3 font-medium text-slate-800 max-w-[280px]">
                        <div
                          className={`break-words line-clamp-2 ${
                            student.name.length > 30 ? 'text-xs leading-snug' : 'text-sm leading-normal'
                          }`}
                          title={student.name}
                        >
                          {student.name}
                        </div>
                      </td>

                      {/* Status / Período Ativo (Colaborador) OU Turma (Aluno) */}
                      {isCollaboratorMode ? (
                        <td className="px-5 py-3">
                          {activeRecord ? (
                            <Badge variant="success" size="sm">
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Ativo em {currentActivePeriodName}</span>
                              </span>
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              <span className="flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 text-slate-400" />
                                <span>Sem período em {currentActivePeriodName || '—'}</span>
                              </span>
                            </Badge>
                          )}
                        </td>
                      ) : (
                        <td className="px-5 py-3 font-semibold text-slate-700">
                          {activeRecord?.className ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>{activeRecord.className}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal italic">
                              Não matriculado em {currentActivePeriodName || '—'}
                            </span>
                          )}
                        </td>
                      )}

                      {/* Ações */}
                      <td className="px-5 py-3 text-right space-x-1.5 whitespace-nowrap">
                        <Button
                          variant="primary"
                          size="sm"
                          icon={UserCheck}
                          onClick={() => {
                            setConfirmingStudent(student);
                            setIsConfirmModalOpen(true);
                          }}
                          title={isCollaboratorMode ? 'Registrar Período' : 'Confirmar Matrícula'}
                        >
                          {isCollaboratorMode ? 'Registrar período' : 'Confirmar matrícula'}
                        </Button>
                        <span
                          title={
                            hasSavedComposition
                              ? 'Possui composição salva. Exclua as composições antes de editar.'
                              : 'Editar cadastro'
                          }
                          className="inline-block"
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Edit2}
                            disabled={hasSavedComposition}
                            onClick={() => handleOpenEditModal(student)}
                          >
                            Editar
                          </Button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {filteredStudents.length > itemsPerPage && (
          <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <div>
              Página <span className="font-semibold">{currentPage}</span> de{' '}
              <span className="font-semibold">{totalPages}</span> ({filteredStudents.length}{' '}
              {isCollaboratorMode ? 'colaboradores' : 'alunos'})
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 bg-white border border-slate-200 rounded-md disabled:opacity-40 cursor-pointer hover:bg-slate-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 bg-white border border-slate-200 rounded-md disabled:opacity-40 cursor-pointer hover:bg-slate-50"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: New / Edit Student or Collaborator */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={
          editingStudent
            ? isCollaboratorMode
              ? 'Editar Colaborador'
              : 'Editar Aluno'
            : isCollaboratorMode
            ? 'Novo Colaborador'
            : 'Novo Aluno'
        }
        footer={
          <>
            <Button variant="secondary" size="md" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              isLoading={isSubmitting}
            >
              Salvar
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <Alert variant="error">{formError}</Alert>}

          <FormField
            label={isCollaboratorMode ? 'Código / Matrícula do Colaborador' : 'Matrícula'}
            required
            error={formError && (formError.includes('matrícula') || formError.includes('código')) ? formError : undefined}
          >
            <input
              type="text"
              value={formEnrollment}
              onChange={(e) => {
                const clean = isCollaboratorMode ? e.target.value.trim().toUpperCase() : e.target.value.replace(/\D/g, '');
                setFormEnrollment(clean);
              }}
              placeholder={isCollaboratorMode ? 'Ex: COLAB001 ou 202601' : 'Somente números (Ex: 20260001)'}
              className={inputClasses}
              autoFocus
            />
          </FormField>

          <FormField
            label={isCollaboratorMode ? 'Nome completo do colaborador' : 'Nome completo'}
            required
          >
            <input
              type="text"
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value.toUpperCase());
              }}
              placeholder={isCollaboratorMode ? 'Ex: MARIA SILVA' : 'Ex: JOÃO DA SILVA'}
              className={inputClasses}
            />
          </FormField>
        </form>
      </Modal>

      {/* Batch Import Students & Enrollments Modal (Apenas para Alunos) */}
      {!isCollaboratorMode && isImportModalOpen && (
        <BatchImportStudentsModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          periods={periods}
          classes={classes}
          students={students}
          records={records}
          onImportSuccess={async () => {
            if (onDataReload) {
              await onDataReload();
            }
            showToast('Importação de alunos processada com sucesso.');
          }}
        />
      )}

      {/* Batch Import Collaborators Modal (Apenas para Colaboradores) */}
      {isCollaboratorMode && isImportModalOpen && (
        <BatchImportCollaboratorsModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          periods={periods || []}
          students={students}
          records={records || []}
          onImportSuccess={async () => {
            if (onDataReload) {
              await onDataReload();
            }
            showToast('Importação de colaboradores processada com sucesso.');
          }}
        />
      )}

      {/* Confirm Student / Collaborator Enrollment Modal */}
      {isConfirmModalOpen && confirmingStudent && (
        <ConfirmStudentEnrollmentModal
          isOpen={isConfirmModalOpen}
          student={confirmingStudent}
          records={records}
          periods={periods}
          timelines={timelines}
          classes={classes}
          onClose={() => {
            setIsConfirmModalOpen(false);
            setConfirmingStudent(null);
          }}
          onConfirmStudentPeriod={onConfirmStudentPeriod || (async () => {})}
          onRegisterCollaboratorPeriod={onRegisterCollaboratorPeriod}
          onDeleteRecord={onDeleteRecord}
          onUpdateRecordCrops={onUpdateRecordCrops}
          onSuccess={(msg) => showToast(msg)}
        />
      )}
    </div>
  );
};
