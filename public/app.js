import { parse, parseTags, serialize, validPath } from './markdown.js';

const $ = selector => document.querySelector(selector);
const state = { files: [], group: null, open: null, raw: false, admin: false, editor: null, pendingDelete: null, password: false, busy: false, commands: [], historyIndex: 0 };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, action, className = '', label) {
  const node = el('button', className, text);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  node.addEventListener('click', () => Promise.resolve(action()).catch(error => print(error.message, 'error')));
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth') { state.admin = false; renderPrompt(); }
    throw new Error(data.error || `request failed (${response.status}).`);
  }
  return data;
}

function print(message, kind = '') {
  const history = $('#history');
  for (const line of String(message).split('\n')) history.append(el('div', `history-line ${kind}`, line || '\u00a0'));
  while (history.childElementCount > 40) history.firstElementChild.remove();
}

function tagKeys() { return [...new Set(state.files.flatMap(file => Object.keys(file.tags)))]; }
function fileFor(name) { return state.files.find(file => file.path === name || file.path === `${name}.md`); }

function setHash(path) {
  const hash = path ? `#/${encodeURIComponent(path)}` : '';
  if (location.hash !== hash) history.pushState(null, '', location.pathname + location.search + hash);
}

function openFile(path, toggle = false) {
  state.editor = null;
  state.raw = false;
  state.open = toggle && state.open === path ? null : path;
  setHash(state.open);
  renderTree();
}

function setGroup(key) { state.group = key; renderGroups(); renderTree(); }

function renderGroups() {
  const node = $('#grouping');
  node.replaceChildren(el('span', 'muted', '--group-by'));
  for (const key of [null, ...tagKeys()]) {
    const option = button(key ?? 'none', () => setGroup(key), state.group === key ? 'active' : 'muted');
    option.setAttribute('aria-pressed', String(state.group === key));
    node.append(option);
  }
}

function header(command, actions) {
  const node = el('div', 'view-header');
  const title = el('div', 'view-command');
  title.append(el('span', 'muted', '$ '), document.createTextNode(command));
  const controls = el('div', 'actions');
  controls.append(...actions);
  node.append(title, controls);
  return node;
}

function fileView(file, nested) {
  const node = el('section', `file-view${nested ? ' nested' : ''}`);
  node.setAttribute('aria-label', file.path);
  node.append(header(`cat ${file.path}`, [
    button(state.raw ? 'rendered' : 'raw', () => { state.raw = !state.raw; renderTree(); }, state.raw ? 'active' : '', 'Toggle raw markdown'),
    button('close', () => openFile(null), '', `Close ${file.path}`),
  ]));
  if (state.raw) node.append(el('pre', '', file.raw));
  else {
    if (file.fm) node.append(el('pre', 'frontmatter', file.fm), el('hr'));
    if (file.h1) node.append(el('h1', '', file.h1));
    for (const paragraph of file.paras) node.append(el('p', '', paragraph));
  }
  return node;
}

function addFile(tree, file, prefix, nested = false) {
  const row = el('div', 'tree-row');
  const link = el('a', `file-link${state.open === file.path ? ' active' : ''}`, file.path);
  link.href = `#/${encodeURIComponent(file.path)}`;
  link.setAttribute('aria-expanded', String(state.open === file.path));
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); openFile(file.path, true);
  });
  const branch = el('span', 'tree-prefix', prefix);
  branch.setAttribute('aria-hidden', 'true');
  row.append(branch, link);
  if (state.admin) {
    const controls = el('span', 'file-actions');
    controls.append(button('edit', () => editFile(file), '', `Edit ${file.path}`));
    if (file.path !== 'README.md') controls.append(button(state.pendingDelete === file.path ? 'delete? yes' : 'delete', () => deleteFile(file), '', `Delete ${file.path}`));
    row.append(controls);
  }
  tree.append(row);
  if (state.editor?.path === file.path && !state.editor.isNew) tree.append(editorView(nested));
  else if (state.open === file.path) tree.append(fileView(file, nested));
}

