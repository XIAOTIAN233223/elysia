import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE = "homework";
const store = () => getStore(STORE);

const KEY = {
  folders: "folders",
  item: (id) => `item/${id}`,
  comments: (id) => `comments/${id}`,
  img: (file) => `img/${file}`,
};

const MIME_FROM_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

const EXT_FROM_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const MAX_TEXT = 5000;
const MAX_FOLDER_NAME = 40;
const MAX_NICKNAME = 24;
const MAX_COMMENT = 1000;
const MAX_IMAGES = 12;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function fail(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

function safe(id) {
  return String(id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

function newId() {
  return randomUUID();
}

async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function getFolders() {
  const v = await store().get(KEY.folders, { type: "json" });
  return Array.isArray(v) ? v : [];
}

async function saveFolders(folders) {
  await store().setJSON(KEY.folders, folders);
}

async function getItems() {
  const res = await store().list({ prefix: "item/" });
  const keys = (res.blobs || []).map((b) => b.key);
  const items = await Promise.all(
    keys.map(async (key) => {
      try {
        const doc = await store().get(key, { type: "json" });
        return doc && typeof doc.id === "string" ? doc : null;
      } catch {
        return null;
      }
    })
  );
  return items.filter(Boolean);
}

async function getItem(id) {
  id = safe(id);
  if (!id) return null;
  const doc = await store().get(KEY.item(id), { type: "json" });
  return doc && typeof doc.id === "string" ? doc : null;
}

async function saveItem(doc) {
  await store().setJSON(KEY.item(doc.id), doc);
}

async function getComments(id) {
  const v = await store().get(KEY.comments(safe(id)), { type: "json" });
  return Array.isArray(v) ? v : [];
}

async function saveComments(id, arr) {
  await store().setJSON(KEY.comments(safe(id)), arr);
}

async function snapshot() {
  const [folders, items] = await Promise.all([getFolders(), getItems()]);
  const withComments = await Promise.all(
    items.map(async (it) => ({ ...it, comments: await getComments(it.id) }))
  );
  withComments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return json({ ok: true, folders, items: withComments });
}

async function createItem(req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    return fail("表单数据无法解析");
  }

  const text = String(form.get("text") || "").trim();
  const folderId = String(form.get("folderId") || "").trim();
  const files = (form.getAll("images") || []).filter(
    (f) => f && typeof f.arrayBuffer === "function"
  );

  if (!text && files.length === 0) return fail("请填写文字说明或选择图片");
  if (text.length > MAX_TEXT) return fail(`文字说明不能超过 ${MAX_TEXT} 字`);
  if (files.length > MAX_IMAGES) return fail(`单条作业最多上传 ${MAX_IMAGES} 张图片`);

  const folders = await getFolders();
  if (folderId && !folders.some((f) => f.id === folderId)) {
    return fail("所选文件夹不存在，请刷新后重试");
  }

  const id = newId();
  const images = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const type = String(file.type || "").toLowerCase();
    let ext = EXT_FROM_TYPE[type];
    if (!ext) {
      const dot = String(file.name || "").lastIndexOf(".");
      const candidate = dot >= 0 ? String(file.name).slice(dot + 1).toLowerCase() : "";
      ext = MIME_FROM_EXT[candidate] ? candidate : null;
    }
    if (!ext) continue;

    const buf = await file.arrayBuffer();
    const fileKey = `${id}-${i}.${ext}`;
    await store().set(KEY.img(fileKey), buf);
    images.push({ file: fileKey, type: MIME_FROM_EXT[ext] });
  }

  const doc = {
    id,
    folderId: folderId || null,
    text,
    images,
    createdAt: Date.now(),
  };
  await saveItem(doc);

  return json({ ok: true, item: { ...doc, comments: [] } });
}

async function deleteItem(id) {
  id = safe(id);
  const item = await getItem(id);
  if (!item) return fail("作业不存在", 404);

  await Promise.all(
    (item.images || []).map((img) =>
      store().delete(KEY.img(img.file)).catch(() => {})
    )
  );
  await Promise.all([
    store().delete(KEY.item(id)),
    store().delete(KEY.comments(id)),
  ]);

  return json({ ok: true });
}

async function createFolder(req) {
  const body = await readJsonBody(req);
  const name = String((body && body.name) || "").trim();
  if (!name || name.length > MAX_FOLDER_NAME) {
    return fail(`文件夹名称需为 1-${MAX_FOLDER_NAME} 个字符`);
  }
  const folders = await getFolders();
  if (folders.some((f) => f.name === name)) return fail("已存在同名文件夹");

  const folder = { id: newId(), name, createdAt: Date.now() };
  folders.push(folder);
  await saveFolders(folders);
  return json({ ok: true, folder });
}

async function renameFolder(id, req) {
  id = safe(id);
  const body = await readJsonBody(req);
  const name = String((body && body.name) || "").trim();
  if (!name || name.length > MAX_FOLDER_NAME) {
    return fail(`文件夹名称需为 1-${MAX_FOLDER_NAME} 个字符`);
  }
  const folders = await getFolders();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx < 0) return fail("文件夹不存在", 404);
  if (folders.some((f) => f.id !== id && f.name === name)) {
    return fail("已存在同名文件夹");
  }
  folders[idx].name = name;
  await saveFolders(folders);
  return json({ ok: true, folder: folders[idx] });
}

