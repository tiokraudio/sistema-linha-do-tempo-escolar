import * as XLSX from 'xlsx';
import { Student, AcademicYearRecord, ClassRecord, AcademicPeriod } from '../types';
import { validateStudentProgression, getPedagogicalPosition, getPedagogicalLabel } from './pedagogicalStructure';

export interface RawImportRow {
  rowIndex: number;
  enrollment: string;
  name: string;
  className: string;
}

export interface ImportPreviewItem {
  id: string;
  rowIndex: number;
  enrollment: string;
  name: string;
  className: string;
  status: 'new_student' | 'new_record' | 'already_enrolled' | 'error';
  statusLabel: string;
  message?: string;
  isExistingStudent: boolean;
  isAlreadyEnrolled: boolean;
  isValid: boolean;
}

export interface BatchImportSummary {
  totalRows: number;
  newStudentsCount: number;
  newRecordsCount: number;
  alreadyEnrolledCount: number;
  errorsCount: number;
  validCount: number;
}

/**
 * Gera e realiza o download do arquivo modelo XLSX formatado com texto e instruções.
 */
export function generateImportTemplateXLSX(activeClasses: ClassRecord[]): void {
  const wb = XLSX.utils.book_new();

  // 1. Aba Principal de Dados ("Alunos")
  const sampleClasses = activeClasses.length > 0
    ? activeClasses
    : [
        { name: '1º Ano', stageName: 'Ensino Fundamental' },
        { name: '2º Ano', stageName: 'Ensino Fundamental' },
        { name: '5º Ano', stageName: 'Ensino Fundamental' },
      ];

  const c1 = sampleClasses[0]?.name || '5º Ano';
  const c2 = sampleClasses[1]?.name || c1;
  const c3 = sampleClasses[2]?.name || c1;

  const dataRows = [
    ['Matrícula', 'Nome completo', 'Turma'],
    ['000123', 'JOÃO DA SILVA', c1],
    ['000124', 'MARIA SOUZA', c1],
    ['000125', 'PEDRO SANTOS', c2],
    ['000126', 'ANA CAROLINA LIMA', c3],
  ];

  const wsData = XLSX.utils.aoa_to_sheet(dataRows);

  // Configurar largura das colunas
  wsData['!cols'] = [
    { wch: 18 }, // Matrícula
    { wch: 38 }, // Nome completo
    { wch: 28 }, // Turma
  ];

  // Forçar células da coluna Matrícula (A) como tipo TEXTO ('s') com formato '@'
  for (let r = 1; r < dataRows.length; r++) {
    const cellRef = XLSX.utils.encode_cell({ r, c: 0 });
    if (wsData[cellRef]) {
      wsData[cellRef].t = 's';
      wsData[cellRef].z = '@';
    }
  }

  XLSX.utils.book_append_sheet(wb, wsData, 'Alunos');

  // 2. Aba de Instruções e Turmas Ativas ("INSTRUÇÕES")
  const instructionsData: (string | number)[][] = [
    ['INSTRUÇÕES PARA PREENCHIMENTO DO MODELO DE IMPORTAÇÃO'],
    [''],
    ['1. MATRÍCULA (Obrigatório):'],
    ['   - Preencha o número de matrícula do aluno utilizando apenas dígitos numéricos.'],
    ['   - A matrícula é tratada estritamente como TEXTO pelo sistema.'],
    ['   - Zeros à esquerda são 100% preservados (ex: 000123, 00123 e 123 são identificadores distintos).'],
    [''],
    ['2. NOME COMPLETO (Obrigatório):'],
    ['   - Informe o nome completo do aluno.'],
    [''],
    ['3. TURMA (Obrigatório):'],
    ['   - Informe a turma em que o aluno será matriculado no período selecionado.'],
    ['   - A turma DEVE corresponder exatamente ao nome de uma turma ATIVA configurada no sistema.'],
    [''],
    ['4. PERÍODO LETIVO:'],
    ['   - Não inclua coluna de ano na planilha. O período letivo é selecionado diretamente no sistema antes do envio.'],
    [''],
    ['5. REGRAS GERAIS:'],
    ['   - Não altere o nome das colunas do cabeçalho da primeira aba.'],
    ['   - Alunos com a mesma matrícula já cadastrada no sistema não serão duplicados.'],
    ['   - Se o aluno já estiver cadastrado mas sem matrícula no ano, será criada a nova matrícula.'],
    ['   - Se o aluno já estiver matriculado no período, a linha será identificada como "Já matriculado".'],
    ['   - A fotografia fica pendente para posterior envio na Ficha do Aluno ou Central de Fotografias.'],
    [''],
    ['----------------------------------------------------------------------------------------------------'],
    ['LISTA DE TURMAS ATIVAS NO SISTEMA PARA ESTA INSTITUIÇÃO:'],
    ['Ordem', 'Nome da Turma', 'Etapa Escolar', 'Status'],
  ];

  if (activeClasses.length > 0) {
    activeClasses.forEach((cls, idx) => {
      instructionsData.push([
        idx + 1,
        cls.name,
        cls.stageName || cls.stage || 'Geral',
        'Ativa',
      ]);
    });
  } else {
    instructionsData.push([1, 'Nenhuma turma cadastrada ou ativa', '-', '-']);
  }

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
  wsInstructions['!cols'] = [
    { wch: 10 },
    { wch: 38 },
    { wch: 30 },
    { wch: 15 },
  ];

  XLSX.utils.book_append_sheet(wb, wsInstructions, 'INSTRUÇÕES');

  // Disparar download no navegador
  XLSX.writeFile(wb, 'modelo_importacao_alunos.xlsx');
}