function renderTree() {
  const tree = $('#tree');
  tree.replaceChildren();
  const readme = state.files.find(file => file.path === 'README.md');
  const projects = state.files.filter(file => file.path !== 'README.md');
  let directories = 0;
  if (state.group === null) {
    const files = readme ? [readme, ...projects] : projects;
    files.forEach((file, index) => addFile(tree, file, index === files.length - 1 ? '└── ' : '├── '));
  } else {
    const groups = new Map();
    const missing = [];
    for (const file of projects) {
      if (!Object.hasOwn(file.tags, state.group)) { missing.push(file); continue; }
      const value = file.tags[state.group];
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(file);
    }
    const entries = [...groups].sort(([a], [b]) => a.localeCompare(b));
    if (missing.length) entries.push(['unknown', missing]);
    directories = entries.length;
    if (readme) addFile(tree, readme, entries.length ? '├── ' : '└── ');
    entries.forEach(([name, files], index) => {
      const last = index === entries.length - 1;
      const row = el('div', 'tree-row tree-folder');
      const prefix = el('span', 'tree-prefix', last ? '└── ' : '├── ');
      prefix.setAttribute('aria-hidden', 'true');
      row.append(prefix, document.createTextNode(`${name}/`));
      tree.append(row);
      files.forEach((file, i) => addFile(tree, file, `${last ? '    ' : '│   '}${i === files.length - 1 ? '└── ' : '├── '}`, true));
    });
  }
  if (state.admin) {
    const row = el('div', 'new-row');
    row.append(button('+ new.md', () => editFile(null), 'accent'));
    tree.append(row);
    if (state.editor?.isNew) tree.append(editorView(false));
  }
  $('#summary').textContent = `${directories} ${directories === 1 ? 'directory' : 'directories'}, ${state.files.length} ${state.files.length === 1 ? 'file' : 'files'}`;
  requestAnimationFrame(() => document.querySelectorAll('textarea').forEach(grow));
}

function requireAdmin() {
  if (!state.admin) throw new Error('permission denied. try sudo.');
}

function editFile(file, name = '') {
  requireAdmin();
  state.pendingDelete = null;
  state.editor = {
    isNew: !file, path: file?.path || name,
    name: file?.name || '', url: file?.url || '', tags: JSON.stringify(file?.tags || {}, null, 2),
    h1: file?.h1 || '', body: file?.body || '', error: '', saving: false,
  };
  state.open = file?.path || null;
  setHash(state.open);
  renderTree();
  requestAnimationFrame(() => $('.editor input, .editor textarea')?.focus({ preventScroll: true }));
}

function grow(textarea) { textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; }

function editorInput(field, multiline = false, placeholder = '') {
  const draft = state.editor;
  const input = el(multiline ? 'textarea' : 'input');
  input.name = field;
  input.value = draft[field];
  input.placeholder = placeholder;
  input.setAttribute('aria-label', field === 'path' ? 'File name' : field === 'h1' ? 'Title' : field === 'tags' ? 'Tags JSON' : field[0].toUpperCase() + field.slice(1));
  input.spellcheck = false;
  input.autocomplete = 'off';
  if (multiline) input.rows = 1;
  input.addEventListener('input', () => { draft[field] = input.value; if (multiline) grow(input); });
  return input;
}

function cancelEdit() { state.editor = null; renderTree(); }

