import React from 'react';
import { Student, AcademicYearRecord, GeneratedTimeline, ClassRecord, ActiveTab } from '../types';
import {
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  UserPlus,
  GraduationCap,
  Image as ImageIcon,
} from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

interface DashboardProps {
  currentYear: string | number;
  students: Student[];
  records: AcademicYearRecord[];
  classes: ClassRecord[];
  timelines: GeneratedTimeline[];
  setActiveTab: (tab: ActiveTab) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentYear,
  students,
  records,
  classes,
  timelines,
  setActiveTab,
}) => {
  const yearStr = currentYear ? String(currentYear) : '';

  // Calculate real metrics strictly for students (excluding collaborators)
  const studentsOnly = students.filter((s) => (s.personType || 'student') === 'student');
  const totalStudents = studentsOnly.length;

  const currentYearRecords = records.filter((r) => String(r.year) === yearStr);
  const confirmedStudentIds = new Set(currentYearRecords.map((r) => r.studentId));

  const confirmedStudents = studentsOnly.filter((s) => confirmedStudentIds.has(s.id));
  const confirmedCount = confirmedStudents.length;
  const pendingCount = totalStudents > 0 ? totalStudents - confirmedCount : 0;
  const totalClasses = classes.length;
  const totalPhotos = records.filter((r) => r.photoUrl && r.photoUrl.trim() !== '').length;
  const timelinesCount = timelines.length;

  const unconfirmedStudents = studentsOnly.filter((s) => !confirmedStudentIds.has(s.id));

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <PageHeader
        title="Painel de Controle"
        subtitle={yearStr ? `Período ativo: ${yearStr}` : 'Visão geral do sistema escolar'}
        actions={
          <Button
            variant="primary"
            size="md"
            icon={UserPlus}
            onClick={() => setActiveTab('confirm_period')}
          >
            Confirmar Matrícula
          </Button>
        }
      />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Total Cadastrados */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Total de Alunos
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-slate-900">{totalStudents}</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Cadastros ativos</p>
          </div>
        </div>

        {/* Confirmados no Ano */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Confirmados ({yearStr || 'Ano'})
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-emerald-600">{confirmedCount}</span>
            <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
              {totalStudents > 0 ? Math.round((confirmedCount / totalStudents) * 100) : 0}% registrados
            </p>
          </div>
        </div>

        {/* Não Confirmados no Ano */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Pendentes ({yearStr || 'Ano'})
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-amber-600">{pendingCount}</span>
            <p className="text-[11px] text-amber-700 font-medium mt-0.5">
              A confirmar
            </p>
          </div>
        </div>

        {/* Total de Turmas */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Total de Turmas
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <GraduationCap className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-blue-700">{totalClasses}</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Turmas registradas</p>
          </div>
        </div>

        {/* Total de Fotos */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Fotos do Histórico
            </span>
            <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
              <ImageIcon className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-teal-700">{totalPhotos}</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Registros com foto</p>
          </div>
        </div>

        {/* Linhas do Tempo Geradas */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Linhas do Tempo
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-purple-700">{timelinesCount}</span>
            <p className="text-[11px] text-slate-500 mt-0.5">Composições salvas</p>
          </div>
        </div>
      </div>

      {/* Main Grid Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Unconfirmed Students List */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Alunos pendentes de confirmação em {yearStr || 'período atual'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Alunos sem turma ou fotografia cadastrada no período ativo
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={ArrowRight}
                onClick={() => setActiveTab('confirm_period')}
              >
                Ver todos
              </Button>
            </div>

            {totalStudents === 0 ? (
              <div className="py-10 text-center text-slate-500">
                <Users className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-xs">Nenhum aluno cadastrado.</p>
                <p className="text-xs text-slate-400 mt-0.5">Cadastre alunos para iniciar as matrículas.</p>
              </div>
            ) : unconfirmedStudents.length === 0 ? (
              <div className="py-10 text-center text-slate-500">
                <CheckCircle2 className="w-9 h-9 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="font-semibold text-slate-700 text-xs">Todos os alunos estão confirmados para {yearStr}!</p>
                <p className="text-xs text-slate-400 mt-0.5">Nenhuma pendência para o período letivo ativo.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-2 max-h-80 overflow-y-auto pr-1">
                {unconfirmedStudents.map((std) => {
                  const stdRecords = records.filter((r) => r.studentId === std.id);
                  const lastRecord = stdRecords.length > 0 ? stdRecords[0] : null;

                  return (
                    <div
                      key={std.id}
                      className="py-2.5 flex items-center justify-between hover:bg-slate-50/80 px-2 rounded-lg transition-colors"
                    >
                      <div>
                        <h4 className="font-semibold text-slate-800 text-xs sm:text-sm">{std.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-500 font-mono">
                            Matrícula: {std.enrollment}
                          </span>
                          {lastRecord && (
                            <Badge variant="neutral" size="sm">
                              Último: {lastRecord.year}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveTab('confirm_period')}
                      >
                        Confirmar
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Administrative Shortcuts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between space-y-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Ações Rápidas
            </h3>

            <div className="space-y-2 mt-3.5">
              <button
                type="button"
                onClick={() => setActiveTab('confirm_period')}
                className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group cursor-pointer"
              >
                <div className="font-semibold text-slate-800 text-xs group-hover:text-blue-600 flex items-center justify-between">
                  <span>Confirmar Matrícula</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Registrar turma e foto para o período ativo</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('generate_timeline')}
                className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group cursor-pointer"
              >
                <div className="font-semibold text-slate-800 text-xs group-hover:text-blue-600 flex items-center justify-between">
                  <span>Produção e Editor A4</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Compor e gerar linhas do tempo fotográficas</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('classes')}
                className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group cursor-pointer"
              >
                <div className="font-semibold text-slate-800 text-xs group-hover:text-blue-600 flex items-center justify-between">
                  <span>Cadastro de Turmas</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Gerenciar turmas vinculadas ao período</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('periods')}
                className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors group cursor-pointer"
              >
                <div className="font-semibold text-slate-800 text-xs group-hover:text-blue-600 flex items-center justify-between">
                  <span>Períodos Letivos</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Gerenciar os anos letivos da instituição</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
