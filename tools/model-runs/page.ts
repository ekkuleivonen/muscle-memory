/**
 * The headless page for model runs from a work machine: one BrowserPractice
 * (packages/model-runs/practice.ts) driven by ./practice.ts through `window.harness`.
 */
import type { StoredRecord } from "../../packages/domain/records";
import {
  BrowserPractice,
  type Edited,
  type Opened,
  type OpenConfig,
  type Ran,
  type Range,
} from "../../packages/model-runs/practice";

let practice: BrowserPractice | undefined;
const live = () => {
  if (!practice) throw new Error("practice is not open");
  return practice;
};

const harness = {
  async open(config: OpenConfig): Promise<Opened> {
    practice = await BrowserPractice.open(config, document.body);
    return practice.opened;
  },
  code: (): string => live().code(),
  edit: (old: string, replacement: string): Promise<Edited> => live().edit(old, replacement),
  write: (text: string): Promise<Edited> => live().write(text),
  run: (purpose: "examples" | "submit"): Promise<Ran> => live().run(purpose),
  close: (): Promise<Range> => live().close(),
  records: (): readonly StoredRecord[] => live().records,
};

declare global {
  interface Window {
    harness: typeof harness;
  }
}
window.harness = harness;
