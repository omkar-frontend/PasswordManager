/** Hands a generated file to the browser without ever uploading it anywhere. */
export function downloadFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Give the download a moment to start before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
