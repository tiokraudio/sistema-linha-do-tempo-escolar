import { getActiveAcademicYear } from '../src/utils/academicYears';
import { AcademicPeriod, AcademicYearRecord, Student } from '../src/types';

function runTests() {
  console.log('=== TESTES DE INTEGRAÇÃO DAS REGRAS DE MATRÍCULA / REGISTRO NA FICHA ===');

  const activePeriod: AcademicPeriod = {
    id: 'p1',
    name: '2026',
    active: true,
    status: 'in_production',
    createdAt: '2026-01-01',
  };

  const inactivePeriod: AcademicPeriod = {
    id: 'p0',
    name: '2025',
    active: false,
    status: 'closed',
    createdAt: '2025-01-01',
  };

  // Teste 1: Detecção de período acadêmico ativo
  const activeYear = getActiveAcademicYear([inactivePeriod, activePeriod]);
  if (activeYear !== '2026') {
    throw new Error(`Falha no Teste 1: esperado '2026', obtido '${activeYear}'`);
  }
  console.log('✅ Teste 1: Período letivo ativo identificado corretamente como 2026.');

  // Teste 2: Se não houver período ativo, retorna null/indisponível sem inventar ano
  const noActiveYear = getActiveAcademicYear([inactivePeriod]);
  if (noActiveYear !== null) {
    throw new Error(`Falha no Teste 2: esperado null quando nenhum ativo, obtido '${noActiveYear}'`);
  }
  console.log('✅ Teste 2: Ausência de período ativo retorna null sem inventar ano corrente.');

  // Teste 3: Aluno verificação de matrícula no período ativo
  const student: Student = {
    id: 's1',
    enrollment: 'A001',
    name: 'Aluno Teste',
    personType: 'student',
    createdAt: '2025-01-01',
  };

  const recordsBefore: AcademicYearRecord[] = [
    {
      id: 'r1',
      studentId: 's1',
      year: '2025',
      className: '1A',
      photoUrl: '',
      createdAt: '2025-02-01',
    },
  ];

  const isStudentRegisteredBefore = recordsBefore.some(
    (r) => r.studentId === student.id && String(r.year) === String(activeYear)
  );
  if (isStudentRegisteredBefore) {
    throw new Error('Falha no Teste 3: Aluno não deveria constar como matriculado em 2026 antes da confirmação');
  }
  console.log('✅ Teste 3: Aluno detectado como NÃO matriculado no período ativo 2026.');

  // Teste 4: Registro pós-confirmação
  const recordsAfter: AcademicYearRecord[] = [
    ...recordsBefore,
    {
      id: 'r2',
      studentId: 's1',
      year: '2026',
      className: '2A',
      photoUrl: '',
      createdAt: '2026-02-01',
    },
  ];

  const isStudentRegisteredAfter = recordsAfter.some(
    (r) => r.studentId === student.id && String(r.year) === String(activeYear)
  );
  if (!isStudentRegisteredAfter) {
    throw new Error('Falha no Teste 4: Aluno deveria constar como matriculado em 2026');
  }
  console.log('✅ Teste 4: Aluno detectado com matrícula confirmada em 2026.');

  // Teste 5: Colaborador com e sem registro no período ativo
  const collaborator: Student = {
    id: 'c1',
    enrollment: 'COLAB01',
    name: 'Professor Teste',
    personType: 'collaborator',
    createdAt: '2025-01-01',
  };

  const isCollabRegisteredBefore = recordsBefore.some(
    (r) => r.studentId === collaborator.id && String(r.year) === String(activeYear)
  );
  if (isCollabRegisteredBefore) {
    throw new Error('Falha no Teste 5: Colaborador não deveria constar como registrado em 2026');
  }
  console.log('✅ Teste 5: Colaborador detectado como NÃO registrado no período ativo 2026.');

  const collabRecordsAfter: AcademicYearRecord[] = [
    {
      id: 'r3',
      studentId: 'c1',
      year: '2026',
      className: '', // Colaboradores não têm turma
      photoUrl: '',
      createdAt: '2026-02-01',
    },
  ];
  const isCollabRegisteredAfter = collabRecordsAfter.some(
    (r) => r.studentId === collaborator.id && String(r.year) === String(activeYear)
  );
  if (!isCollabRegisteredAfter) {
    throw new Error('Falha no Teste 6: Colaborador deveria constar como registrado em 2026');
  }
  console.log('✅ Teste 6: Colaborador detectado com período registrado em 2026.');

  console.log('=== TODOS OS TESTES FORAM CONCLUÍDOS COM SUCESSO! ===');
}

runTests();
