const DRIVE = 'https://www.googleapis.com/drive/v3';

async function driveGet(path, token) {
  const res = await fetch(`${DRIVE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive API ${path} → ${res.status}`);
  return res.json();
}

export async function listFolders(token, parentId) {
  const q = encodeURIComponent(
    `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const data = await driveGet(
    `/files?q=${q}&fields=files(id,name)&pageSize=100`,
    token
  );
  return data.files || [];
}

export async function listPDFs(token, folderId) {
  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`
  );
  const data = await driveGet(
    `/files?q=${q}&fields=files(id,name,size,createdTime)&pageSize=100`,
    token
  );
  return data.files || [];
}

export async function downloadPDF(token, fileId) {
  const res = await fetch(`${DRIVE}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive download ${fileId} → ${res.status}`);
  return res.arrayBuffer();
}
