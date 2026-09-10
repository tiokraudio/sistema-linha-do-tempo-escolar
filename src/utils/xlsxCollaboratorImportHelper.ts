import ExcelJS from 'exceljs';
import { Student, AcademicYearRecord } from '../types';
import { extractCellValueAsString } from './xlsxImportHelper';

export interface RawCollaboratorImportRow {
  rowIndex: number;
  enrollment: string;
  name: string;
}

export interface CollaboratorImportPreviewItem {
  id: string;
  rowIndex: number;
  enrollment: string;
  name: string;
  status: 'new_collaborator' | 'updated_collaborator' | 'error';
  statusLabel: string;
  message?: string;
  isExisting: boolean;
  hasRecordInPeriod?: boolean;
  isDuplicateInSheet?: boolean;
  isValid: boolean;
}

export interface CollaboratorBatchImportSummary {
  totalRows: number;
  newCollaboratorsCount: number;
  updatedCollaboratorsCount: number;
  alreadyInPeriodCount: number;
  errorsCount: number;
  validCount: number;
  targetPeriod: string;
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
 * Gera e realiza o download do arquivo modelo XLSX específico para importação de colaboradores.
 */
export function generateCollaboratorImportTemplateXLSX(): void {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema Linha do Tempo Escolar';
  wb.created = new Date();

  // 1. Aba Principal de Dados ("Colaboradores")
  const wsData = wb.addWorksheet('Colaboradores');

  // Configurar colunas e larguras
  wsData.columns = [
    { header: 'Matrícula / Código', key: 'enrollment', width: 22 },
    { header: 'Nome completo', key: 'name', width: 42 },
  ];

  const dataRows = [
    { enrollment: '000101', name: 'ANA MARIA SILVA' },
    { enrollment: '000102', name: 'CARLOS EDUARDO SANTOS' },
    { enrollment: '000103', name: 'FERNANDA OLIVEIRA' },
    { enrollment: '000104', name: 'MARCOS ROBERTO PEREIRA' },
    { enrollment: '000105', name: 'JULIANA ALVES COSTA' },
  ];

  dataRows.forEach((item) => {
    const row = wsData.addRow([item.enrollment, item.name]);
    // Forçar célula da coluna Matrícula/Código (coluna 1 / A) como tipo TEXTO com formato '@'
    const cellEnrollment = row.getCell(1);
    cellEnrollment.value = item.enrollment;
    cellEnrollment.numFmt = '@';
  });

  // 2. Aba de Instruções ("INSTRUÇÕES")
  const wsInstructions = wb.addWorksheet('INSTRUÇÕES');
  wsInstructions.columns = [
    { width: 95 },
  ];

  const instructionsData: string[][] = [
    ['INSTRUÇÕES PARA PREENCHIMENTO DO MODELO DE IMPORTAÇÃO DE COLABORADORES'],
    [''],
    ['1. MATRÍCULA / CÓDIGO (Obrigatório):'],
    ['   - Preencha o código ou matrícula de identificação funcional do colaborador.'],
    ['   - O identificador é tratado estritamente como TEXTO pelo sistema.'],
    ['   - Zeros à esquerda são 100% preservados (ex: 000101, 00101 e 101 são identificadores distintos).'],
    [''],
    ['2. NOME COMPLETO (Obrigatório):'],
    ['   - Informe o nome completo do colaborador.'],
    [''],
    ['3. REGRAS DE CONCILIAÇÃO E VÍNCULO AO PERÍODO LETIVO (UPSERT POR MATRÍCULA):'],
    ['   - A importação exige a seleção do Período Letivo de destino no sistema.'],
    ['   - Colaboradores novos são cadastrados e automaticamente associados ao período letivo selecionado.'],
    ['   - Colaboradores já cadastrados no sistema (mesma matrícula):'],
    ['       * Têm seus dados cadastrais (nome) atualizados com base no arquivo.'],
    ['       * São automaticamente associados ao período letivo selecionado caso ainda não tenham registro no ano.'],
    ['       * Se já possuírem registro no ano, suas fotos, enquadramentos e histórico são 100% PRESERVADOS.'],
    ['   - Colaboradores não utilizam turma nem progressão pedagógica escolar.'],
    [''],
    ['4. DICAS GERAIS:'],
    ['   - Não altere o nome das colunas do cabeçalho da primeira aba.'],
    ['   - Não insira colunas desnecessárias como turma ou série.'],
    ['   - Linhas duplicadas na própria planilha serão sinalizadas como erro.'],
  ];

  instructionsData.forEach((line) => {
    wsInstructions.addRow(line);
  });

  // Disparar download no navegador
  triggerWorkbookDownload(wb, 'modelo_importacao_colaboradores.xlsx').catch(console.error);
}

/**
 * Lê e analisa o arquivo XLSX de colaboradores enviado pelo usuário preservando códigos/matrículas como texto.
 */
export async function parseCollaboratorXLSXFile(file: File): Promise<RawCollaboratorImportRow[]> {
  if (!file) {
    throw new Error('Nenhum arquivo fornecido para importação de colaboradores.');
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

  // Usar a primeira aba ou aba que contenha 'colaborador', 'funcionario', 'dados' ou 'equipe'
  const targetSheet =
    wb.worksheets.find((ws) => {
      const lower = ws.name.toLowerCase();
      return lower.includes('colaborador') || lower.includes('funciona') || lower.includes('dados') || lower.includes('equipe');
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

  const maxHeaderSearch = Math.min(targetSheet.rowCount, 10);

  for (let r = 1; r <= maxHeaderSearch; r++) {
    const row = targetSheet.getRow(r);
    if (!row || row.cellCount === 0) continue;

    for (let c = 1; c <= Math.max(row.cellCount, 10); c++) {
      const cellText = extractCellValueAsString(row.getCell(c)).toLowerCase();
      const cellNorm = cellText.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      if (
        colEnrollment === -1 &&
        (cellNorm.includes('matricula') || cellNorm.includes('codigo') || cellNorm === 'cod' || cellNorm === 'id' || cellNorm === 'mat' || cellNorm.includes('identifica'))
      ) {
        colEnrollment = c;
      } else if (
        colName === -1 &&
        (cellNorm.includes('nome') || cellNorm.includes('colaborador') || cellNorm.includes('funciona') || cellNorm.includes('pessoa'))
      ) {
        colName = c;
      }
    }

    if (colEnrollment !== -1 && colName !== -1) {
      headerRowIndex = r;
      break;
    }
  }

  // Fallback para posições padrão 1, 2 se cabeçalho não foi encontrado por texto
  if (headerRowIndex === -1) {
    headerRowIndex = 1;
    colEnrollment = 1;
    colName = 2;
  }

  const rows: RawCollaboratorImportRow[] = [];

  for (let r = headerRowIndex + 1; r <= targetSheet.rowCount; r++) {
    const row = targetSheet.getRow(r);
    if (!row) continue;

    const rawEnrollment = extractCellValueAsString(row.getCell(colEnrollment));
    const rawName = extractCellValueAsString(row.getCell(colName));

    // Ignorar linhas totalmente em branco
    if (!rawEnrollment && !rawName) {
      continue;
    }

    rows.push({
      rowIndex: r, // 1-indexed para o usuário
      enrollment: rawEnrollment,
      name: rawName,
    });
  }

  if (rows.length === 0) {
    throw new Error('Nenhum registro de colaborador foi encontrado na planilha.');
  }

  return rows;
}

/**
 * Valida as linhas importadas de colaboradores contra duplicidades, campos obrigatórios
 * e conciliação de período letivo com upsert por matrícula.
 */
export function validateCollaboratorImportRows(
  rows: RawCollaboratorImportRow[],
  targetPeriod: string,
  existingStudents: Student[],
  existingRecords: AcademicYearRecord[] = []
): {
  items: CollaboratorImportPreviewItem[];
  summary: CollaboratorBatchImportSummary;
} {
  const seenEnrollments = new Set<string>();

  let newCollaboratorsCount = 0;
  let updatedCollaboratorsCount = 0;
  let alreadyInPeriodCount = 0;
  let errorsCount = 0;
  let validCount = 0;

  const items: CollaboratorImportPreviewItem[] = [];
  const cleanPeriod = String(targetPeriod || '').trim();

  for (const row of rows) {
    const rawEnrollment = String(row.enrollment || '').trim();
    const rawName = String(row.name || '').trim().toUpperCase();

    // 1. Validação de Período Letivo
    if (!cleanPeriod) {
      errorsCount++;
      items.push({
        id: `row_${row.rowIndex}_noperiod`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment || '—',
        name: rawName || '—',
        status: 'error',
        statusLabel: 'Sem Período',
        message: 'Selecione um período letivo de destino para realizar a importação.',
        isExisting: false,
        isValid: false,
      });
      continue;
    }

    // 2. Validação de Matrícula/Código preenchido
    if (!rawEnrollment) {
      errorsCount++;
      items.push({
        id: `row_${row.rowIndex}_${Math.random()}`,
        rowIndex: row.rowIndex,
        enrollment: '—',
        name: rawName || '—',
        status: 'error',
        statusLabel: 'Erro',
        message: 'Código / Matrícula não informado.',
        isExisting: false,
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
        status: 'error',
        statusLabel: 'Duplicado na Planilha',
        message: 'Código / Matrícula repetido no mesmo arquivo de importação.',
        isExisting: false,
        isDuplicateInSheet: true,
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
        status: 'error',
        statusLabel: 'Erro',
        message: 'Nome completo não informado.',
        isExisting: false,
        isValid: false,
      });
      continue;
    }

    // 5. Checagem de existência no sistema (Upsert e Conciliação)
    const existingPerson = existingStudents.find((s) => s.enrollment === rawEnrollment);

    if (existingPerson) {
      // Se a pessoa for um aluno, sinalizar conflito
      if ((existingPerson.personType || 'student') !== 'collaborator') {
        errorsCount++;
        items.push({
          id: `row_${row.rowIndex}_${rawEnrollment}`,
          rowIndex: row.rowIndex,
          enrollment: rawEnrollment,
          name: rawName,
          status: 'error',
          statusLabel: 'Conflito de Matrícula',
          message: `Matrícula já pertence ao ALUNO "${existingPerson.name}". Não é possível cadastrar como colaborador.`,
          isExisting: true,
          isValid: false,
        });
        continue;
      }

      // Colaborador já cadastrado: Atualização cadastral + vínculo com período letivo
      updatedCollaboratorsCount++;
      validCount++;

      const hasRecordInPeriod = existingRecords.some(
        (r) => r.studentId === existingPerson.id && String(r.year) === cleanPeriod
      );

      if (hasRecordInPeriod) {
        alreadyInPeriodCount++;
        items.push({
          id: `row_${row.rowIndex}_${rawEnrollment}`,
          rowIndex: row.rowIndex,
          enrollment: rawEnrollment,
          name: rawName,
          status: 'updated_collaborator',
          statusLabel: 'Atualização (Já no período)',
          message: `Colaborador existente. Dados cadastrais serão atualizados e o registro em ${cleanPeriod} (fotos e recortes) será 100% preservado.`,
          isExisting: true,
          hasRecordInPeriod: true,
          isValid: true,
        });
      } else {
        items.push({
          id: `row_${row.rowIndex}_${rawEnrollment}`,
          rowIndex: row.rowIndex,
          enrollment: rawEnrollment,
          name: rawName,
          status: 'updated_collaborator',
          statusLabel: 'Atualização & Novo Vínculo',
          message: `Colaborador existente. Dados cadastrais serão atualizados e novo vínculo será gerado no período ${cleanPeriod}.`,
          isExisting: true,
          hasRecordInPeriod: false,
          isValid: true,
        });
      }
    } else {
      // Colaborador novo
      newCollaboratorsCount++;
      validCount++;
      items.push({
        id: `row_${row.rowIndex}_${rawEnrollment}`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment,
        name: rawName,
        status: 'new_collaborator',
        statusLabel: 'Novo Colaborador',
        message: `Novo colaborador. Será cadastrado e vinculado ao período letivo ${cleanPeriod}.`,
        isExisting: false,
        hasRecordInPeriod: false,
        isValid: true,
      });
    }
  }

  const summary: CollaboratorBatchImportSummary = {
    totalRows: rows.length,
    newCollaboratorsCount,
    updatedCollaboratorsCount,
    alreadyInPeriodCount,
    errorsCount,
    validCount,
    targetPeriod: cleanPeriod,
  };

  return { items, summary };
}
