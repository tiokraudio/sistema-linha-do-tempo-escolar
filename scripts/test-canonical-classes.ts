import {
  normalizeClassNameKey,
  resolveCanonicalAvailableClasses,
  getPedagogicalPosition,
} from '../src/utils/pedagogicalStructure';
import { ClassRecord } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSOU: ${message}`);
}

console.log('================================================================');
console.log(' TESTE DE RESOLUÇÃO E DEDUPLICAÇÃO DE TURMAS EM FILTROS');
console.log('================================================================\n');

// 1. Configuração canônica de turmas (Configurações > Turmas)
const registeredClasses: ClassRecord[] = [
  {
    id: 'cls_01_ei_3',
    name: 'EI | 3 Anos',
    stage: 'EI',
    stageName: 'Educação Infantil',
    position: 1,
    active: true,
    order: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cls_02_efaf_6',
    name: 'EFAF | 6º Ano',
    stage: 'EFAF',
    stageName: 'Ensino Fundamental - Anos Finais',
    position: 9,
    active: true,
    order: 9,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cls_03_em_1',
    name: 'EM | 1ª Série',
    stage: 'EM',
    stageName: 'Ensino Médio',
    position: 13,
    active: true,
    order: 13,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

// TESTE 1: Casos solicitados explicitamente pelo usuário
console.log('TESTE 1: Variações explícitas de "EI | 3 Anos" com nome canônico cadastrado');
const userExplicitCases = [
  'EI | 3 Anos',
  'ei | 3 anos',
  'EI | 3 ANOS',
  ' EI | 3 Anos ',
];

const result1 = resolveCanonicalAvailableClasses(userExplicitCases, registeredClasses);
console.log('Entrada:', userExplicitCases);
console.log('Resultado:', result1);

assert(result1.length === 1, `Deveria resultar em exatamente 1 turma única. Obtido: ${result1.length}`);
assert(result1[0] === 'EI | 3 Anos', `Deveria ser o nome canônico 'EI | 3 Anos'. Obtido: '${result1[0]}'`);

// TESTE 2: Minúscula aparecendo primeiro na lista de registros
console.log('\nTESTE 2: Registro com grafia minúscula aparecendo primeiro nos registros');
const lowerCaseFirst = [
  'ei | 3 anos',
  'EI | 3 Anos',
  '  ei | 3 anos  ',
];
const result2 = resolveCanonicalAvailableClasses(lowerCaseFirst, registeredClasses);
assert(result2.length === 1, `Deveria resultar em 1 única turma. Obtido: ${result2.length}`);
assert(result2[0] === 'EI | 3 Anos', `Mesmo com minúscula primeiro, deve resolver para canônico 'EI | 3 Anos'. Obtido: '${result2[0]}'`);

// TESTE 3: Múltiplas turmas com variações misturadas
console.log('\nTESTE 3: Múltiplas turmas misturadas no mesmo período letivo');
const mixedClasses = [
  'ei | 3 anos',
  'EFAF | 6º Ano',
  'EI | 3 Anos',
  'efaf | 6º ano',
  'EM | 1ª Série',
  'em | 1ª série',
  '  EM | 1ª SÉRIE  ',
  'EFAF | 6º ANO',
];
const result3 = resolveCanonicalAvailableClasses(mixedClasses, registeredClasses);
console.log('Resultado múltiplas:', result3);
assert(result3.length === 3, `Deveria resultar em exatamente 3 turmas únicas. Obtido: ${result3.length}`);
assert(result3.includes('EI | 3 Anos'), "Deveria conter 'EI | 3 Anos'");
assert(result3.includes('EFAF | 6º Ano'), "Deveria conter 'EFAF | 6º Ano'");
assert(result3.includes('EM | 1ª Série'), "Deveria conter 'EM | 1ª Série'");

// TESTE 4: Turma histórica que NÃO está no cadastro atual de turmas
console.log('\nTESTE 4: Turma histórica ausente do cadastro de classes atual');
const historicalClasses = [
  'Turma Experimental 2015',
  'turma experimental 2015',
  '  TURMA EXPERIMENTAL 2015  ',
];
const result4 = resolveCanonicalAvailableClasses(historicalClasses, registeredClasses);
assert(result4.length === 1, `Deveria deduplicar para 1 turma histórica única. Obtido: ${result4.length}`);
assert(result4[0] === 'Turma Experimental 2015', `Deveria preservar a primeira grafia limpa 'Turma Experimental 2015'. Obtido: '${result4[0]}'`);

// TESTE 5: Tratamento de nulos, strings vazias e traço ('—')
console.log('\nTESTE 5: Tratamento seguro de strings vazias, nulos e traço');
const dirtyInput = [
  '',
  '   ',
  '—',
  null,
  undefined,
  'EI | 3 Anos',
  'ei | 3 anos',
];
const result5 = resolveCanonicalAvailableClasses(dirtyInput as any, registeredClasses);
assert(result5.length === 1, `Deveria ignorar valores inválidos e retornar apenas 1 turma. Obtido: ${result5.length}`);
assert(result5[0] === 'EI | 3 Anos', `Deveria conter 'EI | 3 Anos'. Obtido: '${result5[0]}'`);

// TESTE 6: Ordenação alfabética (CarometroModal) e pedagógica (GenerateTimeline)
console.log('\nTESTE 6: Validação das ordenações utilizadas nas telas');
const classesToSort = resolveCanonicalAvailableClasses(
  ['EM | 1ª Série', 'EI | 3 Anos', 'EFAF | 6º Ano'],
  registeredClasses
);

// Ordenação Carômetro: alfabética pt-BR
const carometroSort = [...classesToSort].sort((a, b) => a.localeCompare(b, 'pt-BR'));
console.log('Ordem Carômetro (alfabética):', carometroSort);
assert(carometroSort[0] === 'EFAF | 6º Ano', 'Primeiro alfabético deve ser EFAF | 6º Ano');
assert(carometroSort[1] === 'EI | 3 Anos', 'Segundo alfabético deve ser EI | 3 Anos');
assert(carometroSort[2] === 'EM | 1ª Série', 'Terceiro alfabético deve ser EM | 1ª Série');

// Ordenação Linha do Tempo: posição pedagógica
const timelineSort = [...classesToSort].sort((a, b) => {
  const posA = getPedagogicalPosition(a) ?? 999;
  const posB = getPedagogicalPosition(b) ?? 999;
  if (posA !== posB) return posA - posB;
  return a.localeCompare(b, 'pt-BR');
});
console.log('Ordem Linha do Tempo (pedagógica):', timelineSort);
assert(timelineSort[0] === 'EI | 3 Anos', 'Primeiro pedagógico deve ser EI | 3 Anos (pos 1)');
assert(timelineSort[1] === 'EFAF | 6º Ano', 'Segundo pedagógico deve ser EFAF | 6º Ano (pos 9)');
assert(timelineSort[2] === 'EM | 1ª Série', 'Terceiro pedagógico deve ser EM | 1ª Série (pos 13)');

// TESTE 7: Casos reais do storage.json (EI | 3 Anos / EI | 3 ANOS e EI | 4 Anos / EI | 4 ANOS)
console.log('\nTESTE 7: Pares reais confirmados no storage.json');
const realStorageClassesWithEI4: ClassRecord[] = [
  ...registeredClasses,
  {
    id: 'cls_02_ei_4',
    name: 'EI | 4 Anos',
    stage: 'EI',
    stageName: 'Educação Infantil',
    position: 2,
    active: true,
    order: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const historicalRecordsInPeriod = [
  { studentId: 'std_1', studentName: 'ALICE M.', className: 'EI | 3 Anos' },
  { studentId: 'std_2', studentName: 'BERNARDO S.', className: 'EI | 3 ANOS' },
  { studentId: 'std_3', studentName: 'CAIO T.', className: 'EI | 4 Anos' },
  { studentId: 'std_4', studentName: 'DANIELA R.', className: 'EI | 4 ANOS' },
  { studentId: 'std_5', studentName: 'EDUARDO P.', className: 'EI | 4 anos' },
  { studentId: 'std_6', studentName: 'FELIPE N.', className: ' EI | 3 Anos ' },
];

const rawClassesFromPeriod = historicalRecordsInPeriod.map((r) => r.className);
const filterOptionsWithCanonical = resolveCanonicalAvailableClasses(rawClassesFromPeriod, realStorageClassesWithEI4);

console.log('Opções geradas no filtro:', filterOptionsWithCanonical);
assert(filterOptionsWithCanonical.length === 2, `Deveria gerar exatamente 2 opções únicas de filtro. Obtido: ${filterOptionsWithCanonical.length}`);
assert(filterOptionsWithCanonical.includes('EI | 3 Anos'), "Opções devem conter 'EI | 3 Anos'");
assert(filterOptionsWithCanonical.includes('EI | 4 Anos'), "Opções devem conter 'EI | 4 Anos'");

// Teste de filtragem case-insensitive para EI | 3 Anos
const selectedOptionEI3 = filterOptionsWithCanonical.find((c) => normalizeClassNameKey(c) === normalizeClassNameKey('EI | 3 Anos'))!;
const studentsEI3 = historicalRecordsInPeriod.filter((r) =>
  normalizeClassNameKey(r.className) === normalizeClassNameKey(selectedOptionEI3)
);
console.log('Alunos retornados ao filtrar por EI | 3 Anos:', studentsEI3.map((s) => `${s.studentName} (${s.className})`));
assert(studentsEI3.length === 3, `Deveria retornar todos os 3 alunos de EI 3 Anos (Alice, Bernardo, Felipe). Obtido: ${studentsEI3.length}`);
assert(studentsEI3.some((s) => s.studentId === 'std_1'), 'std_1 (EI | 3 Anos) deve estar presente');
assert(studentsEI3.some((s) => s.studentId === 'std_2'), 'std_2 (EI | 3 ANOS) deve estar presente');
assert(studentsEI3.some((s) => s.studentId === 'std_6'), 'std_6 ( EI | 3 Anos ) deve estar presente');

// Teste de filtragem case-insensitive para EI | 4 Anos
const selectedOptionEI4 = filterOptionsWithCanonical.find((c) => normalizeClassNameKey(c) === normalizeClassNameKey('EI | 4 Anos'))!;
const studentsEI4 = historicalRecordsInPeriod.filter((r) =>
  normalizeClassNameKey(r.className) === normalizeClassNameKey(selectedOptionEI4)
);
console.log('Alunos retornados ao filtrar por EI | 4 Anos:', studentsEI4.map((s) => `${s.studentName} (${s.className})`));
assert(studentsEI4.length === 3, `Deveria retornar todos os 3 alunos de EI 4 Anos (Caio, Daniela, Eduardo). Obtido: ${studentsEI4.length}`);
assert(studentsEI4.some((s) => s.studentId === 'std_3'), 'std_3 (EI | 4 Anos) deve estar presente');
assert(studentsEI4.some((s) => s.studentId === 'std_4'), 'std_4 (EI | 4 ANOS) deve estar presente');
assert(studentsEI4.some((s) => s.studentId === 'std_5'), 'std_5 (EI | 4 anos) deve estar presente');

// TESTE 8: Se 'EI | 4 Anos' NÃO estiver cadastrado em classes, deduplica usando a primeira ocorrência limpa
console.log('\nTESTE 8: EI | 4 Anos sem correspondência em classes cadastradas');
const filterOptionsWithoutEI4 = resolveCanonicalAvailableClasses(
  ['EI | 4 ANOS', 'EI | 4 Anos', 'ei | 4 anos'],
  registeredClasses // Não tem EI | 4 Anos
);
assert(filterOptionsWithoutEI4.length === 1, `Deveria gerar exatamente 1 opção mesmo sem cadastro. Obtido: ${filterOptionsWithoutEI4.length}`);
assert(filterOptionsWithoutEI4[0] === 'EI | 4 ANOS', `Usa a primeira grafia limpa sem duplicar. Obtido: '${filterOptionsWithoutEI4[0]}'`);

// TESTE 9: Comportamento representativo de ReviewSheetPrintModal
console.log('\nTESTE 9: Comportamento representativo de ReviewSheetPrintModal');
const reviewSheetSavedCompositions = [
  { studentId: 'std_r1', studentName: 'ANA C.', latestClass: 'EI | 3 Anos', latestYear: '2026' },
  { studentId: 'std_r2', studentName: 'BRUNO D.', latestClass: 'EI | 3 ANOS', latestYear: '2026' },
  { studentId: 'std_r3', studentName: 'CLARA E.', latestClass: 'ei | 3 anos', latestYear: '2026' },
  { studentId: 'std_r4', studentName: 'DANIEL F.', latestClass: 'EFAF | 6º ANO', latestYear: '2026' },
  { studentId: 'std_r5', studentName: 'ELENA G.', latestClass: 'EFAF | 6º Ano', latestYear: '2026' },
  { studentId: 'std_r6', studentName: 'FABIO H.', latestClass: 'Turma Histórica 2020', latestYear: '2026' },
  { studentId: 'std_r7', studentName: 'GABRIELA I.', latestClass: '  TURMA HISTÓRICA 2020  ', latestYear: '2026' },
  { studentId: 'std_r8', studentName: 'HEITOR J.', latestClass: '—', latestYear: '2026' },
];

// 1. Extração de turmas disponíveis para o dropdown do filtro (conforme ReviewSheetPrintModal)
const rawReviewClasses = reviewSheetSavedCompositions
  .map((i) => i.latestClass)
  .filter((cls): cls is string => Boolean(cls) && cls !== '—');

const reviewAvailableClasses = resolveCanonicalAvailableClasses(rawReviewClasses, registeredClasses)
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));

console.log('Turmas disponíveis no dropdown do ReviewSheetPrintModal:', reviewAvailableClasses);
assert(reviewAvailableClasses.length === 3, `Deveria resultar em exatamente 3 turmas no filtro (EI 3, EFAF 6, Turma Histórica 2020). Obtido: ${reviewAvailableClasses.length}`);
assert(reviewAvailableClasses.includes('EI | 3 Anos'), "Opções devem conter canônica 'EI | 3 Anos'");
assert(reviewAvailableClasses.includes('EFAF | 6º Ano'), "Opções devem conter canônica 'EFAF | 6º Ano'");
assert(reviewAvailableClasses.includes('Turma Histórica 2020'), "Opções devem conter turma histórica não cadastrada 'Turma Histórica 2020'");

// 2. Filtragem pelo dropdown selecionando 'EI | 3 Anos' com comparação via normalizeClassNameKey
const selectedReviewClass = 'EI | 3 Anos';
const filteredForReview = reviewSheetSavedCompositions.filter(
  (item) => normalizeClassNameKey(item.latestClass) === normalizeClassNameKey(selectedReviewClass)
);
console.log('Itens filtrados para EI | 3 Anos:', filteredForReview.map((i) => `${i.studentName} [${i.latestClass}]`));
assert(filteredForReview.length === 3, `Deveria filtrar todos os 3 alunos de EI 3 Anos (Ana, Bruno, Clara). Obtido: ${filteredForReview.length}`);
assert(filteredForReview.some((i) => i.studentId === 'std_r1'), 'Ana C. (EI | 3 Anos) deve estar presente');
assert(filteredForReview.some((i) => i.studentId === 'std_r2'), 'Bruno D. (EI | 3 ANOS) deve estar presente');
assert(filteredForReview.some((i) => i.studentId === 'std_r3'), 'Clara E. (ei | 3 anos) deve estar presente');

// 3. Resolução do cabeçalho da página de impressão (pageClassLabel / currentSheetClassName)
// Quando classFilter é 'all' e a folha contém alunos da mesma turma com capitalizações diferentes:
const pageSliceUniformCasing = [
  { latestClass: 'EI | 3 Anos' },
  { latestClass: 'EI | 3 ANOS' },
  { latestClass: 'ei | 3 anos' },
];
const canonicalPageClasses = resolveCanonicalAvailableClasses(
  pageSliceUniformCasing.map((i) => i.latestClass).filter((c) => Boolean(c) && c !== '—'),
  registeredClasses
);
const pageClassLabel = canonicalPageClasses.length === 1 ? canonicalPageClasses[0] : undefined;
console.log('Label resolvido para página uniforme com variações de grafia:', pageClassLabel);
assert(pageClassLabel === 'EI | 3 Anos', `Deveria unificar o label da folha para 'EI | 3 Anos'. Obtido: '${pageClassLabel}'`);

// Quando a página contém turmas mistas (ex: EI 3 Anos e EFAF 6º Ano), o label da turma deve ser undefined
const pageSliceMixed = [
  { latestClass: 'EI | 3 Anos' },
  { latestClass: 'EFAF | 6º Ano' },
];
const canonicalMixedPageClasses = resolveCanonicalAvailableClasses(
  pageSliceMixed.map((i) => i.latestClass).filter((c) => Boolean(c) && c !== '—'),
  registeredClasses
);
const pageClassLabelMixed = canonicalMixedPageClasses.length === 1 ? canonicalMixedPageClasses[0] : undefined;
assert(pageClassLabelMixed === undefined, 'Página mista deve ter pageClassLabel como undefined');

console.log('\n================================================================');
console.log(' TODOS OS 9 TESTES DE RESOLUÇÃO DE TURMAS PASSARAM COM SUCESSO!');
console.log('================================================================\n');
