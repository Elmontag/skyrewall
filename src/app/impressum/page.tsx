import Link from 'next/link';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { marked } from 'marked';

export const metadata = { title: 'Impressum – SkyRewall' };

export default async function ImpressumPage() {
  const prodPath = join(process.cwd(), 'public', 'impressum.md');
  const templatePath = join(process.cwd(), 'public', 'impressum.template.md');
  const mdPath = existsSync(prodPath) ? prodPath : templatePath;
  const md = readFileSync(mdPath, 'utf-8');
  const html = await marked.parse(md);

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sky-400 hover:underline text-sm mb-6 inline-block">← Zurück</Link>
        <article
          className="prose prose-invert prose-sky max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </main>
  );
}
