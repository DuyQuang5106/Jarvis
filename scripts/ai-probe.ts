import { writeFileSync } from 'node:fs';
import { createFostaProvider } from '../src/server/ai/fosta';
import { recommendMode, runProbe } from '../src/server/ai/probe';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Không có .env.local: dùng biến môi trường hiện có.
}

const baseUrl = process.env.AI_BASE_URL?.trim();
const apiKey = process.env.AI_API_KEY?.trim();
const model = process.env.AI_MODEL?.trim();
const missing = [!baseUrl && 'AI_BASE_URL', !apiKey && 'AI_API_KEY', !model && 'AI_MODEL'].filter(Boolean);
if (!baseUrl || !apiKey || !model) {
  console.error(`Thiếu biến môi trường: ${missing.join(', ')}. Điền vào .env.local rồi chạy lại.`);
  process.exit(1);
}

const report = await runProbe(createFostaProvider({ baseUrl, apiKey, model }));
const mode = recommendMode(report);
const ok = (b: boolean) => (b ? 'đạt' : 'trượt');

const md = `# Báo cáo probe provider AI

- Ngày chạy: ${new Date().toISOString()}
- Model: ${model}

| Kiểm tra | Kết quả |
|---|---|
| chat | ${ok(report.chat)} |
| streaming | ${ok(report.streaming)} |
| tools | ${report.tools.passed}/${report.tools.total} |
| json | ${report.json.passed}/${report.json.total} |

**Mode khuyến nghị: \`${mode}\`**
${report.notes.length ? `\n## Ghi chú\n\n${report.notes.map((n) => `- ${n}`).join('\n')}\n` : ''}`;
writeFileSync('docs/ai-probe-report.md', md);

console.log(`Mode khuyến nghị: ${mode}`);
if (!report.chat) {
  console.error('Provider không dùng được, đổi provider trước khi làm Phase 2');
  process.exit(1);
}
