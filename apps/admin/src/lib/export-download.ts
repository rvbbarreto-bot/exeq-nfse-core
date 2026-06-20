export async function downloadCsvExport(
  path: string,
  token: string,
  query: Record<string, string>,
  filename: string,
): Promise<void> {
  const qs = new URLSearchParams(query).toString();
  const url = qs ? `${path}?${qs}` : path;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
