const api = window.hiviewer;
await api.ready;
const search = document.querySelector('#search');
const fields = document.querySelector('#fields');
const status = document.querySelector('#status');
const translations = {
  'en-US': { search: 'Filter fields', name: 'Name', path: 'Path', size: 'Size (bytes)', width: 'Width', height: 'Height', empty: 'No matching fields' },
  'zh-CN': { search: '筛选字段', name: '名称', path: '路径', size: '大小（字节）', width: '宽度', height: '高度', empty: '无匹配字段' },
  'zh-TW': { search: '篩選欄位', name: '名稱', path: '路徑', size: '大小（位元組）', width: '寬度', height: '高度', empty: '無符合欄位' },
};
let files = [];
function render() {
  const t = translations[api.locale] ?? translations['en-US'];
  search.placeholder = t.search;
  search.setAttribute('aria-label', t.search);
  document.documentElement.lang = api.locale;
  fields.replaceChildren();
  const query = search.value.trim().toLocaleLowerCase();
  for (const file of files) {
    for (const [key, value] of [['name', file.filename], ['path', file.path], ['size', file.sizeBytes], ['width', file.width], ['height', file.height]]) {
      if (value == null || !`${t[key]} ${value}`.toLocaleLowerCase().includes(query)) continue;
      const label = document.createElement('dt'); label.textContent = t[key];
      const content = document.createElement('dd'); content.textContent = String(value);
      fields.append(label, content);
    }
  }
  status.textContent = fields.childElementCount ? '' : t.empty;
}
search.addEventListener('input', render);
api.events.on('environment.changed', render);
try { files = await api.selection.get(); render(); }
catch (error) { status.textContent = String(error); }
