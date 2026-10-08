const api = window.hiviewer;
const status = document.querySelector('#status'), canvas = document.querySelector('#preview'), slider = document.querySelector('#exposure'), save = document.querySelector('#save');
let original;
function render() {
  const pixels = new Uint8ClampedArray(original.data), gain = 2 ** Number(slider.value);
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] *= gain; pixels[i + 1] *= gain; pixels[i + 2] *= gain; }
  canvas.getContext('2d').putImageData(new ImageData(pixels, original.width, original.height), 0, 0);
}
try {
  await api.ready;
  const [file] = await api.selection.get();
  if (!file) throw new Error('Select an image first');
  const resource = await api.media.preview(file.path);
  try {
    const bytes = await api.media.readBytes(resource.resourceId);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    original = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    slider.addEventListener('input', render); save.disabled = false;
  } finally { await api.media.release(resource.resourceId); }
} catch (error) { status.textContent = String(error); }
save.addEventListener('click', async () => {
  save.disabled = true;
  try { const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); status.textContent = await api.exports.save('processed-preview.png', await blob.arrayBuffer()) ?? 'Export cancelled'; }
  catch (error) { status.textContent = String(error); } finally { save.disabled = false; }
});
