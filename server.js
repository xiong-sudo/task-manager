/**
 * 智能任务管理系统 · 后端服务
 * 技术栈：Node.js + Express + Supabase(PostgreSQL)
 */
require('dotenv').config();

const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;

/**
 * 数据层：用 publishable / anon key 通过 Supabase REST API 访问 tasks 表。
 * 优先读 SUPABASE_ANON_KEY，找不到再退回老的 SUPABASE_SERVICE_KEY。
 */
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
const KEY_LABEL = process.env.SUPABASE_ANON_KEY ? 'publishable/anon' : 'service_role';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('\n[启动失败] 缺少 Supabase 配置。');
  console.error('请复制 .env.example 为 .env，并填入 SUPABASE_URL 与 SUPABASE_ANON_KEY。\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 优先级在数据库里直接存中文值（与 db/schema.sql 的 check 约束保持一致）
const VALID_PRIORITIES = ['高', '中', '低'];
const DEFAULT_PRIORITY = '中';

/** 统一包装异步路由，避免每个 try/catch 重复写 */
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------- 获取任务列表（支持优先级筛选，按创建时间倒序） ---------------- */
app.get(
  '/api/tasks',
  asyncRoute(async (req, res) => {
    const { priority } = req.query;
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: '优先级参数不合法，只能是 高 / 中 / 低' });
    }

    let query = supabase
      .from('tasks')
      .select('id, title, priority, completed, created_at')
      .order('created_at', { ascending: false });

    if (priority) query = query.eq('priority', priority);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  })
);

/* ---------------- 新增任务 ---------------- */
app.post(
  '/api/tasks',
  asyncRoute(async (req, res) => {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    const priority = req.body.priority ?? DEFAULT_PRIORITY;

    if (!title) return res.status(400).json({ error: '任务标题不能为空' });
    if (title.length > 200) return res.status(400).json({ error: '任务标题不能超过 200 个字符' });
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: '优先级只能是 高 / 中 / 低' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({ title, priority })
      .select('id, title, priority, completed, created_at')
      .single();

    if (error) throw error;
    res.status(201).json(data);
  })
);

/* ---------------- 切换完成状态 ---------------- */
app.patch(
  '/api/tasks/:id',
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const { completed } = req.body;

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'completed 必须是布尔值' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ completed })
      .eq('id', id)
      .select('id, title, priority, completed, created_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: '任务不存在或已被删除' });

    res.json(data);
  })
);

/* ---------------- 删除任务 ---------------- */
app.delete(
  '/api/tasks/:id',
  asyncRoute(async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: '任务不存在或已被删除' });

    res.json({ ok: true, id: data.id });
  })
);

/* ---------------- 兜底错误处理 ---------------- */
app.use((err, req, res, _next) => {
  console.error('[API 错误]', err.message || err);
  const status = /duplicate|invalid|violates/i.test(err.message || '') ? 400 : 500;
  res.status(status).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`\n智能任务管理系统已启动：http://localhost:${PORT}`);
  console.log(`数据库：${SUPABASE_URL}`);
  console.log(`鉴权角色：${KEY_LABEL}\n`);
});
