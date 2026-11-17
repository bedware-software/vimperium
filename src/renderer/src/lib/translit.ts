// Russian typed in Latin letters, for Find in page: "rojdenie" finds
// "рождение". The page's find takes one exact text at a time, so what's
// typed is tried as it is first and then, while nothing matches, as each
// Cyrillic reading of it here — the likeliest first: translit (several
// where a letter can be read two ways: j as ж or й, y as ы or й, c as ц or
// к, e as е or э), then the same keys on the Russian layout ("ghbdtn" →
// "привет"). The soft sign has no Latin letter in most people's translit:
// "den" won't find "день" unless typed "den'".

/** Longest first: a pair is read before its letters. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['shch', 'щ'], ['sch', 'щ'],
  ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'],
  ['yu', 'ю'], ['ju', 'ю'], ['ya', 'я'], ['ja', 'я'], ['yo', 'ё'], ['jo', 'ё'], ['eh', 'э'],
]

/** A letter's readings, the likeliest first. */
const LETTERS: Record<string, readonly string[]> = {
  a: ['а'], b: ['б'], v: ['в'], w: ['в'], g: ['г'], d: ['д'], e: ['е', 'э'], z: ['з'], i: ['и'],
  j: ['ж', 'й'], k: ['к'], l: ['л'], m: ['м'], n: ['н'], o: ['о'], p: ['п'], r: ['р'], s: ['с'],
  t: ['т'], u: ['у'], f: ['ф'], h: ['х'], c: ['ц', 'к'], y: ['ы', 'й'], x: ['кс'], q: ['к'],
  "'": ['ь'],
}

const VOWELS = 'аеёиоуыэюя'

/** The same keys on the Russian layout (ЙЦУКЕН over QWERTY). */
const LAYOUT: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю', '`': 'ё',
}

const MAX_READINGS = 4

/** `text`'s Cyrillic readings, the likeliest first; none when it has no
 *  Latin letter, or has Cyrillic already. */
export function cyrillicReadings(text: string): string[] {
  const lower = text.toLowerCase()
  if (!/[a-z]/.test(lower) || /[а-яё]/.test(lower)) return []

  // Translit: each reading so far, grown a letter (or a pair) at a time.
  let readings = ['']
  let i = 0
  while (i < lower.length) {
    const pair = PAIRS.find(([latin]) => lower.startsWith(latin, i))
    if (pair) {
      readings = readings.map((r) => r + pair[1])
      i += pair[0].length
      continue
    }
    const ch = lower[i]
    let options = LETTERS[ch] ?? [ch]
    // y after a vowel is й first (moy → мой), ы otherwise (ty → ты).
    if (ch === 'y') {
      const afterVowel = readings[0].length > 0 && VOWELS.includes(readings[0][readings[0].length - 1])
      if (afterVowel) options = ['й', 'ы']
    }
    // Every reading's likeliest letter first, then the second choices, so
    // the list stays likeliest-first as it's cut.
    const next: string[] = []
    for (const option of options) for (const r of readings) next.push(r + option)
    readings = next.slice(0, MAX_READINGS)
    i++
  }

  const out = readings.filter((r) => r !== lower)
  // The Russian layout's letters under the same keys, last.
  const layout = [...lower].map((ch) => LAYOUT[ch] ?? ch).join('')
  if (layout !== lower && !out.includes(layout)) out.push(layout)
  return out
}
