//#region plugins/examples/exif-provider/main.ts
var main_default = { commands: { async run(api) {
	const files = await api.selection.get();
	const rows = [];
	for (const file of files) {
		const fields = await api.metadata.read(file.path);
		for (const [key, value] of Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) {
			if (rows.length >= 2e3) break;
			rows.push([
				file.filename,
				key,
				String(value).slice(0, 4096)
			]);
		}
	}
	return {
		title: "EXIF extension report",
		text: "Read-only view; at most 2,000 fields. Original metadata is unchanged.",
		columns: [
			"File",
			"EXIF field",
			"Value"
		],
		rows
	};
} } };
//#endregion
export { main_default as default };