/**
 * Lê e analisa o arquivo XLSX enviado pelo usuário preservando matrículas como texto.
 */
export async function parseXLSXFile(file: File): Promise<RawImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) {
          throw new Error('Arquivo vazio ou ilegível.');
        }

        const workbook = XLSX.read(buffer, {
          type: 'array',
          cellDates: false,
          raw: false, // Preserva strings formatadas com zeros à esquerda
        });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('A planilha não contém abas.');
        }

        // Usar a primeira aba ou aba que contenha 'aluno'
        const targetSheetName =
          workbook.SheetNames.find((name) =>
            name.toLowerCase().includes('aluno') || name.toLowerCase().includes('dados')
          ) || workbook.SheetNames[0];

        const sheet = workbook.Sheets[targetSheetName];
        if (!sheet) {
          throw new Error('Não foi possível ler os dados da planilha.');
        }

        // Converter matriz bruta com valores de texto
        const rawGrid: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: false,
          defval: '',
        });

        if (!rawGrid || rawGrid.length === 0) {
          throw new Error('A planilha está vazia.');
        }

        // Identificar linha do cabeçalho
        let headerRowIndex = -1;
        let colEnrollment = -1;
        let colName = -1;
        let colClass = -1;

        for (let r = 0; r < Math.min(rawGrid.length, 10); r++) {
          const row = rawGrid[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const cellText = String(row[c] || '').trim().toLowerCase();
            const cellNorm = cellText.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

            if (
              colEnrollment === -1 &&
              (cellNorm.includes('matricula') || cellNorm === 'mat' || cellNorm.includes('ra') || cellNorm === 'id')
            ) {
              colEnrollment = c;
            } else if (
              colName === -1 &&
              (cellNorm.includes('nome') || cellNorm.includes('aluno') || cellNorm.includes('estudante'))
            ) {
              colName = c;
            } else if (
              colClass === -1 &&
              (cellNorm.includes('turma') || cellNorm.includes('serie') || cellNorm.includes('ano'))
            ) {
              colClass = c;
            }
          }

          if (colEnrollment !== -1 && colName !== -1 && colClass !== -1) {
            headerRowIndex = r;
            break;
          }
        }

        // Fallback para posições padrão 0, 1, 2 se cabeçalho não foi encontrado por texto
        if (headerRowIndex === -1) {
          headerRowIndex = 0;
          colEnrollment = 0;
          colName = 1;
          colClass = 2;
        }

        const rows: RawImportRow[] = [];

        for (let r = headerRowIndex + 1; r < rawGrid.length; r++) {
          const row = rawGrid[r];
          if (!Array.isArray(row)) continue;

          const rawEnrollment = row[colEnrollment] !== undefined ? String(row[colEnrollment]).trim() : '';
          const rawName = row[colName] !== undefined ? String(row[colName]).trim() : '';
          const rawClass = row[colClass] !== undefined ? String(row[colClass]).trim() : '';

          // Ignorar linhas totalmente em branco
          if (!rawEnrollment && !rawName && !rawClass) {
            continue;
          }

          rows.push({
            rowIndex: r + 1, // 1-indexed para o usuário
            enrollment: rawEnrollment,
            name: rawName,
            className: rawClass,
          });
        }

        if (rows.length === 0) {
          throw new Error('Nenhum registro de aluno foi encontrado na planilha.');
        }

        resolve(rows);
      } catch (err: any) {
        reject(new Error(err.message || 'Erro ao processar arquivo XLSX.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo selecionado.'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Valida a lista de linhas importadas contra as regras de negócio, turmas ativas e histórico escolar.
 */
export function validateImportRows(
  rows: RawImportRow[],
  targetPeriod: string,
  activeClasses: ClassRecord[],
  students: Student[],
  records: AcademicYearRecord[]
): {
  items: ImportPreviewItem[];
  summary: BatchImportSummary;
} {
  const cleanTargetPeriod = String(targetPeriod).trim();
  const seenEnrollments = new Set<string>();

  let newStudentsCount = 0;
  let newRecordsCount = 0;
  let alreadyEnrolledCount = 0;
  let errorsCount = 0;
  let validCount = 0;

  const items: ImportPreviewItem[] = [];

  for (const row of rows) {
    const rawEnrollment = String(row.enrollment || '').trim();
    const rawName = String(row.name || '').trim().toUpperCase();
    const rawClass = String(row.className || '').trim();

    // 1. Validação de Matrícula preenchida
    if (!rawEnrollment) {
      errorsCount++;
      items.push({
        id: `row_${row.rowIndex}_${Math.random()}`,
        rowIndex: row.rowIndex,
        enrollment: '—',
        name: rawName || '—',
        className: rawClass || '—',
        status: 'error',
        statusLabel: 'Erro',
        message: 'Matrícula não informada.',
        isExistingStudent: false,
        isAlreadyEnrolled: false,
        isValid: false,
      });
      continue;
    }

    // 2. Matrícula numérica estrita como string
    if (!/^\d+$/.test(rawEnrollment)) {
      errorsCount++;
      items.push({
        id: `row_${row.rowIndex}_${rawEnrollment}`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment,
        name: rawName || '—',
        className: rawClass || '—',
        status: 'error',
        statusLabel: 'Erro',
        message: 'A matrícula deve conter apenas números (preservando formato texto).',
        isExistingStudent: false,
        isAlreadyEnrolled: false,
        isValid: false,
      });
      continue;
    }

    // 3. Duplicidade na própria planilha
    if (seenEnrollments.has(rawEnrollment)) {
      errorsCount++;
      items.push({
        id: `row_${row.rowIndex}_${rawEnrollment}_dup`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment,
        name: rawName || '—',
        className: rawClass || '—',
        status: 'error',
        statusLabel: 'Erro',
        message: 'Matrícula repetida no mesmo arquivo de importação.',
        isExistingStudent: false,
        isAlreadyEnrolled: false,
        isValid: false,
      });
      continue;
    }
    seenEnrollments.add(rawEnrollment);

    // 4. Validação de Nome preenchido
    if (!rawName) {
      errorsCount++;
      items.push({
        id: `row_${row.rowIndex}_${rawEnrollment}`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment,
        name: '—',
        className: rawClass || '—',
        status: 'error',
        statusLabel: 'Erro',
        message: 'Nome completo não informado.',
        isExistingStudent: false,
        isAlreadyEnrolled: false,
        isValid: false,
      });
      continue;
    }

    // 5. Validação de Turma preenchida
    if (!rawClass) {
      errorsCount++;
      items.push({
        id: `row_${row.rowIndex}_${rawEnrollment}`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment,
        name: rawName,
        className: '—',
        status: 'error',
        statusLabel: 'Erro',
        message: 'Turma não informada.',
        isExistingStudent: false,
        isAlreadyEnrolled: false,
        isValid: false,
      });
      continue;
    }

    // 6. Turma existente e ATIVA
    const matchedClass = activeClasses.find((c) => {
      if (c.active === false) return false;
      const cNorm = c.name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const rNorm = rawClass.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return cNorm === rNorm || c.name.trim().toLowerCase() === rawClass.trim().toLowerCase() || c.id === rawClass;
    });

    if (!matchedClass) {
      errorsCount++;
      items.push({
        id: `row_${row.rowIndex}_${rawEnrollment}`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment,
        name: rawName,
        className: rawClass,
        status: 'error',
        statusLabel: 'Erro',
        message: 'Turma não encontrada ou inativa no sistema.',
        isExistingStudent: false,
        isAlreadyEnrolled: false,
        isValid: false,
      });
      continue;
    }

    const canonicalClassName = matchedClass.name;

    // 7. Checagem de aluno existente
    const existingStudent = students.find((s) => s.enrollment === rawEnrollment);

    if (existingStudent) {
      // Registros do aluno
      const studentRecords = records.filter((r) => r.studentId === existingStudent.id);
      const recordInTargetYear = studentRecords.find((r) => String(r.year) === cleanTargetPeriod);

      if (recordInTargetYear) {
        // Já matriculado neste ano (Situação normal/informativa)
        alreadyEnrolledCount++;
        validCount++;
        items.push({
          id: `row_${row.rowIndex}_${rawEnrollment}`,
          rowIndex: row.rowIndex,
          enrollment: rawEnrollment,
          name: existingStudent.name,
          className: recordInTargetYear.className,
          status: 'already_enrolled',
          statusLabel: 'Já matriculado',
          message: `Aluno já matriculado em ${cleanTargetPeriod} na turma ${recordInTargetYear.className}.`,
          isExistingStudent: true,
          isAlreadyEnrolled: true,
          isValid: true,
        });
      } else {
        // Validação da progressão pedagógica
        const progressionCheck = validateStudentProgression(
          cleanTargetPeriod,
          canonicalClassName,
          studentRecords
        );

        if (!progressionCheck.isValid) {
          errorsCount++;
          items.push({
            id: `row_${row.rowIndex}_${rawEnrollment}`,
            rowIndex: row.rowIndex,
            enrollment: rawEnrollment,
            name: existingStudent.name,
            className: canonicalClassName,
            status: 'error',
            statusLabel: 'Erro',
            message: progressionCheck.errorMessage || 'Progressão escolar inválida.',
            isExistingStudent: true,
            isAlreadyEnrolled: false,
            isValid: false,
          });
        } else {
          newRecordsCount++;
          validCount++;
          items.push({
            id: `row_${row.rowIndex}_${rawEnrollment}`,
            rowIndex: row.rowIndex,
            enrollment: rawEnrollment,
            name: existingStudent.name,
            className: canonicalClassName,
            status: 'new_record',
            statusLabel: 'Nova matrícula',
            message: 'Aluno já cadastrado. Será confirmada a nova matrícula.',
            isExistingStudent: true,
            isAlreadyEnrolled: false,
            isValid: true,
          });
        }
      }
    } else {
      // Aluno novo: cria aluno + matrícula
      newStudentsCount++;
      validCount++;
      items.push({
        id: `row_${row.rowIndex}_${rawEnrollment}`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment,
        name: rawName,
        className: canonicalClassName,
        status: 'new_student',
        statusLabel: 'Novo aluno',
        message: 'Novo aluno. Será cadastrado e matriculado com fotografia pendente.',
        isExistingStudent: false,
        isAlreadyEnrolled: false,
        isValid: true,
      });
    }
  }

  const summary: BatchImportSummary = {
    totalRows: rows.length,
    newStudentsCount,
    newRecordsCount,
    alreadyEnrolledCount,
    errorsCount,
    validCount,
  };

  return { items, summary };
}
