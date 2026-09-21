"use strict";

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const state = { folders: [], items: [], active: "all" };
const NICK_KEY = "homework:nickname";

async function api(path, opts) {
  const res = await fetch(`/api${path}`, opts);
  let data = null;
  try { data = await res.json(); }
  catch { data = { ok: false, error: "响应格式错误" }; }
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function imageUrl(file) {
  return `/api/img/${encodeURIComponent(file)}`;
}

/* ---------- render ---------- */

function folderById(id) {
  return state.folders.find((f) => f.id === id);
}

function renderFolderList() {
  const list = $("#folderList");
  list.textContent = "";

  const allBtn = el("button", "folder-item" + (state.active === "all" ? " active" : ""));
  allBtn.innerHTML = `<span class="icon">🗂️</span><span class="name">全部作业</span>`;
  allBtn.addEventListener("click", () => { state.active = "all"; renderAll(); });
  list.appendChild(allBtn);

  for (const f of state.folders) {
    const btn = el("button", "folder-item" + (state.active === f.id ? " active" : ""));
    const icon = el("span", "icon", "📁");
    const name = el("span", "name", f.name);
    btn.append(icon, name);
    btn.title = f.name;
    btn.addEventListener("click", () => { state.active = f.id; renderAll(); });
    list.appendChild(btn);
  }

  $("#btnRenameFolder").disabled = state.active === "all";
  $("#btnRenameFolder").title = state.active === "all" ? "请先选择一个文件夹" : "重命名当前文件夹";
}

function filterItems() {
  if (state.active === "all") return state.items;
  return state.items.filter((i) => i.folderId === state.active);
}

function renderAll() {
  renderFolderList();
  renderGrid();
}

function renderGrid() {
  const grid = $("#grid");
  grid.textContent = "";
  const items = filterItems();

  const activeName = state.active === "all" ? null : (folderById(state.active) || {}).name;
  $("#heading").textContent = activeName ? activeName : "全部作业";
  $("#count").textContent = items.length ? `共 ${items.length} 条` : "";

  if (!items.length) {
    const empty = el("div", "empty");
    empty.append(el("div", "big", "📭"), el("div", "还没有内容，点击右上角「发布作业」开始。"));
    grid.appendChild(empty);
    return;
  }

  items.forEach((item) => grid.appendChild(renderCard(item)));
}

function renderCard(item) {
  const card = el("div", "card");

  if (item.images && item.images.length) {
    const first = item.images[0];
    const thumb = el("div", "thumb" + (item.images.length > 1 ? " multi" : ""));
    thumb.dataset.count = `${item.images.length} 张`;
    const img = el("img");
    img.src = imageUrl(first.file);
    img.alt = "作业图片";
    img.loading = "lazy";
    thumb.appendChild(img);
    thumb.addEventListener("click", () => openLightbox(item.images, 0));
    card.appendChild(thumb);
  }

  const body = el("div", "body");

  if (item.folderId && folderById(item.folderId)) {
    body.appendChild(el("span", "foldername", "📁 " + folderById(item.folderId).name));
  }
  if (item.text) body.appendChild(el("div", "text", item.text));

  const meta = el("div", "meta");
  meta.appendChild(el("span", "", fmtTime(item.createdAt)));
  const actions = el("div", "actions");
  const delB = el("button", "btn ghost", "删除");
  delB.style.padding = "4px 8px";
  delB.style.fontSize = "12px";
  delB.addEventListener("click", async () => {
    if (!confirm("确定删除这条作业吗？该操作不可撤销。")) return;
    try {
      await api(`/items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      toast("已删除");
      await load();
    } catch (e) { toast(e.message); }
  });
  actions.appendChild(delB);
  meta.appendChild(actions);
  body.appendChild(meta);

  body.appendChild(renderComments(item));
  card.appendChild(body);
  return card;
}

function renderComments(item) {
  const wrap = el("div", "comments");
  const comments = item.comments || [];

  if (!comments.length) {
    wrap.appendChild(el("div", "comment-empty", "还没有评论"));
  } else {
    comments
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .forEach((c) => {
        const row = el("div", "comment");
        const head = el("div", "c-head");
        head.appendChild(el("span", "c-nick", c.nickname));
        head.appendChild(el("span", "c-time", fmtTime(c.createdAt)));
        row.appendChild(head);
        row.appendChild(el("div", "c-text", c.text));
        wrap.appendChild(row);
      });
  }

  const box = el("div", "comment-box");
  const input = el("input");
  input.placeholder = "写下评论…";
  input.maxLength = 1000;
  const nickname = getNickname();

  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    let nick = getNickname();
    if (!nick) {
      // eslint-disable-next-line no-alert
      nick = prompt("使用评论需要先设置昵称（仅保存在你的浏览器中）：", nick || "");
      nick = (nick || "").trim();
      if (!nick) { toast("需要先设置昵称才能评论"); return; }
      if (nick.length > 24) { toast("昵称不能超过 24 个字符"); return; }
      setNickname(nick);
    }
    try {
      const data = await api(`/items/${encodeURIComponent(item.id)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: nick, text }),
      });
      input.value = "";
      toast(`评论已发布（${data.comment.nickname}）`);
      await load();
    } catch (e) { toast(e.message); }
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  const send = el("button", "btn", "发布");
  send.addEventListener("click", submit);
  box.append(input, send);
  wrap.appendChild(box);

  return wrap;
}

function getNickname() {
  try { return localStorage.getItem(NICK_KEY) || ""; } catch { return ""; }
}
function setNickname(n) {
  try { localStorage.setItem(NICK_KEY, n); } catch { /* ignore */ }
}

/* ---------- lightbox ---------- */

function openLightbox(images, index) {
  let i = index;
  const lb = el("div", "lightbox");
  const img = el("img");
  img.src = imageUrl(images[i].file);
  lb.appendChild(img);

  const close = () => {
    document.removeEventListener("keydown", onKey);
    lb.remove();
  };

  const onKey = (e) => {
    if (e.key === "Escape") { close(); return; }
    if (images.length <= 1) return;
    if (e.key === "ArrowRight") { i = (i + 1) % images.length; img.src = imageUrl(images[i].file); }
    else if (e.key === "ArrowLeft") { i = (i - 1 + images.length) % images.length; img.src = imageUrl(images[i].file); }
  };

  lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(lb);
}
/* ---------- modal ---------- */

function openModal(titleText, bodyNode, onSave) {
  const backdrop = el("div", "modal-backdrop");
  const modal = el("div", "modal");

  const head = el("div", "modal-head");
  head.appendChild(el("span", "title", titleText));
  const x = el("button", "icon-btn", "×");
  x.addEventListener("click", () => backdrop.remove());
  head.appendChild(x);
  modal.appendChild(head);

  const body = el("div", "modal-body");
  body.appendChild(bodyNode);
  modal.appendChild(body);

  const actions = el("div", "form-actions");
  const cancel = el("button", "btn", "取消");
  cancel.addEventListener("click", () => backdrop.remove());
  const ok = el("button", "btn primary", "确认");
  ok.addEventListener("click", () => {
    const v = onSave();
    if (v && typeof v.then === "function") v.then((r) => { if (r !== false) backdrop.remove(); }).catch(() => {});
    else if (v !== false) backdrop.remove();
  });
  actions.append(cancel, ok);
  modal.appendChild(actions);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const inp = body.querySelector("input, textarea, select");
  if (inp) inp.focus();
}

function promptInModal(titleText, labelText, initial, maxLen) {
  return new Promise((resolve) => {
    const backdrop = el("div", "modal-backdrop");
    const modal = el("div", "modal");

    const head = el("div", "modal-head");
    head.appendChild(el("span", "title", titleText));
    modal.appendChild(head);

    const body = el("div", "modal-body");
    const field = el("label", "field");
    field.appendChild(el("span", "", labelText));
    const input = el("input");
    input.value = initial || "";
    if (maxLen) input.maxLength = maxLen;
    field.appendChild(input);
    body.appendChild(field);
    modal.appendChild(body);

    const actions = el("div", "form-actions");
    const cancel = el("button", "btn", "取消");
    const ok = el("button", "btn primary", "确认");

    const close = (value) => {
      backdrop.remove();
      resolve(value);
    };

    cancel.addEventListener("click", () => close(null));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(null); });

    ok.addEventListener("click", () => {
      const val = input.value.trim();
      if (!val) { toast("内容不能为空"); return; }
      if (maxLen && val.length > maxLen) { toast(`不能超过 ${maxLen} 个字符`); return; }
      close(val);
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") ok.click(); });

    actions.append(cancel, ok);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    input.focus();
  });
}
/* ---------- folder actions ---------- */

async function createFolder() {
  const name = await promptInModal("新建文件夹", "文件夹名称", "", 40);
  if (name === null) return;
  try {
    await api("/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    toast("文件夹已创建");
    await load();
  } catch (e) { toast(e.message); }
}

async function renameActiveFolder() {
  if (state.active === "all") return;
  const f = folderById(state.active);
  if (!f) return;
  const name = await promptInModal("重命名文件夹", "新名称", f.name, 40);
  if (name === null) return;
  try {
    await api(`/folders/${encodeURIComponent(f.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    toast("已重命名");
    await load();
  } catch (e) { toast(e.message); }
}

/* ---------- load ---------- */

async function load() {
  try {
    const data = await api("/snapshot");
    state.folders = data.folders || [];
    state.items = data.items || [];
    if (state.active !== "all" && !state.folders.some((f) => f.id === state.active)) {
      state.active = "all";
    }
    renderAll();
  } catch (e) {
    toast(e.message);
  }
}

/* ---------- init ---------- */

$("#btnNewFolder").addEventListener("click", createFolder);
$("#btnRenameFolder").addEventListener("click", renameActiveFolder);
$("#btnRefresh").addEventListener("click", async () => { await load(); toast("已刷新"); });
$("#btnUpload").addEventListener("click", () => { location.href = "/upload.html"; });

load();