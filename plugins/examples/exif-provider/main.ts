import type { Plugin } from '../../sdk/typescript/index';
export default {
  commands: { async run(api) {
    const files = await api.selection.get(); const rows: string[][] = [];
    for (const file of files) {
      const fields = await api.metadata.read(file.path);
      for (const [key, value] of Object.entries(fields).sort(([a],[b]) => a.localeCompare(b))) {
        if (rows.length >= 2000) break;
        rows.push([file.filename, key, String(value).slice(0, 4096)]);
      }
    }
    return { title: 'EXIF extension report', text: 'Read-only view; at most 2,000 fields. Original metadata is unchanged.', columns: ['File', 'EXIF field', 'Value'], rows };
  } },
} satisfies Plugin;
