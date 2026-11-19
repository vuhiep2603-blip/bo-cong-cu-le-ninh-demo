import type {Source} from './model';
import {recognizePdfHeader} from './ocr';
import {extractTaskProposals} from './task-extraction';
import {reconstructPageLines} from './pdf-layout';

export interface Proposal {title:string; detail:string; lead:string; partners:string; deadline:string; deliverable:string; excerpt:string}
export interface Analysis {source:Source; documentDate:string; proposals:Proposal[]}
export interface TaskAnalyzer {analyze(text:string):Promise<Analysis>}
export interface ReadResult {text:string;ocrHeader?:ReturnType<typeof extractDocumentHeader>;notice?:string;ocrConfidence?:number}

const assignment = /giao\s|chủ trì|chịu trách nhiệm|có trách nhiệm|đề nghị|yêu cầu/i;
const prefix = /^\s*(?:\d+(?:\.\d+)*[.)]|[a-z]\)|[-•])\s+/i;
const metadata = (line:string, label:RegExp) => line.match(label)?.[1]?.trim() ?? '';

// Read only the document header; never confuse a deadline in the body with the issue date.
function validDate(day:string,month:string,year:string) {
  const d=Number(day),m=Number(month),y=Number(year);
  const candidate=new Date(Date.UTC(y,m-1,d));
  return y>=1900 && y<=2100 && candidate.getUTCFullYear()===y
    && candidate.getUTCMonth()===m-1 && candidate.getUTCDate()===d
    ? [year,month.padStart(2,'0'),day.padStart(2,'0')].join('-') : '';
}
export function extractDocumentHeader(text:string) {
  const lines=text.normalize('NFC').replace(/\u00a0/g,' ').split(/\r?\n/)
    .map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
  const boundary=lines.findIndex((line,index)=>index>2 && /^(?:Kính gửi|Căn cứ|Thực hiện|Nơi nhận)\s*[:：]?/i.test(line));
  const header=lines.slice(0,Math.min(55,boundary<0?55:boundary));
  const headerText=header.join('\n');
  // Number and designation often occupy separate PDF glyphs/cells:
  // "Số: 20/TB - CQTTBCĐ", "Số 363 -CV/TU", or split after "TB-".
  const numberRows=header.slice(0,14).join('\n');
  const numberMatch=numberRows.match(/(?:^|[^\p{L}])Số\s*[:：]?\s*(\d{1,6})\s*([-–—/])\s*([A-ZĐa-zđ][\p{L}\p{N}./\-–—\s]{0,40})/iu);
  let number='';
  if(numberMatch) {
    let tail=numberMatch[3].split(/\s{2,}|\n|(?=\s+(?:Quảng|Hà Nội|Lệ Ninh|ĐẢNG|CỘNG HÒA|ngày)\b)/iu)[0];
    tail=tail.replace(/\s*[-–—]\s*/g,'-').replace(/\s*\/\s*/g,'/').replace(/\s+/g,'');
    // Never accept an incomplete code ending in a separator.
    number=(numberMatch[1]+(numberMatch[2]==='/'?'/':'-')+tail).replace(/[–—]/g,'-');
  }
  // Datelines may be wrapped into separate visual rows or contain spaced digits.
  // Restrict candidate dates to the administrative heading, not the task body.
  const datePattern=/ngày\s*([0-9OoIl]{1,2})\s*tháng\s*([0-9OoIl]{1,2})\s*năm\s*(\d{4})|ngày\s*([0-9OoIl]{1,2})\s*[\/.\-]\s*([0-9OoIl]{1,2})\s*[\/.\-]\s*(\d{4})/iu;
  let documentDate='';
  const shortHeader=header.slice(0,Math.min(header.length,18));
  for(let i=0;i<shortHeader.length;i++) {
    const line=shortHeader[i];
    const dateLine=/(?:^|,)\s*ngày\b/iu.test(line)
      && (/^[^,]{0,90},\s*ngày\b/iu.test(line) || /^\s*ngày\b/iu.test(line));
    const mayWrap=i<shortHeader.length-1 ? line+' '+shortHeader[i+1] : line;
    const match=dateLine ? (mayWrap.match(datePattern)??line.match(datePattern)) : null;
    if(match) {
      const normalizeOcrDigits=(s:string)=>s.replace(/[Oo]/g,'0').replace(/[Il]/g,'1');
      documentDate=validDate(normalizeOcrDigits(match[1]??match[4]),normalizeOcrDigits(match[2]??match[5]),match[3]??match[6]);
      if(documentDate) break;
    }
  }
  const stop=/^(?:Kính gửi|Căn cứ|Thực hiện|Nơi nhận|Chủ trì\s*:|Phối hợp\s*:|Thời hạn\s*:|Sản phẩm\s*:|[\p{L} ]{2,55},\s*ngày\s+\d+|Ngày\s+\d+\s+tháng|I[. ]|II[. ]|III[. ]|\d{1,2}[.)]\s+)/iu;
  let start=-1;
  let subject='';
  for(let i=0;i<header.length;i++) {
    const match=header[i].match(/^(?:V\/v|Về việc|Trích yếu)\s*[:：]?\s*(.*)$/i);
    if(match) {start=i;subject=match[1];break;}
  }
  if(start>=0) {
    for(const line of header.slice(start+1,start+10)) {
      if(stop.test(line) || /^(?:ĐẢNG CỘNG SẢN|CỘNG HÒA|Số\s*:)/i.test(line)) break;
      subject+=(subject?' ':'')+line;
    }
  } else {
    const title=header.findIndex(line=>/^(?:KẾ HOẠCH|THÔNG BÁO|QUYẾT ĐỊNH|BÁO CÁO|TỜ TRÌNH|CÔNG VĂN|CHƯƠNG TRÌNH|KẾT LUẬN|CHỈ THỊ|NGHỊ QUYẾT|HƯỚNG DẪN|QUY ĐỊNH)$/i.test(line));
    if(title>=0) {
      const parts:string[]=[];
      for(const line of header.slice(title+1,title+12)) {
        if(stop.test(line) || /^(?:ĐẢNG CỘNG SẢN|CỘNG HÒA|ỦY BAN|Số\s*:)/i.test(line)) break;
        parts.push(line);
      }
      subject=parts.join(' ');
    }
  }
  return {number:number.slice(0,120),documentDate,subject:subject.replace(/\s+/g,' ').trim().slice(0,300)};
}

