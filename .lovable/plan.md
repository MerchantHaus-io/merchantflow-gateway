

## Make Home Page Icons Fully Opaque

The home page icon orbs and backgrounds currently use transparency (e.g. `bg-primary/15`, `bg-card/95`, `bg-card/60`, `border-primary/30`). This makes them look washed out. The fix is to make all icon containers and their backgrounds solid/opaque.

### Changes — `src/pages/Home.tsx`

1. **`bgColorMap`** — Change from `/15` (15% opacity) to full solid backgrounds:
   - `bg-primary/15` → `bg-primary` (with white icon text handled by `iconColorMap`)
   - Same for teal, gold, success, warning

2. **`borderColorMap`** — Change from `/30` to full opacity borders:
   - `border-primary/30` → `border-primary`

3. **`iconColorMap`** — Switch icon colors to white so they're visible on solid-colored backgrounds:
   - All values → `text-white`

4. **GridView card orbs** (line ~137) — Remove `border-white/10` on the inner orb div.

5. **IconView large orbs** (line ~178-184) — Replace `bg-card/95 dark:bg-card/60` with the solid `bgColorMap` color. Remove `backdrop-blur-sm` since background is now solid.

6. **Carousel3D** (`src/components/home/Carousel3D.tsx`) — Apply the same treatment:
   - `bgColorMap` entries → solid colors
   - `iconColorMap` entries → `text-white`

### Result
All home page icons will render with solid, vivid color backgrounds and white icons — no transparency or washed-out appearance.

