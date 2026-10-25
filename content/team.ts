/**
 * The recurring teammates, so threads across every project read like one team. Seed files use
 * these for an issue's opening thread; later comments (team) name the same people.
 */
import type { Comment } from "./seed";

export const ada = (body: string): Comment => ({
  author: "Ada N",
  role: "Frontend",
  body,
});
export const lena = (body: string): Comment => ({
  author: "Lena M",
  role: "Product",
  body,
});
export const mateo = (body: string): Comment => ({
  author: "Mateo O",
  role: "Backend",
  body,
});
export const priya = (body: string): Comment => ({
  author: "Priya K",
  role: "Data",
  body,
});
export const sam = (body: string): Comment => ({ author: "Sam R", role: "SRE", body });
export const jo = (body: string): Comment => ({
  author: "Jo T",
  role: "Support",
  body,
});
export const rui = (body: string): Comment => ({
  author: "Rui F",
  role: "Finance",
  body,
});