export function reconcileHeaders(
  embedded:ReturnType<typeof extractDocumentHeader>,
  scanned:ReturnType<typeof extractDocumentHeader>
) {
  const a=embedded.number.replace(/\s+/g,'').toUpperCase();
  const b=scanned.number.replace(/\s+/g,'').toUpperCase();
  // A shorter partial code (20/TB) must not outrank a matching complete code
  // (20/TB-CQTTBCĐ), but unrelated OCR guesses cannot overwrite a PDF value.
  const number=!a ? scanned.number : (b.startsWith(a) && b.length>a.length ? scanned.number : embedded.number);
  const conflicts:string[]=[];
  if(a&&b&&a!==b&&!b.startsWith(a)&&!a.startsWith(b)) conflicts.push('số, ký hiệu');
  if(embedded.documentDate&&scanned.documentDate&&embedded.documentDate!==scanned.documentDate) conflicts.push('ngày ban hành');
  if(embedded.subject&&scanned.subject&&embedded.subject!==scanned.subject
    && !scanned.subject.startsWith(embedded.subject)&&!embedded.subject.startsWith(scanned.subject)) conflicts.push('trích yếu');
  return {
    number, documentDate:embedded.documentDate||scanned.documentDate,
    subject:(!embedded.subject || (scanned.subject.startsWith(embedded.subject)&&scanned.subject.length>embedded.subject.length))
      ? scanned.subject : embedded.subject,
    conflicts
  };
}