async function deleteFolder(id) {
  id = safe(id);
  const folders = await getFolders();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx < 0) return fail("文件夹不存在", 404);
  folders.splice(idx, 1);
  await saveFolders(folders);

  const items = await getItems();
  for (const item of items) {
    if (item.folderId === id) {
      item.folderId = null;
      await saveItem(item);
    }
  }
  return json({ ok: true });
}

async function addComment(id, req) {
  id = safe(id);
  const item = await getItem(id);
  if (!item) return fail("作业不存在", 404);

  const body = await readJsonBody(req);
  const nickname = String((body && body.nickname) || "").trim();
  const text = String((body && body.text) || "").trim();
  if (!nickname || nickname.length > MAX_NICKNAME) {
    return fail(`昵称需为 1-${MAX_NICKNAME} 个字符`);
  }
  if (!text || text.length > MAX_COMMENT) {
    return fail(`评论需为 1-${MAX_COMMENT} 个字符`);
  }

  const comments = await getComments(id);
  const comment = { id: newId(), nickname, text, createdAt: Date.now() };
  comments.push(comment);
  await saveComments(id, comments);

  return json({ ok: true, comment });
}

async function serveImage(file) {
  file = String(file || "");
  if (!/^[A-Za-z0-9._-]+$/.test(file)) return fail("无效的图片地址", 404);
  const ext = file.includes(".") ? file.split(".").pop().toLowerCase() : "";
  const mime = MIME_FROM_EXT[ext];
  if (!mime) return fail("不支持的图片格式", 404);

  const data = await store().get(KEY.img(file), { type: "arrayBuffer" });
  if (data == null) return new Response("", { status: 404 });

  return new Response(data, {
    headers: {
      "content-type": mime,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

export async function handle(req, pathname) {
  const clean = pathname.replace(/^\/api\/?/, "");
  const parts = clean.split("/").filter(Boolean);
  const method = (req.method || "GET").toUpperCase();

  try {
    if (method === "GET") {
      if (parts.length === 0 || parts[0] === "snapshot") return await snapshot();
      if (parts[0] === "img" && parts.length >= 2) return await serveImage(parts[1]);
      return fail("Not found", 404);
    }

    if (parts[0] === "items") {
      if (parts.length === 1 && method === "POST") return await createItem(req);
      if (parts.length === 2 && method === "DELETE") return await deleteItem(parts[1]);
      if (parts.length === 3 && parts[2] === "comments" && method === "POST") {
        return await addComment(parts[1], req);
      }
    }

    if (parts[0] === "folders") {
      if (parts.length === 1 && method === "POST") return await createFolder(req);
      if (parts.length === 2 && method === "PATCH") return await renameFolder(parts[1], req);
      if (parts.length === 2 && method === "DELETE") return await deleteFolder(parts[1]);
    }

    return fail("Not found", 404);
  } catch (err) {
    console.error("[homework api]", err);
    return fail("服务器出现错误，请稍后重试", 500);
  }
}