import React from 'react';
import { CarometroA4Sheet } from './CarometroA4Sheet';

/**
 * Componente de Carômetro da Turma (ClassCarometro).
 * Exporta a folha oficial de Carômetro A4 em alta resolução (300 DPI nativos),
 * com preservação estrita do tamanho de fontes e abreviação inteligente de nomes longos.
 */
export const ClassCarometro = CarometroA4Sheet;
export default ClassCarometro;

export { CarometroA4Sheet };
export type { CarometroStudentItem } from '../utils/carometroUtils';