function editorView(nested) {
  const draft = state.editor;
  const form = el('form', `editor${nested ? ' nested' : ''}`);
  form.setAttribute('aria-label', 'Markdown editor');
  const save = button(draft.saving ? 'saving…' : ':wq save', () => saveEditor(), 'accent');
  save.disabled = draft.saving;
  const cancel = button(':q! cancel', cancelEdit);
  cancel.disabled = draft.saving;
  form.append(header(`vi ${draft.path || 'new.md'}`, [save, cancel]));
  if (draft.path !== 'README.md' || draft.isNew) {
    const front = el('div', 'editor-frontmatter');
    front.append(el('div', '', '---'));
    for (const field of [...(draft.isNew ? ['path'] : []), 'name', 'url']) {
      const label = el('label', 'editor-field');
      label.append(el('span', '', `${field === 'path' ? 'file' : field}:`), editorInput(field, false, field === 'path' ? 'project-name.md' : ''));
      front.append(label);
    }
    const tagsLabel = el('label');
    tagsLabel.append(el('span', '', 'tags:'), editorInput('tags', true));
    front.append(tagsLabel, el('div', '', '---'));
    const title = el('label', 'editor-title');
    title.append(el('span', '', '#'), editorInput('h1', false, 'title'));
    form.append(front, title);
  }
  form.append(editorInput('body', true, 'Paragraphs separated by blank lines.'));
  const error = el('div', 'editor-error error', draft.error);
  error.setAttribute('role', 'alert');
  form.append(error);
  form.addEventListener('submit', event => { event.preventDefault(); saveEditor(); });
  form.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); saveEditor(); }
    if (event.key === 'Escape' && !draft.saving) { event.preventDefault(); cancelEdit(); }
  });
  return form;
}

async function saveEditor() {
  const draft = state.editor;
  if (!draft || draft.saving) return;
  try {
    requireAdmin();
    if (!validPath(draft.path)) throw new Error('file must match /^[\\w.-]+\\.md$/.');
    if (draft.isNew && state.files.some(file => file.path === draft.path)) throw new Error('file already exists.');
    const raw = draft.path === 'README.md' ? draft.body : serialize({ ...draft, tags: parseTags(draft.tags) });
    parse(draft.path, raw);
    draft.saving = true;
    draft.error = '';
    renderTree();
    const saved = await api(`/api/files/${encodeURIComponent(draft.path)}`, { method: 'PUT', headers: draft.isNew ? { 'If-None-Match': '*' } : {}, body: JSON.stringify({ raw }) });
    const file = parse(saved.path, saved.raw);
    const index = state.files.findIndex(item => item.path === file.path);
    if (index === -1) state.files.push(file); else state.files[index] = file;
    state.editor = null;
    if (state.group !== null && !tagKeys().includes(state.group)) state.group = null;
    renderGroups();
    openFile(file.path);
  } catch (error) {
    draft.saving = false;
    draft.error = error.message;
    renderTree();
  }
}

async function deleteFile(file, terminal = false) {
  requireAdmin();
  if (file.path === 'README.md') throw new Error('README.md is protected.');
  if (state.pendingDelete !== file.path) {
    state.pendingDelete = file.path;
    renderTree();
    if (terminal) print(`delete ${file.path}? repeat rm ${file.path} to confirm.`);
    return;
  }
  await api(`/api/files/${encodeURIComponent(file.path)}`, { method: 'DELETE' });
  state.files = state.files.filter(item => item.path !== file.path);
  state.pendingDelete = null;
  if (state.open === file.path || state.editor?.path === file.path) { state.open = null; state.editor = null; setHash(null); }
  if (state.group !== null && !tagKeys().includes(state.group)) state.group = null;
  renderGroups(); renderTree();
  if (terminal) print(`removed ${file.path}`);
}

function renderPrompt() {
  const input = $('#command');
  $('#prompt-label').textContent = state.password ? 'passphrase: ' : state.admin ? '# ' : '$ ';
  input.type = state.password ? 'password' : 'text';
  input.setAttribute('aria-label', state.password ? 'Passphrase' : 'Terminal command');
  input.autocomplete = state.password ? 'current-password' : 'off';
  input.disabled = state.busy;
  $('#command-wrap').classList.toggle('has-value', Boolean(input.value));
}

