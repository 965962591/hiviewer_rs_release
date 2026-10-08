//#region plugins/examples/image-analysis/main.ts
var main_default = { commands: { async run(api) {
	const files = await api.selection.get();
	const rows = [];
	for (const [index, file] of files.entries()) {
		const preview = await api.media.preview(file.path);
		try {
			const bytes = await api.media.readBytes(preview.resourceId);
			const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
			const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
			const context = canvas.getContext("2d");
			context.drawImage(bitmap, 0, 0);
			bitmap.close();
			const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
			let luminance = 0;
			for (let p = 0; p < data.length; p += 4) luminance += .2126 * data[p] + .7152 * data[p + 1] + .0722 * data[p + 2];
			rows.push([
				file.filename,
				Number((luminance / (data.length / 4)).toFixed(2)),
				`${preview.width}×${preview.height}`
			]);
			api.progress((index + 1) / files.length, file.filename);
		} finally {
			await api.media.release(preview.resourceId);
		}
	}
	return {
		title: "Preview luminance (sRGB 0–255)",
		text: "Computed from oriented, downsampled display previews; not RAW sensor measurements.",
		columns: [
			"File",
			"Mean luminance",
			"Preview size"
		],
		rows
	};
} } };
//#endregion
export { main_default as default };
