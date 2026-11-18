import type {Source} from './model';

export interface Proposal {title:string; detail:string; lead:string; partners:string; deadline:string; deliverable:string; excerpt:string}
export interface Analysis {source:Source; documentDate:string; proposals:Proposal[]}
export interface TaskAnalyzer {analyze(text:string):Promise<Analysis>}

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
  const header=lines.slice(0,35);
  // Document number can follow an agency label on the same line.
  const number=header.map(line=>{
    const match=line.match(/(?:^|[\s|])Số\s*[:：]\s*([0-9]{1,6}\s*[-–—/]\s*[A-ZĐ0-9][A-ZĐ0-9./\-–—]*)/i);
    return match?.[1]?.replace(/\s+/g,'').replace(/[–—]/g,'-')??'';
  }).find(Boolean)??'';
  const issue=header.map(line=>line.match(/^(?:[^,:\n]{1,65},\s*)?ngày\s+(?:(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})|(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}))/i)).find(Boolean);
  const documentDate=issue?validDate(issue[1]??issue[4],issue[2]??issue[5],issue[3]??issue[6]):'';
  // Vietnamese administrative documents commonly carry the summary after V/v
  // or an explicit "Trích yếu"; some use the line after the title "CÔNG VĂN".
  let subject='';
  for(let i=0;i<header.length;i++) {
    const line=header[i];
    const match=line.match(/(?:^|[\s|])(?:V\/v|Về việc|Trích yếu)\s*[:：]?\s+(.+)$/i);
    if(match?.[1]) {subject=match[1];break;}
  }
  if(!subject) {
    const index=header.findIndex(line=>/^(?:KẾ HOẠCH|THÔNG BÁO|QUYẾT ĐỊNH|BÁO CÁO|TỜ TRÌNH|CÔNG VĂN|CHƯƠNG TRÌNH|KẾT LUẬN)$/i.test(line));
    if(index>=0) {
      const parts:string[]=[];
      for(const line of header.slice(index+1,index+5)) {
        if(/^(?:Căn cứ|Kính gửi|I[. ]|1[.) ]|Điều\s+1|Nơi nhận|ĐẢNG|ỦY BAN|UBND|Số\s*:)/i.test(line))break;
        if(/^(?:[-–—]?\s*ngày\s+\d|\d{1,2}\s+tháng\s+\d)/i.test(line))break;
        parts.push(line);
      }
      subject=parts.join(' ');
    }
  }
  return {number:number.slice(0,120),documentDate,subject:subject.replace(/\s+/g,' ').trim().slice(0,300)};
}

export const ruleAnalyzer:TaskAnalyzer = {
  async analyze(text) {
    const lines = text.normalize('NFC').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const {number,documentDate,subject}=extractDocumentHeader(text);
    const proposals:Proposal[] = [];
    for (let i=0;i<lines.length;i++) {
      const line=lines[i];
      if (!assignment.test(line) || /^(?:chủ trì|phối hợp|thời hạn|sản phẩm|kết quả)\s*:/i.test(line)) continue;
      let excerpt=line;
      while (i+1<lines.length && /^(?:chủ trì|phối hợp|thời hạn|sản phẩm|kết quả)\s*:/i.test(lines[i+1])) excerpt+='\n'+lines[++i];
      const fields=excerpt.split('\n');
      const explicitDate=excerpt.match(/(?:trước(?: ngày)?|thời hạn\s*:\s*|chậm nhất(?: ngày)?)\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/i);
      const deadline=explicitDate ? [explicitDate[3],explicitDate[2].padStart(2,'0'),explicitDate[1].padStart(2,'0')].join('-') : '';
      const clean=line.replace(prefix,'');
      proposals.push({
        title:clean.slice(0,180),detail:clean,excerpt,deadline,
        lead:fields.map(l=>metadata(l,/^chủ trì\s*:\s*(.+)$/i)).find(Boolean)??clean.match(/(?:^Giao\s+)?(.+?)\s+chủ trì/i)?.[1]??'',
        partners:fields.map(l=>metadata(l,/^phối hợp\s*:\s*(.+)$/i)).find(Boolean)??clean.match(/phối hợp(?: với)?\s+([^;,.]+)/i)?.[1]??'',
        deliverable:fields.map(l=>metadata(l,/^(?:sản phẩm|kết quả)\s*:\s*(.+)$/i)).find(Boolean)??''
      });
    }
    return {source:{number,subject},documentDate,proposals};
  }
};

export async function readDocument(file:File) {
  if (file.size>15*1024*1024) throw Error('Tệp vượt quá 15 MB.');
  if (/\.docx$/i.test(file.name)) {
    const mammoth=await import('mammoth/mammoth.browser');
    return (await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value;
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
        pages.push(content.items.map(item=>'str' in item ? item.str+(item.hasEOL?'\n':' ') : '').join(''));
      }
      const text=pages.join('\n');
      if(!text.trim()) throw Error('Tệp PDF có thể là bản quét (scan) hoặc ảnh, không có lớp chữ để trích xuất. Bản hiện tại chưa hỗ trợ OCR; hãy dùng PDF có thể bôi đen chữ hoặc DOCX.');
      return text;
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
