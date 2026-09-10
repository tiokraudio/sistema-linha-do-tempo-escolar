import ExcelJS from 'exceljs';
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
 * Utilitário seguro para extrair o valor de uma célula como texto puro,
 * preservando formatações com zeros à esquerda e sem executar código malicioso/fórmulas.
 */
export function extractCellValueAsString(cell: ExcelJS.Cell): string {
  if (cell.value === null || cell.value === undefined) {
    return '';
  }

  // Se o valor for string direta
  if (typeof cell.value === 'string') {
    return cell.value.trim();
  }

  // Se for número
  if (typeof cell.value === 'number') {
    // Se a célula possuir formatação com zeros (ex: '000000')
    const fmt = cell.numFmt;
    if (fmt && /^0+$/.test(fmt)) {
      return String(cell.value).padStart(fmt.length, '0');
    }
    return String(cell.value);
  }

  // Se for boolean
  if (typeof cell.value === 'boolean') {
    return String(cell.value);
  }

  // Se for Date
  if (cell.value instanceof Date) {
    return cell.value.toISOString().split('T')[0];
  }

  // Se for objeto (fórmula, rich text, hyperlink, etc.)
  if (typeof cell.value === 'object') {
    const obj = cell.value as any;

    // Rich Text
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((chunk: any) => chunk.text || '').join('').trim();
    }

    // Fórmula (usa o resultado já computado em cache, sem execução dinâmica)
    if ('result' in obj) {
      if (obj.result === null || obj.result === undefined) return '';
      if (typeof obj.result === 'object' && obj.result instanceof Date) {
        return obj.result.toISOString().split('T')[0];
      }
      return String(obj.result).trim();
    }

    // Hyperlink
    if ('text' in obj && typeof obj.text === 'string') {
      return obj.text.trim();
    }

    if ('hyperlink' in obj && typeof obj.hyperlink === 'string') {
      return obj.text ? String(obj.text).trim() : obj.hyperlink.trim();
    }
  }

  return String(cell.value).trim();
}

/**
 * Dispara o download de um workbook ExcelJS no navegador.
 */
