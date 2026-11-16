/**
 * 智能任务管理系统 · 前端逻辑
 * 所有数据通过后端 /api/tasks 与 Supabase 交互
 */

const API = '/api/tasks';

const PRIORITY_LABEL = { high: '高', medium: '中', low: '低' };

/**
 * 数据库里 priority 存的是中文「高 / 中 / 低」，
 * 前端和样式里用 high / medium / low 作为内部键，这里做双向映射。
 */
const TO_DB = { high: '高', medium: '中', low: '低' };
const FROM_DB = { 高: 'high', 中: 'medium', 低: 'low' };

function normalizeTask(task) {
  return { ...task, priority: FROM_DB[task.priority] || task.priority };
}

const state = {
  tasks: [],
  filter: 'all',
  loading: true,
};

const els = {
  form: document.getElementById('taskForm'),
  title: document.getElementById('titleInput'),
  priority: document.getElementById('prioritySelect'),
  addBtn: document.getElementById('addBtn'),
  filters: document.getElementById('filters'),
  list: document.getElementById('taskList'),
  empty: document.getElementById('emptyState'),
  emptyText: document.getElementById('emptyText'),
  loading: document.getElementById('loadingState'),
  banner: document.getElementById('errorBanner'),
};

/* ---------------- 工具函数 ---------------- */

function showError(message) {
  els.banner.textContent = message;
  els.banner.hidden = false;
  clearTimeout(showError._timer);
  showError._timer = setTimeout(() => {
    els.banner.hidden = true;
  }, 4000);
}

function formatTime(iso) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hm}`;
  }
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${hm}`;
}

function visibleTasks() {
  if (state.filter === 'all') return state.tasks;
  return state.tasks.filter((t) => t.priority === state.filter);
}

/* ---------------- 渲染 ---------------- */

function renderCounts() {
  const counts = { all: state.tasks.length, high: 0, medium: 0, low: 0 };
  state.tasks.forEach((t) => {
    counts[t.priority] = (counts[t.priority] || 0) + 1;
  });
  document.querySelectorAll('[data-count]').forEach((el) => {
    el.textContent = counts[el.dataset.count] ?? 0;
  });
}

function renderFilters() {
  els.filters.querySelectorAll('.filters__item').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.filter === state.filter);
  });
}

function buildTaskItem(task) {
  const li = document.createElement('li');
  li.className = 'task' + (task.completed ? ' is-done' : '');
  li.dataset.id = task.id;
  li.dataset.priority = task.priority;

  const body = document.createElement('div');
  body.className = 'task__body';

  const title = document.createElement('p');
  title.className = 'task__title';
  title.textContent = task.title; // 用 textContent，天然防 XSS

  const meta = document.createElement('div');
  meta.className = 'task__meta';

  const pill = document.createElement('span');
  pill.className = `pill pill--${task.priority}`;
  pill.textContent = `${PRIORITY_LABEL[task.priority]}优先级`;

  const status = document.createElement('span');
  status.textContent = task.completed ? '已完成' : '进行中';

  const time = document.createElement('span');
  time.textContent = formatTime(task.created_at);

  meta.append(pill, status, time);
  body.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'task__actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn-mini ' + (task.completed ? 'btn-mini--undo' : 'btn-mini--done');
  toggleBtn.textContent = task.completed ? '标为未完成' : '完成';
  toggleBtn.addEventListener('click', () => toggleTask(task, toggleBtn));

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn-mini btn-mini--del';
  delBtn.textContent = '删除';
  delBtn.addEventListener('click', () => deleteTask(task, li, delBtn));

  actions.append(toggleBtn, delBtn);
  li.append(body, actions);
  return li;
}

function render() {
  const list = visibleTasks();

  els.list.innerHTML = '';
  list.forEach((task) => els.list.appendChild(buildTaskItem(task)));

  els.loading.hidden = true;
  els.empty.hidden = list.length > 0;

  if (list.length === 0) {
    if (state.tasks.length === 0) {
      els.emptyText.textContent = '还没有任务，从上面添加第一条吧';
    } else {
      els.emptyText.textContent = `当前没有「${PRIORITY_LABEL[state.filter]}」优先级的任务`;
    }
  }

  renderCounts();
  renderFilters();
}

/* ---------------- 接口调用 ---------------- */

async function loadTasks() {
  state.loading = true;
  els.loading.hidden = false;
  try {
    const res = await fetch(API, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error((await res.json()).error || '加载任务失败');
    state.tasks = (await res.json()).map(normalizeTask);
  } catch (err) {
    state.tasks = [];
    showError(err.message || '加载任务失败，请检查后端服务是否启动');
  } finally {
    state.loading = false;
    render();
  }
}

async function addTask(title, priority) {
  els.addBtn.disabled = true;
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, priority: TO_DB[priority] || priority }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '添加失败');

    // 后端已按创建时间倒序，这里放到列表最前
    const task = normalizeTask(data);
    state.tasks.unshift(task);
    if (state.filter !== 'all' && state.filter !== task.priority) {
      state.filter = 'all'; // 新任务不在当前筛选里，自动切回全部，避免"消失了"
    }
    render();
    els.title.value = '';
    els.title.focus();
  } catch (err) {
    showError(err.message || '添加任务失败');
  } finally {
    els.addBtn.disabled = false;
  }
}

async function toggleTask(task, btn) {
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !task.completed }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '更新失败');

    const task = normalizeTask(data);
    const idx = state.tasks.findIndex((t) => t.id === task.id);
    if (idx > -1) state.tasks[idx] = task;
    render();
  } catch (err) {
    btn.disabled = false;
    showError(err.message || '更新任务状态失败');
  }
}

async function deleteTask(task, li, btn) {
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/${task.id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || '删除失败');

    li.classList.add('is-removing');
    li.addEventListener('animationend', () => {
      state.tasks = state.tasks.filter((t) => t.id !== task.id);
      render();
    }, { once: true });
    // 若动画未触发（例如系统关闭了动画），兜底移除
    setTimeout(() => {
      if (state.tasks.some((t) => t.id === task.id)) {
        state.tasks = state.tasks.filter((t) => t.id !== task.id);
        render();
      }
    }, 400);
  } catch (err) {
    btn.disabled = false;
    showError(err.message || '删除失败');
  }
}

/* ---------------- 事件绑定 ---------------- */

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = els.title.value.trim();
  if (!title) {
    els.title.focus();
    showError('请先输入任务标题');
    return;
  }
  addTask(title, els.priority.value);
});

els.filters.addEventListener('click', (e) => {
  const btn = e.target.closest('.filters__item');
  if (!btn) return;
  state.filter = btn.dataset.filter;
  render();
});

// 启动
loadTasks();
