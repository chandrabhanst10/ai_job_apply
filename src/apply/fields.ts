import type { Frame } from "playwright";
import type { Profile } from "../profile";
import type { Settings } from "../settings";

export type Field = {
  id: string;
  kind: "text" | "textarea" | "select" | "radio" | "checkbox" | "file";
  label: string;
  required: boolean;
  options: string[];
  value: string;
};

/** Scan the form, tag elements with data-jp ids, and describe them. */
export async function collectFields(frame: Frame): Promise<Field[]> {
  return frame.evaluate(() => {
    const txt = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
    const vis = (e: Element) => {
      const r = (e as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e as HTMLElement).visibility !== "hidden";
    };
    const labelOf = (el: HTMLElement): string => {
      const aria = el.getAttribute("aria-label");
      if (aria) return txt(aria);
      const by = el.getAttribute("aria-labelledby");
      if (by) {
        const t = txt(by.split(" ").map((i) => document.getElementById(i)?.textContent).join(" "));
        if (t) return t;
      }
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return txt(l.textContent);
      }
      const wrap = el.closest("label");
      if (wrap) return txt(wrap.textContent);
      return txt(el.getAttribute("placeholder") || el.getAttribute("name"));
    };
    const isReq = (el: HTMLElement, label: string) =>
      (el as HTMLInputElement).required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(label);

    const out: any[] = [];
    const radios = new Map<string, HTMLInputElement[]>();
    let n = 0;
    document.querySelectorAll<HTMLElement>("input, textarea, select").forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const type = ((el as HTMLInputElement).type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset", "search"].includes(type)) return;
      if (type !== "file" && !vis(el)) return;
      if ((el as HTMLInputElement).disabled) return;
      if (type === "radio") {
        const name = (el as HTMLInputElement).name || `r${n}`;
        if (!radios.has(name)) radios.set(name, []);
        radios.get(name)!.push(el as HTMLInputElement);
        return;
      }
      const id = `f${n++}`;
      el.setAttribute("data-jp", id);
      const label = labelOf(el);
      const base = { id, label, required: isReq(el, label), options: [] as string[], value: "" };
      if (type === "file") out.push({ ...base, kind: "file" });
      else if (type === "checkbox") out.push({ ...base, kind: "checkbox", value: (el as HTMLInputElement).checked ? "yes" : "" });
      else if (tag === "select") {
        const sel = el as HTMLSelectElement;
        const opts = Array.from(sel.options);
        out.push({
          ...base,
          kind: "select",
          options: opts.map((o) => txt(o.textContent)).filter(Boolean),
          value: sel.selectedIndex > 0 && sel.value ? txt(opts[sel.selectedIndex].textContent) : "",
        });
      } else out.push({ ...base, kind: tag === "textarea" ? "textarea" : "text", value: (el as HTMLInputElement).value });
    });

    radios.forEach((els) => {
      const id = `f${n++}`;
      const options = els.map((r, i) => {
        r.setAttribute("data-jp-g", id);
        r.setAttribute("data-jp-o", String(i));
        return labelOf(r);
      });
      const anc = els[0].closest("fieldset,[role=radiogroup]") ?? els[0].parentElement?.parentElement;
      let label = txt(anc?.querySelector("legend")?.textContent);
      if (!label) {
        label = txt(anc?.textContent);
        options.forEach((o) => (label = label.replace(o, "")));
        label = txt(label).slice(0, 200);
      }
      out.push({
        id,
        kind: "radio",
        label,
        options,
        required: els.some((r) => r.required) || /\*\s*$/.test(label),
        value: els.some((r) => r.checked) ? "yes" : "",
      });
    });
    return out;
  }) as Promise<Field[]>;
}

/** Deterministic label -> value mapping. Returns null when the AI should answer. */
export function ruleValue(label: string, p: Profile, s: Settings): string | null {
  const l = label.toLowerCase();
  const [first, ...rest] = p.name.trim().split(/\s+/);
  const cur = p.workHistory[0];
  const t = (re: RegExp) => re.test(l);
  if (t(/first name|given name/)) return first;
  if (t(/last name|surname|family name/)) return rest.join(" ") || first;
  if (t(/full name|^name\b|your name|legal name/)) return p.name;
  if (t(/e-?mail/)) return p.email;
  if (t(/phone|mobile|contact number/)) return p.phone;
  if (t(/linkedin/)) return p.linkedin;
  if (t(/github|portfolio|website|personal site/)) return p.github;
  if (t(/notice/)) return s.noticePeriod;
  if (t(/expected.*(ctc|salary|compensation)|salary expectation|desired (salary|compensation)/)) return s.expectedSalary;
  if (t(/current.*(ctc|salary|compensation)/)) return s.currentSalary || null;
  if (t(/hybrid/)) return s.hybridOk ? "Yes" : "No";
  if (t(/holding.*offer|other offer|offer in hand/)) return s.holdingOffer ? "Yes" : "No";
  if (t(/preferred.*(location|city)|willing to relocate/)) return s.preferredCities.join(", ");
  if (t(/current (company|employer)/)) return cur?.company ?? null;
  if (t(/current (title|role|designation)|job title/)) return cur?.role ?? null;
  if (t(/total (years of )?experience|overall experience/))
    return p.totalExperienceYears != null ? String(Math.round(p.totalExperienceYears)) : null;
  if (t(/current location|^city\b|^location\b/)) return p.location;
  return null;
}

export function pickOption(options: string[], value: string): number {
  const v = value.trim().toLowerCase();
  const o = options.map((x) => x.trim().toLowerCase());
  let i = o.indexOf(v);
  if (i < 0) i = o.findIndex((x) => x.startsWith(v) || v.startsWith(x));
  if (i < 0) i = o.findIndex((x) => x && (x.includes(v) || v.includes(x)));
  return i;
}

export const CONSENT = /agree|consent|acknowledge|privacy|terms|certify|declare/i;