async function triggerWorkbookDownload(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  if (typeof document !== 'undefined') {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/**
 * Constrói a estrutura do Workbook modelo XLSX para importação de alunos.
 * Isolado para permitir testes automatizados, inspeção e reuso.
 */
export function buildImportTemplateWorkbook(activeClasses: ClassRecord[] = []): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema Linha do Tempo Escolar';
  wb.created = new Date();

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

  const wsData = wb.addWorksheet('Alunos');

  // Configurar colunas e larguras
  wsData.columns = [
    { header: 'Matrícula', key: 'enrollment', width: 18 },
    { header: 'Nome completo', key: 'name', width: 38 },
    { header: 'Turma', key: 'className', width: 28 },
  ];

  const dataRows = [
    { enrollment: '000123', name: 'JOÃO DA SILVA', className: c1 },
    { enrollment: '000124', name: 'MARIA SOUZA', className: c1 },
    { enrollment: '000125', name: 'PEDRO SANTOS', className: c2 },
    { enrollment: '000126', name: 'ANA CAROLINA LIMA', className: c3 },
  ];

  dataRows.forEach((item) => {
    const row = wsData.addRow([item.enrollment, item.name, item.className]);
    // Forçar célula da coluna Matrícula (coluna 1 / A) como tipo TEXTO com formato '@'
    const cellEnrollment = row.getCell(1);
    cellEnrollment.value = item.enrollment;
    cellEnrollment.numFmt = '@';
  });

  // 2. Aba de Instruções e Turmas Ativas ("INSTRUÇÕES")
  const wsInstructions = wb.addWorksheet('INSTRUÇÕES');
  wsInstructions.columns = [
    { width: 10 },
    { width: 38 },
    { width: 30 },
    { width: 15 },
  ];

  const instructionsHeader = [
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

  instructionsHeader.forEach((line) => {
    wsInstructions.addRow(line);
  });

  if (activeClasses.length > 0) {
    activeClasses.forEach((cls, idx) => {
      wsInstructions.addRow([
        idx + 1,
        cls.name,
        cls.stageName || cls.stage || 'Geral',
        'Ativa',
      ]);
    });
  } else {
    wsInstructions.addRow([1, 'Nenhuma turma cadastrada ou ativa', '-', '-']);
  }

  return wb;
}

/**
 * Gera e realiza o download do arquivo modelo XLSX formatado com texto e instruções.
 */
export function generateImportTemplateXLSX(activeClasses: ClassRecord[]): void {
  const wb = buildImportTemplateWorkbook(activeClasses);
  // Disparar download no navegador
  triggerWorkbookDownload(wb, 'modelo_importacao_alunos.xlsx').catch(console.error);
}

/**
 * Lê e analisa o arquivo XLSX enviado pelo usuário preservando matrículas como texto.
 */
export async function parseXLSXFile(file: File): Promise<RawImportRow[]> {
  if (!file) {
    throw new Error('Nenhum arquivo fornecido para importação.');
  }

  // Limite de segurança contra DoS: max 10MB
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('O arquivo excede o limite máximo de tamanho permitido (10 MB).');
  }

  // Detecção precoce de arquivos .xls legados
  const fileNameLower = (file.name || '').toLowerCase();
  if (fileNameLower.endsWith('.xls') && !fileNameLower.endsWith('.xlsx')) {
    throw new Error(
      'Arquivos no formato legado .xls (Excel 97-2003) não são suportados por motivos de segurança. ' +
      'Por favor, abra a planilha no Microsoft Excel, Google Planilhas ou LibreOffice e salve-a como Pasta de Trabalho do Excel (.xlsx).'
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error('Erro ao ler o arquivo selecionado.');
  }

  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Arquivo vazio ou ilegível.');
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (err: any) {
    throw new Error('O arquivo selecionado não é uma planilha Excel (.xlsx) válida ou está corrompido.');
  }

  if (!wb.worksheets || wb.worksheets.length === 0) {
    throw new Error('A planilha não contém abas.');
  }

  // Limite de segurança: max 20 abas
  if (wb.worksheets.length > 20) {
    throw new Error('A planilha excede o limite de segurança de abas permitidas (máx 20).');
  }

  // Usar a primeira aba ou aba que contenha 'aluno' ou 'dados'
  const targetSheet =
    wb.worksheets.find((ws) => {
      const lower = ws.name.toLowerCase();
      return lower.includes('aluno') || lower.includes('dados');
    }) || wb.worksheets[0];

  if (!targetSheet || targetSheet.rowCount === 0) {
    throw new Error('A planilha está vazia ou não contém dados legíveis.');
  }

  // Limite de segurança: max 10.000 linhas
  if (targetSheet.rowCount > 10000) {
    throw new Error('A planilha excede o limite máximo permitido de 10.000 linhas.');
  }

  // Identificar linha do cabeçalho
  let headerRowIndex = -1;
  let colEnrollment = -1;
  let colName = -1;
  let colClass = -1;

  const maxHeaderSearch = Math.min(targetSheet.rowCount, 10);

  for (let r = 1; r <= maxHeaderSearch; r++) {
    const row = targetSheet.getRow(r);
    if (!row || row.cellCount === 0) continue;

    for (let c = 1; c <= Math.max(row.cellCount, 10); c++) {
      const cellText = extractCellValueAsString(row.getCell(c)).toLowerCase();
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

  // Fallback para posições padrão 1, 2, 3 (colunas A, B, C) se cabeçalho não foi encontrado por texto
  if (headerRowIndex === -1) {
    headerRowIndex = 1;
    colEnrollment = 1;
    colName = 2;
    colClass = 3;
  }

  const rows: RawImportRow[] = [];

  for (let r = headerRowIndex + 1; r <= targetSheet.rowCount; r++) {
    const row = targetSheet.getRow(r);
    if (!row) continue;

    const rawEnrollment = extractCellValueAsString(row.getCell(colEnrollment));
    const rawName = extractCellValueAsString(row.getCell(colName));
    const rawClass = extractCellValueAsString(row.getCell(colClass));

    // Ignorar linhas totalmente em branco
    if (!rawEnrollment && !rawName && !rawClass) {
      continue;
    }

    rows.push({
      rowIndex: r, // 1-indexed para o usuário
      enrollment: rawEnrollment,
      name: rawName,
      className: rawClass,
    });
  }

  if (rows.length === 0) {
    throw new Error('Nenhum registro de aluno foi encontrado na planilha.');
  }

  return rows;
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
