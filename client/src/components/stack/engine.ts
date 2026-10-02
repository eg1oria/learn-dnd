// Физика стопки: React владеет списком, движок — каждым пикселем.
// Позиции живут в пружинах и пишутся прямо в style.transform, без ререндеров.

export type Item = { id: string; text: string };

export const CARD_HEIGHT = 64;
export const CARD_GAP = 10;
const PITCH = CARD_HEIGHT + CARD_GAP;
const LIFT = 1.035;
const FLING_SPEED = 900; // px/s
const STEP = 1 / 240;

type Body = {
  x: number;
  y: number;
  r: number;
  s: number;
  o: number;
  vx: number;
  vy: number;
  vr: number;
  vs: number;
  wake: number;
  flying: boolean;
  num: string;
  z: number;
};

type Drag = {
  id: string;
  mode: "pointer" | "keyboard";
  pointerId: number;
  offX: number;
  offY: number;
  px: number;
  py: number;
  t: number;
  vx: number;
  vy: number;
  index: number;
  from: number;
  width: number;
};

export type Callbacks = {
  reorder(ids: string[]): void;
  remove(item: Item, index: number, dir: number): void;
  announce(message: string): void;
};

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

// Полунеявный Эйлер: устойчив при жёстких пружинах и маленьком шаге.
function spring(x: number, v: number, target: number, k: number, c: number, dt: number) {
  const nv = v + (-k * (x - target) - c * v) * dt;
  return [x + nv * dt, nv] as const;
}

export class StackEngine {
  private bodies = new Map<string, Body>();
  private labels = new Map<string, string>();
  private order: string[] = [];
  private drag: Drag | null = null;
  private entrances = new Map<string, number>();
  private timers = new Set<number>();
  private refocus: string | null = null;
  private synced = false;
  private height = -1;
  private raf = 0;
  private last = 0;