export const ruleAnalyzer:TaskAnalyzer = {
  async analyze(text) {
    const lines = text.normalize('NFC').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const {number,documentDate,subject}=extractDocumentHeader(text);
    const proposals=extractTaskProposals(text);
    return {source:{number,subject},documentDate,proposals};
  }
};

export async function readDocument(file:File) {
  if (file.size>15*1024*1024) throw Error('Tệp vượt quá 15 MB.');
  if (/\.docx$/i.test(file.name)) {
    const mammoth=await import('mammoth/mammoth.browser');
    return {text:(await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value} satisfies ReadResult;
  }
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs=await import('pdfjs-dist');
    const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
    const loading=pdfjs.getDocument({data:await file.arrayBuffer(),enableXfa:false,useSystemFonts:true});
    try {
      const pdf=await loading.promise;
      if (pdf.numPages>150) throw Error('PDF vượt quá 150 trang.');
      const pages:string[]=[];
      for(let index=1;index<=pdf.numPages;index++) {
        const page=await pdf.getPage(index);
        const content=await page.getTextContent();
        const positioned=content.items.filter(item=>'str' in item && 'transform' in item)
          .map(item=>({str:item.str,x:item.transform[4],y:item.transform[5],width:item.width,height:item.height}));
        pages.push(reconstructPageLines(positioned));
      }
      const text=pages.join('\n');
      const header=extractDocumentHeader(text);
      if(header.number && header.documentDate && header.subject) return {text} satisfies ReadResult;
      try {
        const first=await pdf.getPage(1);
        const ocr=await recognizePdfHeader(first);
        const ocrHeader=extractDocumentHeader(ocr.text);
        const useful=Boolean(ocrHeader.number||ocrHeader.documentDate||ocrHeader.subject);
        if(!useful && !text.trim()) throw Error('OCR không nhận diện được nội dung phần đầu PDF.');
        return {
          text:text.trim()?text:ocr.text,
          ocrHeader,
          ocrConfidence:ocr.confidence,
          notice:useful
            ? 'Đã thử OCR tiếng Việt trên trang đầu vì thiếu thông tin. Các trường nhận diện bằng OCR cần đối chiếu với văn bản gốc.'
            : 'OCR trang đầu chưa khôi phục được các trường thiếu; hãy nhập thủ công theo văn bản gốc.'
        } satisfies ReadResult;
      } catch(error) {
        return {
          text,
          notice:'Chưa hoàn tất OCR trang đầu: '+(error instanceof Error?error.message:String(error))+
            ' Vui lòng đối chiếu số, ngày và trích yếu trên văn bản gốc.'
        } satisfies ReadResult;
      }
    } catch(error) {
      if(error instanceof Error) {
        if(error.name==='PasswordException') throw Error('PDF được bảo vệ bằng mật khẩu. Hãy cung cấp bản PDF đã mở khóa hợp lệ.');
        if(error.name==='InvalidPDFException') throw Error('PDF không hợp lệ hoặc tệp đã bị hỏng. Hãy thử mở tệp trong trình đọc PDF trước.');
        if(error.name==='MissingPDFException') throw Error('Không tìm thấy nội dung PDF. Hãy chọn lại tệp.');
        if(error.message.startsWith('PDF vượt quá') || error.message.startsWith('Tệp PDF có thể')) throw error;
      }
      throw Error('Không đọc được PDF trên trình duyệt. Hãy thử tải lại trang (Ctrl+F5) hoặc kiểm tra PDF có thể chọn chữ. Chi tiết kỹ thuật: '+(error instanceof Error?error.message:String(error)));
    } finally { await loading.destroy(); }
  }
  throw Error('Chỉ hỗ trợ DOCX và PDF có lớp văn bản.');
}
