import type {Source} from './model';

export interface Proposal {title:string; detail:string; lead:string; partners:string; deadline:string; deliverable:string; excerpt:string}
export interface Analysis {source:Source; proposals:Proposal[]}
export interface TaskAnalyzer {analyze(text:string):Promise<Analysis>}

const assignment = /giao\s|chủ trì|chịu trách nhiệm|có trách nhiệm|đề nghị|yêu cầu/i;
const prefix = /^\s*(?:\d+(?:\.\d+)*[.)]|[a-z]\)|[-•])\s+/i;
const metadata = (line:string, label:RegExp) => line.match(label)?.[1]?.trim() ?? '';

export const ruleAnalyzer:TaskAnalyzer = {
  async analyze(text) {
    const lines = text.normalize('NFC').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    const number = lines.map(l=>metadata(l,/^Số\s*:\s*(.+)$/i)).find(Boolean)??'';
    const subject = lines.map(l=>metadata(l,/^(?:Trích yếu\s*:\s*|V\/v\s+)(.+)$/i)).find(Boolean)??'';
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
    return {source:{number:number.slice(0,120),subject:subject.slice(0,300)},proposals};
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
