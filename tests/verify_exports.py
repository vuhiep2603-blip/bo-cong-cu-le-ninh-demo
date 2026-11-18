"""QA only. Reads PDFs and source assets; does not distribute fonts."""
from pathlib import Path
from zipfile import ZipFile
from docx import Document
import json,fitz,subprocess,re,hashlib
root=Path(__file__).resolve().parents[1]
out=root/'test-output'
expected={'LiberationSerif','LiberationSerif-Bold','LiberationSerif-Italic','LiberationSerif-BoldItalic'}
results=[]
for name in ['schedule-liberation.pdf','schedule-liberation-stamped.pdf','schedule-liberation-long.pdf','schedule-liberation-reloaded.pdf']:
 doc=fitz.open(out/name)
 fonts={re.sub(r'^[A-Z]{6}\+','',f[3]) for p in doc for f in p.get_fonts()}
 assert fonts==expected,(name,fonts)
 for p in doc:
  assert abs(p.rect.width-595.28)<1 and abs(p.rect.height-841.89)<1
  for f in p.get_fonts():assert doc.extract_font(f[0])[3],(name,f)
  for x0,y0,x1,y1,*_ in p.get_text('blocks'):
   assert x0>=45 and x1<=553 and y0>=44 and y1<=795,(name,p.number,(x0,y0,x1,y1))
 expected_header={
  'ĐẢNG UỶ XÃ LỆ NINH':False, 'VĂN PHÒNG':True,
  '*':True, 'LỊCH CÔNG TÁC TUẦN':True, 'CỦA BAN THƯỜNG VỤ ĐẢNG UỶ':True,
 }
 spans={span['text'].strip():span for block in doc[0].get_text('dict', flags=fitz.TEXTFLAGS_TEXT)['blocks']
        for line in block['lines'] for span in line['spans'] if span['bbox'][1]<90}
 for heading,bold in expected_header.items():
  assert bool(spans[heading]['flags'] & fitz.TEXT_FONT_BOLD)==bold,(name,heading,spans[heading])
 text='\n'.join(p.get_text() for p in doc);assert '\ufffd' not in text
 assert 'LỊCH CÔNG TÁC TUẦN' in text and 'Chủ nhật' in text and 'điều chỉnh phù hợp' in text
 if name=='schedule-liberation.pdf':assert 'Tiếng Việt đầy đủ: Đảng ủy xã Lệ Ninh' in ' '.join(text.split())
 if name=='schedule-liberation-reloaded.pdf':assert 'Hoạt động nhập từ biểu mẫu' in ' '.join(text.split())
 if name=='schedule-liberation-long.pdf':
  assert len(doc)>1
  for i in range(1,25):assert f'Hoạt động {i}:' in text
 stamped=name in ['schedule-liberation-stamped.pdf','schedule-liberation-long.pdf']
 for p in doc:
  assert len(p.get_images())==(1 if stamped and p.number==0 else 0)
  if stamped and p.number==0:
   rect=p.get_image_rects(p.get_images()[0][0])[0]
   assert all(abs(a-b)<.1 for a,b in zip([rect.x0,rect.y0,rect.width,rect.height],[91,32,113,113]))
 font_report=subprocess.check_output(['pdffonts',str(out/name)],text=True)
 rows=font_report.splitlines()[2:];assert len(rows)==4
 assert all('yes yes yes' in ' '.join(row.split()) for row in rows)
 (out/(name+'.pdffonts.txt')).write_text(font_report)
 results.append({'file':name,'pages':len(doc),'fonts':sorted(fonts),'all_embedded_subset_unicode':True,'a4':True,'text_bounds_ok':True,'stamp_first_page_only':stamped})
 print('PASS',name,len(doc),'pages; four embedded Liberation Serif styles; Unicode/bounds/stamp OK')
for kind in ('btv','tt','other'):
 inv=fitz.open(out/f'invitation-{kind}.pdf')
 assert all('LiberationSerif' in font[3] for page in inv for font in page.get_fonts())
 pdf_text=' '.join(' '.join(page.get_text().split()) for page in inv)
 invitation=Document(out/f'invitation-{kind}.docx')
 paragraphs=[p.text.strip() for p in invitation.paragraphs]
 paragraphs.extend(p.text.strip() for table in invitation.tables for row in table.rows
                   for cell in row.cells for p in cell.paragraphs)
 assert '- Như thành phần mời; - Lưu: VPĐU.' in pdf_text
 start=paragraphs.index('- Như thành phần mời;')
 assert paragraphs[start+1]=='- Lưu: VPĐU.'
 assert 'Như thành phần mời,' not in pdf_text and not any('Như thành phần mời,' in p for p in paragraphs)
 assert 'Đặng Thái Vũ Hiệp' in pdf_text and any('Đặng Thái Vũ Hiệp' in p for p in paragraphs)
 print('PASS invitation',kind,'DOCX/PDF recipients and signer')
word=Document(out/'schedule-word.docx')
assert len(word.tables[-1].rows)==7
assert [column.width.twips for column in word.tables[0].columns]==[3887,5865]
heading_paragraphs=[p for cell in word.tables[0].rows[0].cells
                    for p in cell.paragraphs if p.text in expected_header]
headings={p.text:bool(p.runs[0].bold) for p in heading_paragraphs}
assert headings=={**expected_header,'*':False},headings
assert all(run.font.name=='Times New Roman' for p in heading_paragraphs for run in p.runs)
word_body='\n'.join(cell.text for row in word.tables[1].rows for cell in row.cells)
assert 'Lịch đã chỉnh sửa tiếng Việt' in word_body
assert 'Hoạt động nhập từ biểu mẫu' in word_body
with ZipFile(out/'schedule-word.docx') as z:assert not any(n.startswith('word/media/') for n in z.namelist())
backup=json.loads((out/'schedule-backup.json').read_text());assert backup['format']=='le-ninh-local-backup' and backup['version']==1
# Frozen baseline digests avoid depending on an unpublished historical commit.
protected={'index.html': '988b6f37c4882807048982204bf7ec025f3c9e389481e87dd09e26023580c096', 'HUONG_DAN.html': 'c0f6492b04f85ad7cad5a1e44b7bd557fdbb0d06225550145fd2c7beaa7afc0e', 'assets/logo.png': 'bb97f2a27055a06fa5b6b51f32e6c64dcdc8c0806e9901817f574b244ce5092b', 'assets/dau_van_phong_can_tron.png': 'e60dab1daf2e580aab62fe20f2733c90e3d8b841f4a29cc2ea49c0b8e8b8f66d', 'assets/templates/mau_khac.docx': '8818b310e6f71b6e4aa091d986b38103991d71e5d53e4d1e80fca55ef843d242', 'src/core.js': '2612587327380569457fbcf0529553cecf3350dc091ff6ddd30ba720de31e185', 'src/storage.js': '562af9aad71dbc0666ab5f400f2d6e1a28bf90e1302c962762b37b4faa675b94', 'src/stamp.js': 'a3c42aba2b5976cf869f7f4566730cb129e1c56f75f1408697ac37b0c760af4b'}
for name,digest in protected.items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
(out/'export-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('PASS original index/help pages, other invitation template, logo, seal and calendar storage/normalization code unchanged.')
