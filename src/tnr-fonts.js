import {validateSet, ROLES} from './tnr-validate.js';

const filenames = {
  normal: 'TimesNewRoman-Regular.ttf',
  bold: 'TimesNewRoman-Bold.ttf',
  italics: 'TimesNewRoman-Italic.ttf',
  bolditalics: 'TimesNewRoman-BoldItalic.ttf'
};
let defaultSet;

async function loadDefaultSet() {
  const faces = await Promise.all(ROLES.map(async role => {
    const filename = filenames[role];
    const url = new URL('./assets/fonts/times-new-roman/' + filename, document.baseURI);
    let response;
    try {
      response = await fetch(url, {mode: 'same-origin', redirect: 'error'});
    } catch {
      throw Error('Không tải được font ' + filename + '.');
    }
    if (!response.ok) throw Error('Không tải được font ' + filename + ' (HTTP ' + response.status + ').');
    return {buffer: await response.arrayBuffer()};
  }));
  const record = {version: 1, faces};
  const validated = validateSet(record);
  for (const [index, role] of ROLES.entries()) {
    if (validated[role].buffer !== faces[index].buffer) {
      throw Error(filenames[role] + ' không đúng kiểu chữ.');
    }
  }
  return record;
}

export async function resources(text = '') {
  defaultSet ??= loadDefaultSet().catch(error => {
    defaultSet = undefined;
    throw Error('Bộ Times New Roman mặc định chưa sẵn sàng. Vui lòng liên hệ quản trị website. ' + error.message);
  });
  const faces = validateSet(await defaultSet, text);
  const vfs = {}, map = {};
  for (const role of ROLES) {
    const filename = filenames[role];
    const bytes = new Uint8Array(faces[role].buffer);
    let value = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      value += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    vfs[filename] = btoa(value);
    map[role] = filename;
  }
  return {fonts: {TimesNewRoman: map}, vfs};
}
