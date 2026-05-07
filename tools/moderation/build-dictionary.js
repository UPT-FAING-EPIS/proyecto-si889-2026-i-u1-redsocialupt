import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProfanityEngine } from '@coffeeandfun/google-profanity-words';

const __dirname = dirname(fileURLToPath(import.meta.url));

const COUNTRY_CODES = [
  'ARG', 'BOL', 'CHL', 'COL', 'CRI', 'CUB', 'DOM', 'ECU',
  'ESP', 'GTM', 'HND', 'MEX', 'NIC', 'PAN', 'PER', 'PRI',
  'PRY', 'SLV', 'URY', 'VEN',
];

const OUTPUT_TARGETS = [
  resolve(__dirname, '..', '..', 'posts-service', 'app', 'Support', 'Moderation'),
  resolve(__dirname, '..', '..', 'chat-service', 'app', 'Support', 'Moderation'),
];

function normalizeWord(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^['"`´-]+|['"`´-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeWords(lines) {
  return lines
    .map(normalizeWord)
    .filter((word) => word.length >= 2)
    .filter((word) => /[a-zñ]/i.test(word))
    .filter((word) => !word.startsWith('#'));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'upt-moderation-builder',
      'Accept': 'text/plain, application/json;q=0.9, */*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo descargar ${url}: ${response.status}`);
  }

  return await response.text();
}

async function buildDictionary() {
  const googleEngine = new ProfanityEngine({ language: 'es', testMode: true });
  const googleWords = await googleEngine.all();

  const countrySources = await Promise.all(
    COUNTRY_CODES.map(async (code) => {
      const url = `https://raw.githubusercontent.com/jfreddypuentes/spanlp/master/spanlp/dataset/${code}.txt`;
      const text = await fetchText(url);
      return {
        code,
        words: sanitizeWords(text.split(/\r?\n/)),
      };
    })
  );

  const allWords = new Set([
    ...sanitizeWords(googleWords),
    ...countrySources.flatMap((source) => source.words),
  ]);

  const mergedWords = Array.from(allWords).sort((a, b) => a.localeCompare(b, 'es'));

  const metadata = {
    generated_at: new Date().toISOString(),
    google_language: 'es',
    sources: [
      'npm:@coffeeandfun/google-profanity-words (es)',
      ...countrySources.map((source) => `spanlp:${source.code}`),
    ],
    counts: {
      google_words: sanitizeWords(googleWords).length,
      country_words: countrySources.reduce((sum, source) => sum + source.words.length, 0),
      merged_words: mergedWords.length,
    },
  };

  for (const targetDir of OUTPUT_TARGETS) {
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, 'profanity-es-hispano.txt'), `${mergedWords.join('\n')}\n`, 'utf8');
    await writeFile(join(targetDir, 'profanity-es-hispano.meta.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  }

  console.log(`Diccionario generado con ${mergedWords.length} entradas.`);
}

buildDictionary().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