const help = [
  'help             list commands',
  'ls               list file paths',
  'cat <file>       print raw markdown',
  'open <file>      open a file',
  'close            close the open file',
  'group <key>      group by a tag (or none)',
  'clear            clear terminal history',
  'sudo             unlock editing',
  'logout           end your session',
  'new [file]       create a file (admin)',
  'edit <file>      edit a file (admin)',
  'rm <file>        delete a file (admin)',
].join('\n');

async function runCommand(value) {
  const [command, ...rest] = value.trim().split(/\s+/);
  const originalArg = rest.join(' ');
  const quoted = /^".*"$/.test(originalArg);
  const arg = quoted ? originalArg.slice(1, -1) : originalArg;
  const file = () => {
    if (!arg) throw new Error(`usage: ${command} <file>`);
    const found = fileFor(arg);
    if (!found) throw new Error(`${arg}: no such file`);
    return found;
  };
  switch (command) {
    case 'help': print(help); break;
    case 'ls': print(state.files.map(file => file.path).join('\n')); break;
    case 'cat': print(file().raw); break;
    case 'open': openFile(file().path); break;
    case 'close': openFile(null); break;
    case 'group':
      if (arg === 'none' && !quoted) setGroup(null);
      else if (tagKeys().includes(arg)) setGroup(arg);
      else throw new Error(`unknown group. valid keys: ${['none', ...tagKeys()].join(', ')}`);
      break;
    case 'clear': $('#history').replaceChildren(); break;
    case 'sudo':
      if (state.admin) print('already authenticated.');
      else state.password = true;
      break;
    case 'logout':
      await api('/api/auth', { method: 'DELETE' });
      state.admin = false; state.editor = null; state.pendingDelete = null;
      renderTree(); print('logged out.'); break;
    case 'new': requireAdmin(); editFile(null, arg ? (arg.endsWith('.md') ? arg : `${arg}.md`) : ''); break;
    case 'edit': requireAdmin(); editFile(file()); break;
    case 'rm': requireAdmin(); await deleteFile(file(), true); break;
    default: throw new Error(`${command}: command not found. try help`);
  }
}

$('#prompt').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) return;
  const input = $('#command');
  const value = input.value;
  if (!value.trim() && !state.password) return;
  input.value = '';
  state.busy = true;
  renderPrompt();
  try {
    if (state.password) {
      await api('/api/auth', { method: 'POST', body: JSON.stringify({ passphrase: value }) });
      state.password = false; state.admin = true;
      print('ok. you can edit now.'); renderTree();
    } else {
      print(`${state.admin ? '#' : '$'} ${value}`, 'input');
      state.commands.push(value);
      if (state.commands.length > 40) state.commands.shift();
      state.historyIndex = state.commands.length;
      await runCommand(value);
    }
  } catch (error) { state.password = false; print(error.message, 'error'); }
  finally {
    state.busy = false; renderPrompt();
    if (!state.editor) input.focus({ preventScroll: true });
  }
});

$('#command').addEventListener('input', renderPrompt);
$('#command').addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    state.password = false; event.target.value = ''; renderPrompt();
  }
  if (!state.password && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    state.historyIndex = Math.max(0, Math.min(state.commands.length, state.historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
    event.target.value = state.commands[state.historyIndex] || '';
    renderPrompt();
    event.target.setSelectionRange(event.target.value.length, event.target.value.length);
  }
});

function readHash() {
  let path;
  try { path = decodeURIComponent(location.hash.replace(/^#\//, '')); } catch { path = ''; }
  state.open = state.files.some(file => file.path === path) ? path : null;
  state.editor = null; state.raw = false;
  renderTree();
}
window.addEventListener('hashchange', readHash);
window.addEventListener('popstate', readHash);

async function start() {
  try {
    const [files, auth] = await Promise.all([api('/api/files'), api('/api/auth')]);
    state.files = files.map(file => parse(file.path, file.raw));
    state.admin = auth.authenticated;
    renderGroups(); readHash(); renderPrompt();
  } catch (error) {
    $('#tree').replaceChildren(button('could not load files. retry', start, 'error'));
    print(error.message, 'error');
  }
}
start();
