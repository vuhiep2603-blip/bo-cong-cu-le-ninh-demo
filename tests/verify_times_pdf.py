"""QA only. Reads PDFs and source assets; does not distribute fonts."""
from pathlib import Path
from zipfile import ZipFile
from docx import Document
import json,fitz,subprocess,re,unicodedata,hashlib
root=Path(__file__).resolve().parents[1]
out=root/'test-output'
expected={'TimesNewRomanPSMT','TimesNewRomanPS-BoldMT','TimesNewRomanPS-ItalicMT','TimesNewRomanPS-BoldItalicMT'}
results=[]
for name in ['schedule-times.pdf','schedule-times-stamped.pdf','schedule-times-long.pdf','times-four-styles.pdf','schedule-times-reloaded.pdf']:
 doc=fitz.open(out/name)
 fonts={re.sub(r'^[A-Z]{6}\+','',f[3]) for p in doc for f in p.get_fonts()}
 assert fonts==expected,(name,fonts)
 for p in doc:
  assert abs(p.rect.width-595.28)<1 and abs(p.rect.height-841.89)<1
  for f in p.get_fonts():assert doc.extract_font(f[0])[3],(name,f)
  for x0,y0,x1,y1,*_ in p.get_text('blocks'):
   assert x0>=45 and x1<=553 and y0>=44 and y1<=795,(name,p.number,(x0,y0,x1,y1))
 if name!='times-four-styles.pdf':
  expected_header={
   'ĐẢNG UỶ XÃ LỆ NINH':False, 'VĂN PHÒNG':True,
   '*':True, 'LỊCH CÔNG TÁC TUẦN':True, 'CỦA BAN THƯỜNG VỤ ĐẢNG UỶ':True,
  }
  spans={span['text'].strip():span for block in doc[0].get_text('dict', flags=fitz.TEXTFLAGS_TEXT)['blocks']
         for line in block['lines'] for span in line['spans'] if span['bbox'][1]<90}
  for heading,bold in expected_header.items():
   assert bool(spans[heading]['flags'] & fitz.TEXT_FONT_BOLD)==bold,(name,heading,spans[heading])
 text='\n'.join(p.get_text() for p in doc);assert '\ufffd' not in text
 if name!='times-four-styles.pdf':
  assert 'LỊCH CÔNG TÁC TUẦN' in text and 'Chủ nhật' in text and 'điều chỉnh phù hợp' in text
 if name=='schedule-times.pdf':assert 'Tiếng Việt đầy đủ: Đảng ủy xã Lệ Ninh' in ' '.join(text.split())
 if name=='schedule-times-long.pdf':
  assert len(doc)>1
  for i in range(1,25):assert f'Hoạt động {i}:' in text
 stamped=name in ['schedule-times-stamped.pdf','schedule-times-long.pdf']
 for p in doc:
  assert len(p.get_images())==(1 if stamped and p.number==0 else 0)
  if stamped and p.number==0:
   rect=p.get_image_rects(p.get_images()[0][0])[0]
   assert all(abs(a-b)<.1 for a,b in zip([rect.x0,rect.y0,rect.width,rect.height],[91,32,113,113]))
 font_report=subprocess.check_output(['pdffonts',str(out/name)],text=True)
 assert 'Liberation' not in font_report and not re.search(r'\bTimes-Roman\b',font_report)
 rows=font_report.splitlines()[2:];assert len(rows)==4
 assert all('yes yes yes' in ' '.join(row.split()) for row in rows)
 (out/(name+'.pdffonts.txt')).write_text(font_report)
 results.append({'file':name,'pages':len(doc),'fonts':sorted(fonts),'all_embedded_subset_unicode':True,'a4':True,'text_bounds_ok':True,'stamp_first_page_only':stamped})
 print('PASS',name,len(doc),'pages; four embedded real TNR styles; Unicode/bounds/stamp OK')
inv=fitz.open(out/'invitation-unchanged.pdf');assert all('Liberation' in f[3] for p in inv for f in p.get_fonts())
for name in ['schedule-word.docx','schedule-word-no-font.docx']:
 word=Document(out/name);assert len(word.tables[-1].rows)==7
 headings=[(p.text,bool(p.runs[0].bold)) for cell in word.tables[0].rows[0].cells
           for p in cell.paragraphs if p.text in expected_header]
 assert dict(headings)=={**expected_header,'*':False},headings
with ZipFile(out/'schedule-word.docx') as z:assert not any(n.startswith('word/media/') for n in z.namelist())
backup=json.loads((out/'schedule-backup.json').read_text());assert backup['format']=='le-ninh-local-backup' and backup['version']==1
# Frozen baseline digests avoid depending on an unpublished historical commit.
protected={'giay-moi.html': '4527488d3909f31320dcdf2ae420885976427b5ff2bd86e7cd469d60d803f0dd', 'index.html': '988b6f37c4882807048982204bf7ec025f3c9e389481e87dd09e26023580c096', 'HUONG_DAN.html': 'c0f6492b04f85ad7cad5a1e44b7bd557fdbb0d06225550145fd2c7beaa7afc0e', 'assets/logo.png': 'bb97f2a27055a06fa5b6b51f32e6c64dcdc8c0806e9901817f574b244ce5092b', 'assets/dau_van_phong_can_tron.png': 'e60dab1daf2e580aab62fe20f2733c90e3d8b841f4a29cc2ea49c0b8e8b8f66d', 'assets/templates/mau_btv.docx': 'b354e6b5918fa209c08ef7daab496211e2fa4280720cafabb718a29a28a4aeda', 'assets/templates/mau_thuong_truc.docx': 'c36264943b0b85df22b728a71fb3691a708c5e5a53383b09fa31d1300e5eb049', 'assets/templates/mau_khac.docx': '8818b310e6f71b6e4aa091d986b38103991d71e5d53e4d1e80fca55ef843d242', 'src/core.js': '2612587327380569457fbcf0529553cecf3350dc091ff6ddd30ba720de31e185', 'src/storage.js': '562af9aad71dbc0666ab5f400f2d6e1a28bf90e1302c962762b37b4faa675b94', 'src/stamp.js': 'a3c42aba2b5976cf869f7f4566730cb129e1c56f75f1408697ac37b0c760af4b'}
for name,digest in protected.items():
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest,name
(out/'tnr-export-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('PASS invitation path, original HTML/templates/logo/seal and calendar storage/normalization code unchanged.')
