// Turns what Assel forwarded (texts and PDF presentations) into object fields with Claude.
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

export const Draft = z.object({
  name: z.string().nullable().describe('Название жилого комплекса, латиницей как у застройщика'),
  d: z.string().nullable().describe('Район Алании по-русски: Махмутлар, Оба, Кестель, Тосмур, Авсаллар, Каргыджак, Джикджилли, Клеопатра, Центр, Конаклы, Тюрклер, Инджекум, Окурджалар, Газипаша, Демирташ, Каякёй'),
  owner: z.boolean().describe('true, если продаёт собственник (вторичка); false, если застройщик'),
  price: z.number().nullable().describe('Цена в евро. null, если цены нет или она не в евро'),
  rooms: z.string().nullable().describe('Планировка в турецком формате: 1+1, 2+1, 3+1, 4+1, Вилла'),
  area: z.number().nullable().describe('Площадь брутто в м²'),
  sea: z.number().nullable().describe('Расстояние до моря в метрах'),
  floor: z.string().nullable().describe('Этаж, например «4 из 9»'),
  year: z.string().nullable().describe('Год сдачи, например «2026», или «Сдан», если дом готов'),
  tags: z.array(z.string()).describe('До 3 коротких меток из: Гражданство, Для семьи, У моря, Под ВНЖ, Под аренду, С мебелью, Вид на море. «Гражданство» ставь, только если цена от 400 000 $ (примерно от 345 000 €) или в исходнике прямо сказано, что объект подходит под гражданство'),
  hot: z.string().nullable().describe('Одна короткая плашка, если есть явный повод: «Новый», «Лучшая цена», «150 м до моря». Иначе null'),
  desc: z.string().describe('2–3 предложения по-русски от лица Assel: чем хорош объект и кому подходит. Только факты из исходника'),
  desc_en: z.string().describe('То же описание на английском'),
  desc_tr: z.string().describe('То же описание на турецком'),
  near: z.array(z.string()).describe('До 6 коротких пунктов «что рядом» из исходника, например «Пляж 350 м»'),
  near_en: z.array(z.string()).describe('Те же пункты near на английском, в том же порядке, например «Beach 350 m»'),
  near_tr: z.array(z.string()).describe('Те же пункты near на турецком, в том же порядке, например «Plaj 350 m»'),
  photo_ids: z.array(z.number()).describe('Только если в запросе есть список фото со страницы сайта: номера фото этой квартиры и комплекса, лучшее фото первым, планировки в конце, не больше 10. Не бери логотипы, иконки, фото сотрудников и других объектов. Иначе пустой список'),
  questions: z.array(z.string()).describe('Что непонятно или противоречит, коротко, чтобы Assel уточнила. Пусто, если всё ясно'),
});

const SYSTEM = `Ты помогаешь Assel Usmanova, менеджеру по продажам недвижимости в Алании, оформлять объекты для её сайта.
Она пересылает тебе сообщения застройщиков и собственников: тексты, иногда PDF-презентации, иногда ссылки на страницу объекта на сайте её агентства.
Цену со страницы сайта не бери, ставь null: цену Assel пишет сама.
На странице бывают блоки «Похожие объекты», формы и контакты менеджеров агентства: их игнорируй, бери только сам объект. Телефоны и имена сотрудников в описание не пиши.
Извлеки данные одной квартиры. Если в исходнике несколько квартир или планировок, возьми ту, что Assel явно выделила; если не выделила, возьми самую дешёвую и напиши об этом в questions.

Правила:
- Никогда не придумывай факты. Если цены, площади, расстояния до моря или чего-то ещё нет в исходнике, ставь null.
- Цену бери только в евро. Если цена в долларах или лирах, ставь null и напиши в questions, какая цена указана.
- Точный адрес не нужен и не должен попасть в описание: только комплекс и район.
- Описание пиши простым живым языком, без восклицательных знаков, без «уникальный», «элитный», «шикарный».
- Если какое-то сообщение Assel выглядит как её собственная заметка (например «собственник торгуется»), учти его, но не пиши в описание то, что не стоит видеть покупателю.`;

import { costOf } from './cost.js';

const client = () => new Anthropic();

async function ask(content) {
  const r = await client().messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'low', format: zodOutputFormat(Draft) },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  const cost = costOf(r.usage);
  if (r.stop_reason === 'refusal') throw Object.assign(new Error('Claude отказался разбирать этот текст'), { cost });
  if (!r.parsed_output) throw Object.assign(new Error('Не удалось разобрать ответ Claude'), { cost });
  return { draft: r.parsed_output, cost };
}

// Both return { draft, cost } with the cost of the call in USD.
// texts: string[], pdfs: Buffer[], pages: [{ url, title, text, images: [{ url, alt }] }]
export function parseListing({ texts, pdfs, pages = [] }) {
  let k = 0;
  const pageText = pages.map(p => `--- страница ${p.url} ---\nЗаголовок: ${p.title}\n${p.text}\n\nФото на странице:\n${p.images.map(i => `[${k++}] ${i.url}${i.alt ? ' (' + i.alt + ')' : ''}`).join('\n')}`).join('\n\n');
  const content = [
    ...pdfs.map(b => ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.toString('base64') } })),
    { type: 'text', text: `Вот что прислала Assel (сообщения по порядку):\n\n${texts.map((t, i) => `--- сообщение ${i + 1} ---\n${t}`).join('\n\n') || '(только PDF)'}${pageText ? '\n\nСтраницы по ссылкам из её сообщений:\n\n' + pageText : ''}` },
  ];
  return ask(content);
}

export function applyCorrection(draft, note) {
  return ask([{ type: 'text', text: `Вот текущие данные объекта:\n${JSON.stringify(draft, null, 2)}\n\nAssel просит исправить: «${note}»\n\nВерни все поля с учётом исправления. Остальное не меняй. Если меняется описание desc, обнови и его переводы desc_en и desc_tr. Если меняется список near, обнови near_en и near_tr.` }]);
}
