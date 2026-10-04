'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { CARD_GAP, CARD_HEIGHT, StackEngine, type Item } from './engine';

type Removed = { item: Item; index: number; dir: number };

const INITIAL: Item[] = [
  { id: '1', text: 'Потяни меня вверх или вниз' },
  { id: '2', text: 'Тащи резче — наклонится' },
  { id: '3', text: 'Швырни вбок, чтобы удалить' },
  { id: '4', text: '⌘Z вернёт обратно' },
  { id: '5', text: 'Пробел и стрелки тоже работают' },
];

export default function Stack() {
  const [items, setItems] = useState(INITIAL);
  const [trash, setTrash] = useState<Removed[]>([]);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const engine = useRef<StackEngine | null>(null);

  useEffect(() => {
    const e = new StackEngine(containerRef.current!, els.current, {
      reorder: (ids) =>
        setItems((prev) => {
          const byId = new Map(prev.map((i) => [i.id, i]));
          const moved = ids.flatMap((id) => byId.get(id) ?? []);
          // Улетающие карточки ещё в списке — держим их в хвосте до удаления.
          return [...moved, ...prev.filter((i) => !ids.includes(i.id))];
        }),
      remove: (item, index, dir) => {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setTrash((prev) => [...prev, { item, index, dir }]);
      },
      announce: setMessage,
    });
    engine.current = e;
    return () => {
      e.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.sync(items);
  }, [items]);

  const restore = () => {
    const last = trash.at(-1);
    if (!last) return;
    engine.current?.enter(last.item.id, last.dir);
    setTrash(trash.slice(0, -1));
    setItems((prev) => {
      const next = [...prev];
      next.splice(Math.min(last.index, next.length), 0, last.item);
      return next;
    });
    setMessage(`Возвращено: ${last.item.text}`);
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    // code, а не key: на русской раскладке key будет «я».
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyZ') {
      e.preventDefault();
      restore();
    }
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setItems((prev) => [...prev, { id: crypto.randomUUID(), text }]);
    setDraft('');
  };

  return (
    <div className="w-full max-w-sm">
      <header className="mb-6 flex items-baseline justify-between px-1 text-[13px]">
        <h1 className="font-medium text-zinc-900 dark:text-zinc-100">Сегодня</h1>
        <span className="font-mono tabular-nums text-zinc-400">{items.length}</span>
      </header>

      <div
        ref={containerRef}
        role="list"
        className="relative transition-[height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ height: INITIAL.length * (CARD_HEIGHT + CARD_GAP) - CARD_GAP }}>
        {items.map((item) => (
          <div
            key={item.id}
            ref={(el) => {
              els.current.set(item.id, el!);
              return () => {
                els.current.delete(item.id);
              };
            }}
            role="listitem"
            tabIndex={0}
            aria-roledescription="перетаскиваемая карточка"
            onPointerDown={(e) => engine.current?.pointerDown(item.id, e.nativeEvent)}
            onPointerMove={(e) => engine.current?.pointerMove(e.nativeEvent)}
            onPointerUp={(e) => engine.current?.pointerUp(e.nativeEvent)}
            onPointerCancel={(e) => engine.current?.pointerUp(e.nativeEvent)}
            onLostPointerCapture={(e) => engine.current?.pointerUp(e.nativeEvent)}
            onKeyDown={(e) => engine.current?.keyDown(item.id, e.nativeEvent)}
            className="group absolute inset-x-0 top-0 cursor-grab touch-none select-none outline-none active:cursor-grabbing"
            style={{ height: CARD_HEIGHT, opacity: 0 }}>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl shadow-[0_28px_50px_-18px_rgba(0,0,0,0.35),0_8px_16px_-8px_rgba(0,0,0,0.12)] dark:shadow-[0_28px_50px_-18px_rgba(0,0,0,0.9)]"
              style={{ opacity: 'var(--lift, 0)' }}
            />
            <div className="relative flex h-full items-center gap-4 rounded-2xl border border-black/[0.06] bg-white px-5 text-[15px] text-zinc-900 transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-zinc-400/50 dark:border-white/[0.07] dark:bg-zinc-900 dark:text-zinc-100">
              <span
                data-num
                aria-hidden
                className="w-5 font-mono text-[11px] tabular-nums text-zinc-400"
              />
              <span className="truncate">{item.text}</span>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="mt-[10px]">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="+ Новая карточка"
          aria-label="Новая карточка"
          className="h-16 w-full rounded-2xl border border-dashed border-black/[0.1] bg-transparent px-5 text-[15px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-black/[0.2] dark:border-white/[0.1] dark:text-zinc-100 dark:focus:border-white/[0.2]"
        />
      </form>

      <div className="mt-6 flex h-5 justify-center">
        <button
          type="button"
          onClick={restore}
          className={`font-mono text-[11px] text-zinc-400 transition-opacity duration-300 hover:text-zinc-600 dark:hover:text-zinc-300 ${
            trash.length ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}>
          вернуть · ⌘Z
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
