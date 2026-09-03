import * as XLSX from 'xlsx';
import { Student } from '../types';

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
  status: 'new_collaborator' | 'already_exists' | 'error';
  statusLabel: string;
  message?: string;
  isExisting: boolean;
  isDuplicateInSheet?: boolean;
  isValid: boolean;
}

export interface CollaboratorBatchImportSummary {
  totalRows: number;
  newCollaboratorsCount: number;
  alreadyExistsCount: number;
  errorsCount: number;
  validCount: number;
}

/**
 * Gera e realiza o download do arquivo modelo XLSX específico para importação de colaboradores.
 */
export function generateCollaboratorImportTemplateXLSX(): void {
  const wb = XLSX.utils.book_new();

  // 1. Aba Principal de Dados ("Colaboradores")
  const dataRows = [
    ['Matrícula / Código', 'Nome completo'],
    ['000101', 'ANA MARIA SILVA'],
    ['000102', 'CARLOS EDUARDO SANTOS'],
    ['000103', 'FERNANDA OLIVEIRA'],
    ['000104', 'MARCOS ROBERTO PEREIRA'],
    ['000105', 'JULIANA ALVES COSTA'],
  ];

  const wsData = XLSX.utils.aoa_to_sheet(dataRows);

  // Configurar largura das colunas
  wsData['!cols'] = [
    { wch: 22 }, // Matrícula / Código
    { wch: 42 }, // Nome completo
  ];

  // Forçar células da coluna Matrícula/Código (A) como tipo TEXTO ('s') com formato '@'
  for (let r = 1; r < dataRows.length; r++) {
    const cellRef = XLSX.utils.encode_cell({ r, c: 0 });
    if (wsData[cellRef]) {
      wsData[cellRef].t = 's';
      wsData[cellRef].z = '@';
    }
  }

  XLSX.utils.book_append_sheet(wb, wsData, 'Colaboradores');

  // 2. Aba de Instruções ("INSTRUÇÕES")
  const instructionsData: (string | number)[][] = [
    ['INSTRUÇÕES PARA PREENCHIMENTO DO MODELO DE IMPORTAÇÃO DE COLABORADORES'],
    [''],
    ['1. MATRÍCULA / CÓDIGO (Obrigatório):'],
    ['   - Preencha o código ou matrícula de identificação do colaborador.'],
    ['   - O identificador é tratado estritamente como TEXTO pelo sistema.'],
    ['   - Zeros à esquerda são 100% preservados (ex: 000101, 00101 e 101 são identificadores distintos).'],
    [''],
    ['2. NOME COMPLETO (Obrigatório):'],
    ['   - Informe o nome completo do colaborador.'],
    [''],
    ['3. REGRAS DO CADASTRO DE COLABORADORES:'],
    ['   - Colaboradores NÃO possuem turma, cargo/função ou confirmação de matrícula escolar.'],
    ['   - A importação realiza o cadastro cadastral da pessoa (personType: "collaborator").'],
    ['   - O vínculo com o período letivo ativo e fotografias é realizado posteriormente em "Registrar Período".'],
    ['   - Colaboradores com código/matrícula já cadastrado no sistema não serão duplicados.'],
    ['   - Linhas com códigos repetidos na própria planilha serão sinalizadas como erro.'],
    [''],
    ['4. DICAS GERAIS:'],
    ['   - Não altere o nome das colunas do cabeçalho da primeira aba.'],
    ['   - Não insira colunas extras como turma ou série.'],
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
  wsInstructions['!cols'] = [
    { wch: 85 },
  ];

  XLSX.utils.book_append_sheet(wb, wsInstructions, 'INSTRUÇÕES');

  // Disparar download no navegador
  XLSX.writeFile(wb, 'modelo_importacao_colaboradores.xlsx');
}

/**
 * Lê e analisa o arquivo XLSX de colaboradores enviado pelo usuário preservando códigos/matrículas como texto.
 */
export async function parseCollaboratorXLSXFile(file: File): Promise<RawCollaboratorImportRow[]> {
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

        // Usar a primeira aba ou aba que contenha 'colaborador', 'funcionario' ou 'dados'
        const targetSheetName =
          workbook.SheetNames.find((name) => {
            const lower = name.toLowerCase();
            return lower.includes('colaborador') || lower.includes('funciona') || lower.includes('dados') || lower.includes('equipe');
          }) || workbook.SheetNames[0];

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

        for (let r = 0; r < Math.min(rawGrid.length, 10); r++) {
          const row = rawGrid[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const cellText = String(row[c] || '').trim().toLowerCase();
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

        // Fallback para posições padrão 0, 1 se cabeçalho não foi encontrado por texto
        if (headerRowIndex === -1) {
          headerRowIndex = 0;
          colEnrollment = 0;
          colName = 1;
        }

        const rows: RawCollaboratorImportRow[] = [];

        for (let r = headerRowIndex + 1; r < rawGrid.length; r++) {
          const row = rawGrid[r];
          if (!Array.isArray(row)) continue;

          const rawEnrollment = row[colEnrollment] !== undefined ? String(row[colEnrollment]).trim() : '';
          const rawName = row[colName] !== undefined ? String(row[colName]).trim() : '';

          // Ignorar linhas totalmente em branco
          if (!rawEnrollment && !rawName) {
            continue;
          }

          rows.push({
            rowIndex: r + 1, // 1-indexed para o usuário
            enrollment: rawEnrollment,
            name: rawName,
          });
        }

        if (rows.length === 0) {
          throw new Error('Nenhum registro de colaborador foi encontrado na planilha.');
        }

        resolve(rows);
      } catch (err: any) {
        reject(new Error(err.message || 'Erro ao processar arquivo XLSX de colaboradores.'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo selecionado.'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Valida as linhas importadas de colaboradores contra duplicidades e campos obrigatórios.
 */
export function validateCollaboratorImportRows(
  rows: RawCollaboratorImportRow[],
  existingStudents: Student[]
): {
  items: CollaboratorImportPreviewItem[];
  summary: CollaboratorBatchImportSummary;
} {
  const seenEnrollments = new Set<string>();

  let newCollaboratorsCount = 0;
  let alreadyExistsCount = 0;
  let errorsCount = 0;
  let validCount = 0;

  const items: CollaboratorImportPreviewItem[] = [];

  for (const row of rows) {
    const rawEnrollment = String(row.enrollment || '').trim();
    const rawName = String(row.name || '').trim().toUpperCase();

    // 1. Validação de Matrícula/Código preenchido
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

    // 2. Duplicidade na própria planilha
    if (seenEnrollments.has(rawEnrollment)) {
      errorsCount++;
      items.push({
        id: `row_${row.rowIndex}_${rawEnrollment}_dup`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment,
        name: rawName || '—',
        status: 'error',
        statusLabel: 'Erro',
        message: 'Código / Matrícula repetido no mesmo arquivo de importação.',
        isExisting: false,
        isDuplicateInSheet: true,
        isValid: false,
      });
      continue;
    }
    seenEnrollments.add(rawEnrollment);

    // 3. Validação de Nome preenchido
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

    // 4. Checagem de existência no sistema
    const existingPerson = existingStudents.find((s) => s.enrollment === rawEnrollment);

    if (existingPerson) {
      alreadyExistsCount++;
      // Itens já existentes são sinalizados como informativos (não serão duplicados nem importados como novo)
      items.push({
        id: `row_${row.rowIndex}_${rawEnrollment}`,
        rowIndex: row.rowIndex,
        enrollment: rawEnrollment,
        name: existingPerson.name,
        status: 'already_exists',
        statusLabel: 'Já cadastrado',
        message: `Pessoa já cadastrada no sistema (${existingPerson.personType === 'collaborator' ? 'Colaborador' : 'Aluno'}). Esta linha será ignorada para evitar duplicidade.`,
        isExisting: true,
        isValid: false, // Não é erro impeditivo do arquivo, mas não é uma nova linha a ser inserida
      });
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
        statusLabel: 'Novo colaborador',
        message: 'Pronto para cadastrar com personType: "collaborator".',
        isExisting: false,
        isValid: true,
      });
    }
  }

  const summary: CollaboratorBatchImportSummary = {
    totalRows: rows.length,
    newCollaboratorsCount,
    alreadyExistsCount,
    errorsCount,
    validCount,
  };

  return { items, summary };
}
