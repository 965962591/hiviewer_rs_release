const api = window.hiviewer, video = document.querySelector('#video'), status = document.querySelector('#status');
try {
  await api.ready;
  const [file] = await api.selection.get();
  if (!file) throw new Error('Select a video first');
  const resource = await api.media.video(file.path); video.src = resource.url;
  document.querySelector('#rate').addEventListener('change', event => { video.playbackRate = Number(event.target.value); });
  video.addEventListener('timeupdate', () => { document.querySelector('#time').textContent = `${video.currentTime.toFixed(2)} / ${Number.isFinite(video.duration) ? video.duration.toFixed(2) : '…'} seconds`; });
  video.addEventListener('error', () => { status.textContent = `Playback failed: ${video.error?.message ?? 'unsupported codec'}`; });
  addEventListener('pagehide', () => { video.pause(); video.removeAttribute('src'); video.load(); });
} catch (error) { status.textContent = String(error); }
