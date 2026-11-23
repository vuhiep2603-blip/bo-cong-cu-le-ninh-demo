export type Origin = 'PDF'|'OCR'|'DOCX';
export interface Cell { text:string; x:number }
export interface DocumentRow {
  cells:Cell[];
  page?:number;
  y?:number;
  sourceY?:number;
  origin:Origin;
  region?:string;
  table?:string;
  confidence?:number;
}
export function rowText(row:DocumentRow) {
  return row.cells.map(cell=>cell.text).join(' ').trim();
}