  constructor(
    private container: HTMLElement,
    private els: Map<string, HTMLElement>,
    private cb: Callbacks,
  ) {}

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.timers.forEach((t) => clearTimeout(t));
  }

  sync(items: Item[]) {
    const now = performance.now();
    this.labels = new Map(items.map((i) => [i.id, i.text]));
    for (const id of [...this.bodies.keys()]) {
      if (!this.labels.has(id)) this.bodies.delete(id);
    }
    this.order = items.map((i) => i.id).filter((id) => !this.bodies.get(id)?.flying);

    this.order.forEach((id, i) => {
      if (this.bodies.has(id)) return;
      const b: Body = {
        x: 0, y: i * PITCH, r: 0, s: 1, o: 0,
        vx: 0, vy: 0, vr: 0, vs: 0,
        wake: 0, flying: false, num: "", z: -1,
      };
      const dir = this.entrances.get(id);
      if (dir !== undefined) {
        // Возвращается с той стороны, куда улетела.
        b.x = dir * 360;
        b.r = dir * 14;
        this.entrances.delete(id);
      } else if (!this.synced) {
        b.y += 28;
        b.s = 0.97;
        b.wake = now + 120 + i * 70;
      } else {
        b.y += 16;
        b.s = 0.97;
      }
      this.bodies.set(id, b);
    });

    this.synced = true;
    if (this.refocus) {
      this.els.get(this.refocus)?.focus({ preventScroll: true });
      this.refocus = null;
    }
    this.kick();
  }

  enter(id: string, dir: number) {
    this.entrances.set(id, dir);
  }

  pointerDown(id: string, e: PointerEvent) {
    if (this.drag || e.button !== 0) return;
    const b = this.bodies.get(id);
    const el = this.els.get(id);
    if (!b || !el || b.flying) return;

    const rect = this.container.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const offX = px - b.x;
    const offY = py - b.y;
    // Карточка висит на пальце: вращение вокруг точки захвата.
    el.style.transformOrigin = `${offX}px ${offY}px`;
    el.setPointerCapture(e.pointerId);

    const index = this.order.indexOf(id);
    this.drag = {
      id, mode: "pointer", pointerId: e.pointerId,
      offX, offY, px, py, t: e.timeStamp, vx: 0, vy: 0,
      index, from: index, width: rect.width,
    };
    b.vx = b.vy = 0;
    this.kick();
  }

  pointerMove(e: PointerEvent) {
    const d = this.drag;
    if (!d || d.mode !== "pointer" || e.pointerId !== d.pointerId) return;
    const rect = this.container.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const dt = e.timeStamp - d.t;
    if (dt > 0) {
      const k = Math.min(1, dt / 32);
      d.vx += (((px - d.px) / dt) * 1000 - d.vx) * k;
      d.vy += (((py - d.py) / dt) * 1000 - d.vy) * k;
    }
    d.px = px;
    d.py = py;
    d.t = e.timeStamp;

    const b = this.bodies.get(d.id);
    if (!b) return;
    b.x = px - d.offX;
    b.y = py - d.offY;
    d.index = clamp(Math.round(b.y / PITCH), 0, this.order.length - 1);
  }

  pointerUp(e: PointerEvent) {
    const d = this.drag;
    if (!d || d.mode !== "pointer" || e.pointerId !== d.pointerId) return;
    // Остановился перед отпусканием — значит, не бросок.
    const fresh = e.timeStamp - d.t < 80;
    const vx = fresh ? clamp(d.vx, -3000, 3000) : 0;
    const vy = fresh ? clamp(d.vy, -3000, 3000) : 0;

    if (Math.abs(vx) > FLING_SPEED && Math.abs(vx) > Math.abs(vy)) {
      this.fling(d.id, vx, vy);
      return;
    }
    const b = this.bodies.get(d.id);
    if (b) {
      b.vx = vx;
      b.vy = vy;
    }
    this.drop();
  }

  keyDown(id: string, e: KeyboardEvent) {
    const d = this.drag;
    if (d?.mode === "keyboard" && d.id === id) {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const step = e.key === "ArrowUp" ? -1 : 1;
        const next = clamp(d.index + step, 0, this.order.length - 1);
        if (next !== d.index) {
          d.index = next;
          const b = this.bodies.get(id);
          if (b) b.vr += step * 90;
          this.cb.announce(`${this.labels.get(id)}: ${next + 1} из ${this.order.length}`);
          this.kick();
        }
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        this.drop();
      } else if (e.key === "Escape") {
        e.preventDefault();
        d.index = d.from;
        this.drop();
      }
      return;
    }
    if (d) return;

    const i = this.order.indexOf(id);
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const el = this.els.get(id);
      if (el) el.style.transformOrigin = "50% 50%";
      this.drag = {
        id, mode: "keyboard", pointerId: -1,
        offX: 0, offY: 0, px: 0, py: 0, t: 0, vx: 0, vy: 0,
        index: i, from: i, width: 0,
      };
      this.cb.announce(
        `Взято: ${this.labels.get(id)}. Стрелки — двигать, пробел — положить, Esc — отмена`,
      );
      this.kick();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const target = this.order[i + (e.key === "ArrowUp" ? -1 : 1)];
      if (target) this.els.get(target)?.focus({ preventScroll: true });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const neighbour = this.order[i + 1] ?? this.order[i - 1];
      this.fling(id, 1600, -200);
      if (neighbour) this.els.get(neighbour)?.focus({ preventScroll: true });
    }
  }

  private drop() {
    const d = this.drag;
    if (!d) return;
    const next = this.visual();
    this.drag = null;
    const changed = next.some((id, i) => id !== this.order[i]);
    this.order = next;
    if (changed) {
      // React переставит DOM-узлы и уронит фокус — вернём его после sync.
      if (d.mode === "keyboard") this.refocus = d.id;
      this.cb.reorder(next);
    }
    if (d.mode === "keyboard") {
      const label = this.labels.get(d.id);
      this.cb.announce(
        changed ? `${label}: место ${next.indexOf(d.id) + 1}` : `${label}: без изменений`,
      );
    }
    this.kick();
  }

  private fling(id: string, vx: number, vy: number) {
    const b = this.bodies.get(id);
    if (!b || b.flying) return;
    const index = this.order.indexOf(id);
    if (this.drag?.id === id) this.drag = null;

    b.flying = true;
    b.vx = vx;
    b.vy = vy * 0.5 - 300;
    b.vr = vx * 0.05;
    this.order = this.order.filter((x) => x !== id);

    const item = { id, text: this.labels.get(id) ?? "" };
    const dir = Math.sign(vx) || 1;
    const t = window.setTimeout(() => {
      this.timers.delete(t);
      this.cb.remove(item, index, dir);
    }, 600);
    this.timers.add(t);
    this.cb.announce(`Удалено: ${item.text}. ⌘Z — вернуть`);
    this.kick();
  }

  private visual() {
    const d = this.drag;
    if (!d) return this.order;
    const rest = this.order.filter((id) => id !== d.id);
    if (rest.length === this.order.length) return this.order;
    rest.splice(clamp(d.index, 0, rest.length), 0, d.id);
    return rest;
  }

  private kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (t: number) => {
    const dt = clamp((t - this.last) / 1000, 0, 1 / 30);
    this.last = t;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const d = this.drag;
    let busy = d !== null;

    // Палец замер — наклон плавно уходит.
    if (d?.mode === "pointer" && t - d.t > 40) d.vx *= Math.exp(-dt * 12);

    this.visual().forEach((id, i) => {
      const b = this.bodies.get(id);
      if (!b) return;
      if (t < b.wake) {
        busy = true;
        this.paint(id, b, i);
        return;
      }
      const held = d?.id === id;
      const follow = held && d.mode === "pointer";
      const tx = 0;
      const ty = i * PITCH;
      const tr = follow ? clamp(d.vx * 0.012, -12, 12) : 0;
      const ts = held ? LIFT : 1;
      const to = follow ? 1 - Math.min(1, Math.abs(b.x) / (d.width * 0.9)) * 0.6 : 1;

      for (let n = 0; n < steps; n++) {
        if (!follow) {
          [b.x, b.vx] = spring(b.x, b.vx, tx, 420, 30, h);
          [b.y, b.vy] = spring(b.y, b.vy, ty, 420, 30, h);
        }
        [b.r, b.vr] = spring(b.r, b.vr, tr, 260, 16, h);
        [b.s, b.vs] = spring(b.s, b.vs, ts, 500, 26, h);
      }
      b.o += (to - b.o) * Math.min(1, dt * 12);

      const settled =
        Math.abs(b.x - tx) < 0.05 && Math.abs(b.vx) < 0.05 &&
        Math.abs(b.y - ty) < 0.05 && Math.abs(b.vy) < 0.05 &&
        Math.abs(b.r - tr) < 0.01 && Math.abs(b.vr) < 0.05 &&
        Math.abs(b.s - ts) < 0.0005 && Math.abs(b.vs) < 0.001 &&
        Math.abs(b.o - to) < 0.005;
      if (settled && !held) {
        b.x = tx; b.y = ty; b.r = tr; b.s = ts; b.o = to;
        b.vx = b.vy = b.vr = b.vs = 0;
      } else {
        busy = true;
      }
      this.paint(id, b, i);
    });

    for (const [id, b] of this.bodies) {
      if (!b.flying) continue;
      b.vy += 2400 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.r += b.vr * dt;
      b.o = Math.max(0, b.o - dt * 2.2);
      busy = true;
      this.paint(id, b, -1);
    }

    const height = Math.max(0, this.order.length * PITCH - CARD_GAP);
    if (height !== this.height) {
      this.container.style.height = `${height}px`;
      this.height = height;
    }

    this.raf = busy ? requestAnimationFrame(this.frame) : 0;
  };

  private paint(id: string, b: Body, index: number) {
    const el = this.els.get(id);
    if (!el) return;
    el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) rotate(${b.r}deg) scale(${b.s})`;
    el.style.opacity = String(b.o);
    el.style.setProperty("--lift", String(clamp((b.s - 1) / (LIFT - 1), 0, 1)));

    const z = this.drag?.id === id ? 3 : b.flying ? 2 : b.s > 1.002 ? 1 : 0;
    if (z !== b.z) {
      el.style.zIndex = String(z);
      b.z = z;
    }
    // Номера пересчитываются на лету, пока карточка в пути.
    if (index >= 0) {
      const num = String(index + 1).padStart(2, "0");
      if (num !== b.num) {
        const node = el.querySelector("[data-num]");
        if (node) node.textContent = num;
        b.num = num;
      }
    }
  }
}
