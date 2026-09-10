/**
 * Suíte Oficial de Testes de Regressão da Migração ExcelJS (Etapa 5)
 * Valida a integridade, compatibilidade, segurança e equivalência funcional.
 */
import ExcelJS from 'exceljs';
import {
  extractCellValueAsString,
  parseXLSXFile,
  buildImportTemplateWorkbook,
} from '../src/utils/xlsxImportHelper';
import {
  parseCollaboratorXLSXFile,
  buildCollaboratorImportTemplateWorkbook,
} from '../src/utils/xlsxCollaboratorImportHelper';

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

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`    ✓ PASS: ${testName}`);
    passedAssertions++;
  } else {
    console.error(`    ✗ FAIL: ${testName}`, detail !== undefined ? detail : '');
    failedAssertions++;
  }
}

async function runAllTests() {
  console.log('======================================================================');
  console.log('SUÍTE OFICIAL DE TESTES DE REGRESSÃO - MIGRAÇÃO EXCELJS (ETAPA 5)');
  console.log('======================================================================\n');

  // --------------------------------------------------------------------------------
  // CENÁRIO 1: Preservação de zeros à esquerda em valores de texto (string pura)
  // --------------------------------------------------------------------------------
  console.log('[Cenário 1] Preservação de zeros à esquerda em células de texto');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = '000123';
    cell.numFmt = '@';
    const result = extractCellValueAsString(cell);
    assert(result === '000123', 'Preserva "000123" exatamente sem converter para número', result);
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 2: Preservação de zeros via máscara de formatação numérica (numFmt: 000000)
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 2] Preservação de zeros através de máscara numérica (numFmt: 000000)');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = 123;
    cell.numFmt = '000000';
    const result = extractCellValueAsString(cell);
    assert(result === '000123', 'Aplica zeros à esquerda conforme máscara ("000123")', result);
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 3: Preservação de caracteres especiais e acentuação UTF-8
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 3] Preservação de caracteres especiais e acentuação UTF-8');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = 'JOÃO GONÇALVES DA CONCEIÇÃO & CÉSAR ÉRICO';
    const result = extractCellValueAsString(cell);
    assert(
      result === 'JOÃO GONÇALVES DA CONCEIÇÃO & CÉSAR ÉRICO',
      'Preserva todos os acentos (ã, ç, é) e caracteres especiais UTF-8',
      result
    );
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 4: Extração segura de células Rich Text
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 4] Extração segura de conteúdo com Rich Text');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = {
      richText: [
        { text: '000' },
        { text: '789', font: { bold: true, color: { argb: 'FF0000' } } },
      ],
    } as any;
    const result = extractCellValueAsString(cell);
    assert(result === '000789', 'Concatena fragmentos de Rich Text sem perda de zeros ou caracteres', result);
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 5: Resolução segura de fórmulas (leitura estrita de result em cache)
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 5] Resolução segura de fórmulas (leitura de result sem execução de código)');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Teste');
    const cell = ws.getCell('A1');
    cell.value = {
      formula: 'CONCATENATE("000", "555")',
      result: '000555',
    } as any;
    const result = extractCellValueAsString(cell);
    assert(result === '000555', 'Lê resultado pré-calculado em cache de fórmula com segurança', result);
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 6: Geração real do modelo XLSX de Alunos (buildImportTemplateWorkbook)
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 6] Geração real do modelo XLSX de Alunos (estrutura, abas, larguras e formatos)');
  {
    const activeClassesMock = [
      { id: '1', name: '1º Ano A', stage: 'EFAI' as const, stageName: 'Fundamental I', order: 1, active: true, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', name: '2º Ano B', stage: 'EFAI' as const, stageName: 'Fundamental I', order: 2, active: true, createdAt: '2026-01-01T00:00:00.000Z' },
    ];

    const wb = buildImportTemplateWorkbook(activeClassesMock);

    // 1. Verificar presença das abas
    const wsData = wb.getWorksheet('Alunos');
    const wsInstructions = wb.getWorksheet('INSTRUÇÕES');
    assert(wsData !== undefined, 'Aba "Alunos" foi criada no workbook');
    assert(wsInstructions !== undefined, 'Aba "INSTRUÇÕES" foi criada no workbook');

    // 2. Verificar cabeçalhos da aba Alunos
    const col1 = wsData?.getRow(1).getCell(1).value;
    const col2 = wsData?.getRow(1).getCell(2).value;
    const col3 = wsData?.getRow(1).getCell(3).value;
    assert(col1 === 'Matrícula', 'Coluna 1 é "Matrícula"', col1);
    assert(col2 === 'Nome completo', 'Coluna 2 é "Nome completo"', col2);
    assert(col3 === 'Turma', 'Coluna 3 é "Turma"', col3);

    // 3. Verificar formatação de texto e zeros na coluna de matrícula
    const row2Enrollment = wsData?.getRow(2).getCell(1);
    assert(row2Enrollment?.numFmt === '@', 'Célula de matrícula possui numFmt: "@" (Texto)');
    assert(row2Enrollment?.value === '000123', 'Exemplo de matrícula "000123" preserva zeros à esquerda');

    // 4. Verificar larguras essenciais das colunas
    const widthCol1 = wsData?.getColumn(1).width;
    const widthCol2 = wsData?.getColumn(2).width;
    const widthCol3 = wsData?.getColumn(3).width;
    assert(widthCol1 === 18, 'Largura da coluna Matrícula configurada (18)', widthCol1);
    assert(widthCol2 === 38, 'Largura da coluna Nome configurada (38)', widthCol2);
    assert(widthCol3 === 28, 'Largura da coluna Turma configurada (28)', widthCol3);

    // 5. Verificar conteúdo da aba INSTRUÇÕES (lista de turmas)
    let foundClass1 = false;
    let foundClass2 = false;
    wsInstructions?.eachRow((row) => {
      const cellText = String(row.getCell(2).value || '');
      if (cellText.includes('1º Ano A')) foundClass1 = true;
      if (cellText.includes('2º Ano B')) foundClass2 = true;
    });
    assert(foundClass1, 'Aba INSTRUÇÕES inclui turma mockada "1º Ano A"');
    assert(foundClass2, 'Aba INSTRUÇÕES inclui turma mockada "2º Ano B"');

    // 6. Round-trip completo: Gerar buffer do modelo e submeter ao parseXLSXFile
    const buffer = await wb.xlsx.writeBuffer();
    const fakeFile = new FakeFile(buffer as ArrayBuffer, 'modelo_gerado_alunos.xlsx');
    const parsedRows = await parseXLSXFile(fakeFile as unknown as File);
    assert(parsedRows.length === 4, 'parseXLSXFile leu com sucesso os 4 exemplos gerados no modelo', parsedRows.length);
    assert(parsedRows[0].enrollment === '000123', 'Primeiro aluno do modelo parseado preservou "000123"', parsedRows[0]?.enrollment);
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 7: Geração real do modelo XLSX de Colaboradores (buildCollaboratorImportTemplateWorkbook)
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 7] Geração real do modelo XLSX de Colaboradores (estrutura, abas, larguras e formatos)');
  {
    const wb = buildCollaboratorImportTemplateWorkbook();

    // 1. Verificar presença das abas
    const wsData = wb.getWorksheet('Colaboradores');
    const wsInstructions = wb.getWorksheet('INSTRUÇÕES');
    assert(wsData !== undefined, 'Aba "Colaboradores" foi criada no workbook');
    assert(wsInstructions !== undefined, 'Aba "INSTRUÇÕES" foi criada no workbook');

    // 2. Verificar cabeçalhos da aba Colaboradores
    const col1 = wsData?.getRow(1).getCell(1).value;
    const col2 = wsData?.getRow(1).getCell(2).value;
    assert(col1 === 'Matrícula / Código', 'Coluna 1 é "Matrícula / Código"', col1);
    assert(col2 === 'Nome completo', 'Coluna 2 é "Nome completo"', col2);

    // 3. Verificar formatação de texto e zeros na coluna de matrícula
    const row2Enrollment = wsData?.getRow(2).getCell(1);
    assert(row2Enrollment?.numFmt === '@', 'Célula de matrícula de colaborador possui numFmt: "@" (Texto)');
    assert(row2Enrollment?.value === '000101', 'Exemplo de matrícula de colaborador "000101" preserva zeros');

    // 4. Verificar larguras das colunas
    const widthCol1 = wsData?.getColumn(1).width;
    const widthCol2 = wsData?.getColumn(2).width;
    assert(widthCol1 === 22, 'Largura da coluna Matrícula / Código configurada (22)', widthCol1);
    assert(widthCol2 === 42, 'Largura da coluna Nome completo configurada (42)', widthCol2);

    // 5. Round-trip completo: Gerar buffer do modelo e submeter ao parseCollaboratorXLSXFile
    const buffer = await wb.xlsx.writeBuffer();
    const fakeFile = new FakeFile(buffer as ArrayBuffer, 'modelo_gerado_colaboradores.xlsx');
    const parsedRows = await parseCollaboratorXLSXFile(fakeFile as unknown as File);
    assert(parsedRows.length === 5, 'parseCollaboratorXLSXFile leu com sucesso os 5 colaboradores do modelo', parsedRows.length);
    assert(parsedRows[0].enrollment === '000101', 'Primeiro colaborador parseado preservou "000101"', parsedRows[0]?.enrollment);
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 8: Limite de segurança contra excesso de abas (> 20 abas)
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 8] Limite de segurança contra excesso de abas (> 20 abas)');
  {
    const wb = new ExcelJS.Workbook();
    for (let i = 1; i <= 21; i++) {
      wb.addWorksheet(`Aba_${i}`);
    }
    const buffer = await wb.xlsx.writeBuffer();
    const fakeFile = new FakeFile(buffer as ArrayBuffer, 'muitas_abas.xlsx');

    let threw = false;
    let errorMessage = '';
    try {
      await parseXLSXFile(fakeFile as unknown as File);
    } catch (err: any) {
      threw = true;
      errorMessage = err.message;
    }
    assert(threw, 'Rejeitou planilha com 21 abas com exceção controlada', errorMessage);
    assert(
      errorMessage.includes('máx 20') || errorMessage.includes('20 abas'),
      'Mensagem informa explicitamente o limite de 20 abas',
      errorMessage
    );
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 9: Limite de segurança contra excesso de linhas (> 10.000 linhas)
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 9] Limite de segurança contra excesso de linhas (> 10.000 linhas)');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Alunos');
    ws.columns = [
      { header: 'Matrícula', key: 'm' },
      { header: 'Nome', key: 'n' },
      { header: 'Turma', key: 't' },
    ];

    // Simula uma planilha com 10.002 linhas (cabeçalho + 10.001 linhas)
    const mockRow = ['001', 'Aluno Teste', 'Turma A'];
    const bulkRows: string[][] = [];
    for (let i = 0; i <= 10001; i++) {
      bulkRows.push(mockRow);
    }
    ws.addRows(bulkRows);

    const buffer = await wb.xlsx.writeBuffer();
    const fakeFile = new FakeFile(buffer as ArrayBuffer, 'muitas_linhas.xlsx');

    let threw = false;
    let errorMessage = '';
    try {
      await parseXLSXFile(fakeFile as unknown as File);
    } catch (err: any) {
      threw = true;
      errorMessage = err.message;
    }
    assert(threw, 'Rejeitou planilha com mais de 10.000 linhas com exceção controlada', errorMessage);
    assert(
      errorMessage.includes('10.000 linhas'),
      'Mensagem informa explicitamente o limite de 10.000 linhas',
      errorMessage
    );
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 10: Rejeição amigável e segura de arquivos no formato legado .xls
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 10] Bloqueio amigável de arquivos .xls legados com instrução ao usuário');
  {
    const fakeFile = new FakeFile(new ArrayBuffer(100), 'planilha_antiga.xls');
    let threw = false;
    let errorMessage = '';
    try {
      await parseXLSXFile(fakeFile as unknown as File);
    } catch (err: any) {
      threw = true;
      errorMessage = err.message;
    }
    assert(threw, 'Rejeitou arquivo com extensão .xls', errorMessage);
    assert(
      errorMessage.includes('.xls') && errorMessage.includes('.xlsx'),
      'Mensagem orienta o usuário a salvar a planilha como .xlsx',
      errorMessage
    );
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 11: Rejeição de arquivo corrompido ou formato inválido
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 11] Rejeição segura de arquivo corrompido ou formato inválido');
  {
    const invalidBuffer = Buffer.from('CONTEUDO_TOTALMENTE_INVALIDO_NAO_EXCEL');
    const fakeFile = new FakeFile(invalidBuffer.buffer as ArrayBuffer, 'corrompido.xlsx');
    let threw = false;
    let errorMessage = '';
    try {
      await parseXLSXFile(fakeFile as unknown as File);
    } catch (err: any) {
      threw = true;
      errorMessage = err.message;
    }
    assert(threw, 'Rejeitou arquivo corrompido sem quebrar a execução', errorMessage);
    assert(
      errorMessage.includes('corrompido') || errorMessage.includes('válida'),
      'Mensagem esclarece que o arquivo não é válido ou está corrompido',
      errorMessage
    );
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 12: Limite de tamanho de arquivo (> 10MB)
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 12] Limite de tamanho de arquivo (> 10MB)');
  {
    const bigFile = new FakeFile(new ArrayBuffer(11 * 1024 * 1024), 'arquivo_gigante.xlsx');
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

  // --------------------------------------------------------------------------------
  // CENÁRIO 13: Detecção inteligente e tolerante de cabeçalhos alternativos
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 13] Detecção flexível de cabeçalhos alternativos (RA, Estudante, Série)');
  {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Dados');
    ws.addRow(['Código RA', 'Nome do Estudante', 'Série / Turma']);
    ws.addRow(['009988', 'LUCAS PEREIRA DE SOUZA', '3º Ano']);

    const buffer = await wb.xlsx.writeBuffer();
    const fakeFile = new FakeFile(buffer as ArrayBuffer, 'cabecalhos_sinonimos.xlsx');

    const rows = await parseXLSXFile(fakeFile as unknown as File);
    assert(rows.length === 1, 'Localizou linha de dados mesmo com cabeçalhos alternativos', rows.length);
    assert(rows[0].enrollment === '009988', 'Identificou coluna RA como matrícula e preservou zeros ("009988")', rows[0]?.enrollment);
    assert(rows[0].name === 'LUCAS PEREIRA DE SOUZA', 'Identificou coluna Estudante como nome', rows[0]?.name);
    assert(rows[0].className === '3º Ano', 'Identificou coluna Série / Turma como turma', rows[0]?.className);
  }

  // --------------------------------------------------------------------------------
  // CENÁRIO 14: Validação de Compatibilidade de Runtime do ExcelJS com uuid 11.1.1
  // --------------------------------------------------------------------------------
  console.log('\n[Cenário 14] Teste de Runtime: ExcelJS 4.4.0 com uuid 11.1.1 instalado');
  {
    // Criar workbook com múltiplos recursos (múltiplas abas, metadados, formatação e compactação zip)
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Validação UUID v11';
    wb.created = new Date();

    const ws1 = wb.addWorksheet('Aba 1');
    ws1.addRow(['ID', 'Valor']);
    ws1.addRow(['UUID_TEST_1', 'Teste 1']);

    const ws2 = wb.addWorksheet('Aba 2');
    ws2.addRow(['Código', 'Descrição']);
    ws2.addRow(['UUID_TEST_2', 'Teste 2']);

    const buffer = await wb.xlsx.writeBuffer();
    assert(buffer !== null && buffer.byteLength > 0, 'writeBuffer() gerou arquivo OpenXML com sucesso usando uuid 11.1.1', buffer.byteLength);

    const wbReloaded = new ExcelJS.Workbook();
    await wbReloaded.xlsx.load(buffer);
    assert(wbReloaded.worksheets.length === 2, 'Workbook foi recarregado e validado perfeitamente');
    assert(wbReloaded.getWorksheet('Aba 1')?.getRow(2).getCell(1).value === 'UUID_TEST_1', 'Conteúdo da célula conferido');
  }

  console.log('\n======================================================================');
  console.log(`RESULTADO FINAL: ${passedAssertions} asserções passaram, ${failedAssertions} falharam.`);
  console.log(`TOTAL DE CENÁRIOS TESTADOS: 14`);
  console.log('======================================================================\n');

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Erro fatal na execução da suíte de testes:', err);
  process.exit(1);
});
