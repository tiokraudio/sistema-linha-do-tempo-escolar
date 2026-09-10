/**
 * Suíte de Testes de Regressão da Migração ExcelJS (Etapa 5)
 * Valida a integridade, compatibilidade, segurança e equivalência funcional.
 */
import ExcelJS from 'exceljs';
import { extractCellValueAsString, parseXLSXFile } from '../src/utils/xlsxImportHelper';
import { parseCollaboratorXLSXFile } from '../src/utils/xlsxCollaboratorImportHelper';

// Helper simulado de File para ambiente Node
class FakeFile {
  name: string;
  size: number;
  private buffer: ArrayBuffer;

  constructor(buffer: ArrayBuffer, name: string) {
    this.buffer = buffer;
    this.name = name;
    this.size = buffer.byteLength;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.buffer;
  }
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, detail !== undefined ? detail : '');
    failed++;
  }
}

async function runRegressionTests() {
  console.log('====================================================');
  console.log('INICIANDO SUÍTE DE TESTES DE REGRESSÃO - ETAPA 5');
  console.log('====================================================\n');

  // TESTE 1: Preservação de zeros à esquerda em matrículas de texto
  console.log('[1] Teste de Célula: Preservação de zeros à esquerda (string)');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = '000123';
    cell.numFmt = '@';
    const result = extractCellValueAsString(cell);
    assert(result === '000123', 'extractCellValueAsString preserva "000123" exatamente', result);
  }

  // TESTE 2: Formatação com máscara de zeros à esquerda (ex: 000000 com valor numérico 123)
  console.log('[2] Teste de Célula: Preservação de zeros através de máscara numérica (numFmt: 000000)');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = 123;
    cell.numFmt = '000000';
    const result = extractCellValueAsString(cell);
    assert(result === '000123', 'extractCellValueAsString aplica zeros à esquerda de máscara', result);
  }

  // TESTE 3: Preservação de acentos UTF-8
  console.log('[3] Teste de Célula: Preservação de acentos e caracteres especiais UTF-8');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = 'JOÃO GONÇALVES DA CONCEIÇÃO';
    const result = extractCellValueAsString(cell);
    assert(result === 'JOÃO GONÇALVES DA CONCEIÇÃO', 'Preserva acentos UTF-8 intactos', result);
  }

  // TESTE 4: Rich Text
  console.log('[4] Teste de Célula: Extração de Rich Text');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = {
      richText: [
        { text: '000' },
        { text: '789', font: { bold: true } },
      ],
    } as any;
    const result = extractCellValueAsString(cell);
    assert(result === '000789', 'Extrai conteúdo de RichText sem perdas', result);
  }

  // TESTE 5: Fórmulas (usa resultado em cache sem executar código dinâmico)
  console.log('[5] Teste de Célula: Resolução segura de fórmulas');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = {
      formula: 'CONCATENATE("000", "555")',
      result: '000555',
    } as any;
    const result = extractCellValueAsString(cell);
    assert(result === '000555', 'Lê resultado de fórmula com segurança', result);
  }

  // TESTE 6: Geração e Leitura de Planilha Completa de Alunos
  console.log('[6] Teste de Integração: Fluxo completo de importação de Alunos');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Alunos');
    ws.columns = [
      { header: 'Matrícula', key: 'enrollment' },
      { header: 'Nome completo', key: 'name' },
      { header: 'Turma', key: 'className' },
    ];

    ws.addRow(['000123', 'JOÃO DA SILVA', '1º Ano']);
    ws.addRow(['000124', 'MARIA CONCEIÇÃO', '1º Ano']);
    ws.addRow(['000125', 'PEDRO SANTOS', '2º Ano']);

    // Célula vazia no final (deve ser ignorada)
    ws.addRow(['', '', '']);

    const buffer = await wb.xlsx.writeBuffer();
    const fakeFile = new FakeFile(buffer as ArrayBuffer, 'alunos_validos.xlsx');

    const rows = await parseXLSXFile(fakeFile as unknown as File);
    assert(rows.length === 3, 'Retornou exatamente 3 alunos (ignorou linha vazia)', rows.length);
    assert(rows[0].enrollment === '000123', 'Matrícula 1 preservou zeros: "000123"', rows[0]?.enrollment);
    assert(rows[0].name === 'JOÃO DA SILVA', 'Nome 1 preservado', rows[0]?.name);
    assert(rows[1].enrollment === '000124', 'Matrícula 2 preservou zeros: "000124"', rows[1]?.enrollment);
    assert(rows[1].name === 'MARIA CONCEIÇÃO', 'Nome com acentuação preservado', rows[1]?.name);
    assert(rows[2].className === '2º Ano', 'Turma preservada', rows[2]?.className);
  }

  // TESTE 7: Geração e Leitura de Planilha Completa de Colaboradores
  console.log('[7] Teste de Integração: Fluxo completo de importação de Colaboradores');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Colaboradores');
    ws.columns = [
      { header: 'Matrícula / Código', key: 'enrollment' },
      { header: 'Nome completo', key: 'name' },
    ];

    ws.addRow(['000101', 'ANA MARIA SILVA']);
    ws.addRow(['000102', 'CARLOS ÉRICO SANTOS']);
    ws.addRow(['000103', 'FERNANDA OLIVEIRA']);

    const buffer = await wb.xlsx.writeBuffer();
    const fakeFile = new FakeFile(buffer as ArrayBuffer, 'colaboradores_validos.xlsx');

    const rows = await parseCollaboratorXLSXFile(fakeFile as unknown as File);
    assert(rows.length === 3, 'Retornou 3 colaboradores', rows.length);
    assert(rows[0].enrollment === '000101', 'Código de colaborador preservou zeros: "000101"', rows[0]?.enrollment);
    assert(rows[1].name === 'CARLOS ÉRICO SANTOS', 'Nome de colaborador com acento preservado', rows[1]?.name);
  }

  // TESTE 8: Rejeição amigável e segura de arquivos .xls legados
  console.log('[8] Teste de Segurança: Bloqueio seguro de arquivos legados .xls com orientação');
  {
    const fakeFile = new FakeFile(new ArrayBuffer(100), 'dados_legados.xls');
    let threw = false;
    let errorMessage = '';
    try {
      await parseXLSXFile(fakeFile as unknown as File);
    } catch (err: any) {
      threw = true;
      errorMessage = err.message;
    }
    assert(threw, 'Rejeitou arquivo .xls com exceção explicativa', errorMessage);
    assert(
      errorMessage.includes('.xls') && errorMessage.includes('.xlsx'),
      'Mensagem orienta claramente o usuário a salvar como .xlsx',
      errorMessage
    );
  }

  // TESTE 9: Rejeição de arquivo corrompido / não-Excel
  console.log('[9] Teste de Robustez: Arquivo corrompido ou formato inválido');
  {
    const invalidBuffer = Buffer.from('ESTE NAO E UM ARQUIVO EXCEL VALIDO NEM ZIP');
    const fakeFile = new FakeFile(invalidBuffer.buffer as ArrayBuffer, 'corrompido.xlsx');
    let threw = false;
    let errorMessage = '';
    try {
      await parseXLSXFile(fakeFile as unknown as File);
    } catch (err: any) {
      threw = true;
      errorMessage = err.message;
    }
    assert(threw, 'Rejeitou arquivo inválido com segurança sem travar a aplicação', errorMessage);
    assert(errorMessage.includes('corrompido') || errorMessage.includes('válida'), 'Mensagem amigável de erro', errorMessage);
  }

  // TESTE 10: Limite de tamanho de arquivo (> 10MB)
  console.log('[10] Teste de Segurança: Limite de tamanho de arquivo (max 10MB)');
  {
    const bigFile = new FakeFile(new ArrayBuffer(11 * 1024 * 1024), 'grande.xlsx');
    let threw = false;
    let errorMessage = '';
    try {
      await parseXLSXFile(bigFile as unknown as File);
    } catch (err: any) {
      threw = true;
      errorMessage = err.message;
    }
    assert(threw, 'Bloqueou arquivo maior que 10MB antes do parsing', errorMessage);
    assert(errorMessage.includes('10 MB'), 'Mensagem menciona o limite de 10 MB', errorMessage);
  }

  // TESTE 11: Detecção inteligente de cabeçalhos mesmo com sinônimos (RA, Estudante, Série)
  console.log('[11] Teste de Flexibilidade: Detecção de cabeçalhos alternativos');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Dados');
    // Cabeçalho alternativo
    ws.addRow(['Código RA', 'Nome do Estudante', 'Série / Ano']);
    ws.addRow(['004567', 'LUCAS PEREIRA', '3º Ano']);

    const buffer = await wb.xlsx.writeBuffer();
    const fakeFile = new FakeFile(buffer as ArrayBuffer, 'sinonimos.xlsx');

    const rows = await parseXLSXFile(fakeFile as unknown as File);
    assert(rows.length === 1, 'Encontrou aluno com cabeçalhos alternativos', rows.length);
    assert(rows[0].enrollment === '004567', 'Matrícula detectada corretamente', rows[0]?.enrollment);
    assert(rows[0].name === 'LUCAS PEREIRA', 'Nome detectado corretamente', rows[0]?.name);
    assert(rows[0].className === '3º Ano', 'Turma detectada corretamente', rows[0]?.className);
  }

  console.log('\n====================================================');
  console.log(`RESULTADO DOS TESTES: ${passed} passaram, ${failed} falharam.`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTests().catch((err) => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
