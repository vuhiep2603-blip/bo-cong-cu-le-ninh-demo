// QA only: never referenced by application HTML or included in its bundle.
import {createTimesPdf} from '../src/tnr-pdf.js';
window.makeTimesDiagnostic=()=>createTimesPdf([
 {text:'Times New Roman Regular – Tiếng Việt đủ dấu: Đảng ủy Lệ Ninh',bold:false,italics:false},
 {text:'Times New Roman Bold – Tiếng Việt đủ dấu: Đảng ủy Lệ Ninh',bold:true},
 {text:'Times New Roman Italic – Tiếng Việt đủ dấu: Đảng ủy Lệ Ninh',italics:true},
 {text:'Times New Roman Bold Italic – Tiếng Việt đủ dấu: Đảng ủy Lệ Ninh',bold:true,italics:true}
],undefined,'Tiếng Việt đủ dấu: Đảng ủy Lệ Ninh');
