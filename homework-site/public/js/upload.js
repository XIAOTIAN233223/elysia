"use strict";

const $ = (sel) => document.querySelector(sel);

let files = [];
let folders = [];

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3000);
}

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

async function loadFolders() {
  const data = await api("/snapshot");
  folders = data.folders || [];
  renderFolderSelect();
}

function renderFolderSelect() {
  const sel = $("#folderSelect");
  sel.textContent = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "不分类（默认展示在“全部作业”）";
  sel.appendChild(none);
  folders.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    sel.appendChild(opt);
  });
}

function renderPreviews() {
  const grid = $("#previewGrid");
  grid.textContent = "";
  files.forEach((file, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "preview";
    if (file.type && file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      wrap.appendChild(img);
    } else {
      wrap.textContent = "📄";
    }
    const rm = document.createElement("button");
    rm.className = "remove";
    rm.type = "button";
    rm.textContent = "×";
    rm.title = "移除";
    rm.addEventListener("click", () => {
      files.splice(idx, 1);
      renderPreviews();
    });
    wrap.appendChild(rm);
    grid.appendChild(wrap);
  });
}

function addFiles(list) {
  const images = Array.from(list || []).filter((f) =>
    f && f.type && f.type.startsWith("image/")
  );
  if (!images.length) { toast("请选择图片文件"); return; }
  const remaining = 12 - files.length;
  if (images.length > remaining) {
    toast(`最多上传 12 张图片，当前还能添加 ${remaining} 张`);
  }
  files.push(...images.slice(0, remaining));
  renderPreviews();
}

async function publish() {
  const text = $("#textInput").value.trim();
  if (!files.length && !text) { toast("请填写文字说明或选择图片"); return; }

  const btn = $("#btnPublish");
  btn.disabled = true;
  btn.textContent = "发布中…";

  const fd = new FormData();
  fd.append("text", text);
  fd.append("folderId", $("#folderSelect").value);
  files.forEach((f) => fd.append("images", f));

  try {
    await api("/items", { method: "POST", body: fd });
    $("#formCard").hidden = true;
    $("#successCard").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "发布作业";
  }
}

function reset() {
  files = [];
  $("#textInput").value = "";
  $("#folderSelect").value = "";
  renderPreviews();
}

/* init */
const drop = $("#fileDrop");
drop.addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", (e) => addFiles(e.target.files));

["dragover", "dragenter"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); })
);
drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

$("#btnPublish").addEventListener("click", publish);

$("#btnAgain").addEventListener("click", () => {
  reset();
  $("#formCard").hidden = false;
  $("#successCard").hidden = true;
});

loadFolders().catch((e) => toast(e.message));